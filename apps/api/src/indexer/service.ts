import { MilestoneEscrowClient } from "@milestone-pay/sdk";
import { TESTNET_RPC_URL } from "@milestone-pay/shared";
import { prisma } from "../db/client.js";

export class IndexerService {
  private client: MilestoneEscrowClient;
  private contractId: string;
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(contractId: string, rpcUrl: string = TESTNET_RPC_URL) {
    this.contractId = contractId;
    this.client = new MilestoneEscrowClient({
      contractId,
      rpcUrl,
    });
  }

  /**
   * Process a single poll cycle of events from Soroban RPC.
   */
  public async pollEvents(): Promise<{ processedCount: number; newCursor?: string }> {
    if (!this.contractId || this.contractId === "MOCK_CONTRACT_ID") {
      return { processedCount: 0 };
    }

    // Load or initialize indexer state
    let state = await prisma.indexerState.findUnique({
      where: { id: "default" },
    });

    if (!state) {
      state = await prisma.indexerState.create({
        data: {
          id: "default",
          contractId: this.contractId,
          lastLedger: 0,
          lastCursor: null,
        },
      });
    }

    let result;
    try {
      result = await this.client.getContractEvents({
        cursor: state.lastCursor || undefined,
        limit: 50,
      });
    } catch (err: any) {
      console.error(`[Indexer] RPC error fetching events: ${err.message}`);
      return { processedCount: 0 };
    }

    const { events, cursor } = result;
    if (!events || events.length === 0) {
      if (cursor && cursor !== state.lastCursor) {
        await prisma.indexerState.update({
          where: { id: "default" },
          data: { lastCursor: cursor },
        });
      }
      return { processedCount: 0, newCursor: cursor };
    }

    let processedCount = 0;

    for (const ev of events) {
      const stableEventId =
        ev.rawEvent?.id ||
        `${ev.rawEvent?.txHash || "tx"}_${ev.type}_${ev.agreementId}_${ev.milestoneId ?? 0}`;

      // Idempotency check: Deduplicate using stable event identifier
      const existing = await prisma.processedEvent.findUnique({
        where: { id: stableEventId },
      });

      if (existing) {
        continue;
      }

      const txHash = ev.rawEvent?.txHash || null;
      const ledger = ev.rawEvent?.ledger ? Number(ev.rawEvent.ledger) : 0;

      // Apply state update
      await this.applyEventUpdate(ev, txHash);

      // Record processed event
      await prisma.processedEvent.create({
        data: {
          id: stableEventId,
          contractId: this.contractId,
          eventType: ev.type,
          ledger,
          txHash,
          agreementId: ev.agreementId,
          milestoneId: ev.milestoneId || null,
          payload: JSON.stringify(ev),
        },
      });

      processedCount++;
    }

    // Persist durable cursor
    if (cursor) {
      await prisma.indexerState.update({
        where: { id: "default" },
        data: {
          lastCursor: cursor,
          updatedAt: new Date(),
        },
      });
    }

    return { processedCount, newCursor: cursor };
  }

  private async applyEventUpdate(ev: any, txHash: string | null) {
    if (ev.type === "agreement_created") {
      // Find unlinked project matching client and freelancer or link by agreementId
      const unlinkedProject = await prisma.project.findFirst({
        where: {
          agreementId: null,
          tokenAddress: ev.party || undefined,
        },
      });

      if (unlinkedProject) {
        await prisma.project.update({
          where: { id: unlinkedProject.id },
          data: { agreementId: ev.agreementId, status: "ACTIVE" },
        });
      }
    } else if (ev.type === "milestone_funded") {
      const project = await prisma.project.findUnique({
        where: { agreementId: ev.agreementId },
      });

      if (project) {
        await prisma.milestone.updateMany({
          where: {
            projectId: project.id,
            milestoneIndex: ev.milestoneId,
          },
          data: {
            status: "FUNDED",
            fundedTxHash: txHash,
          },
        });
      }
    } else if (ev.type === "milestone_released") {
      const project = await prisma.project.findUnique({
        where: { agreementId: ev.agreementId },
      });

      if (project) {
        await prisma.milestone.updateMany({
          where: {
            projectId: project.id,
            milestoneIndex: ev.milestoneId,
          },
          data: {
            status: "RELEASED",
            releasedTxHash: txHash,
          },
        });

        // Check if all milestones are released
        const allMilestones = await prisma.milestone.findMany({
          where: { projectId: project.id },
        });
        const allReleased = allMilestones.every((m: any) => m.status === "RELEASED");
        if (allReleased) {
          await prisma.project.update({
            where: { id: project.id },
            data: { status: "COMPLETED" },
          });
        }
      }
    } else if (ev.type === "milestone_refunded") {
      const project = await prisma.project.findUnique({
        where: { agreementId: ev.agreementId },
      });

      if (project) {
        await prisma.milestone.updateMany({
          where: {
            projectId: project.id,
            milestoneIndex: ev.milestoneId,
          },
          data: {
            status: "REFUNDED",
            refundedTxHash: txHash,
          },
        });
      }
    } else if (ev.type === "milestone_cancelled") {
      const project = await prisma.project.findUnique({
        where: { agreementId: ev.agreementId },
      });

      if (project) {
        await prisma.milestone.updateMany({
          where: {
            projectId: project.id,
            milestoneIndex: ev.milestoneId,
          },
          data: {
            status: "CANCELLED",
          },
        });
      }
    }
  }

  public start(intervalMs: number = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalTimer = setInterval(async () => {
      try {
        await this.pollEvents();
      } catch (err) {
        console.error("[Indexer] Uncaught error in poll cycle:", err);
      }
    }, intervalMs);
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
  }
}
