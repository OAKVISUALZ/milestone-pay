import {
  Address,
  Contract,
  Operation,
  rpc,
  scValToNative,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import {
  TESTNET_NETWORK_PASSPHRASE,
  TESTNET_RPC_URL,
} from "@milestone-pay/shared";
import {
  EscrowEventPayload,
  ClientConfig,
} from "./types.js";

export class MilestoneEscrowClient {
  public readonly contractId: string;
  public readonly rpcUrl: string;
  public readonly networkPassphrase: string;
  private readonly contract: Contract;
  private server: rpc.Server;

  constructor(config: ClientConfig) {
    this.contractId = config.contractId;
    this.rpcUrl = config.rpcUrl || TESTNET_RPC_URL;
    this.networkPassphrase = config.networkPassphrase || TESTNET_NETWORK_PASSPHRASE;
    this.contract = new Contract(this.contractId);
    this.server = new rpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith("http://"),
    });
  }

  /**
   * Generates an Operation to create a new agreement on-chain.
   */
  public createAgreementOp(params: {
    client: string;
    freelancer: string;
    token: string;
    milestoneAmount: bigint;
  }): xdr.Operation {
    return this.contract.call(
      "create_agreement",
      new Address(params.client).toScVal(),
      new Address(params.freelancer).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.milestoneAmount, { type: "i128" })
    );
  }

  /**
   * Generates an Operation to fund an existing milestone.
   */
  public fundMilestoneOp(params: {
    agreementId: number | bigint;
    milestoneId: number;
  }): xdr.Operation {
    return this.contract.call(
      "fund_milestone",
      nativeToScVal(BigInt(params.agreementId), { type: "u64" }),
      nativeToScVal(params.milestoneId, { type: "u32" })
    );
  }

  /**
   * Generates an Operation to release an escrowed milestone to the freelancer.
   */
  public releaseMilestoneOp(params: {
    agreementId: number | bigint;
    milestoneId: number;
  }): xdr.Operation {
    return this.contract.call(
      "release_milestone",
      nativeToScVal(BigInt(params.agreementId), { type: "u64" }),
      nativeToScVal(params.milestoneId, { type: "u32" })
    );
  }

  /**
   * Generates an Operation to execute a mutual refund to the client.
   * Note: The transaction must include authorization from both client and freelancer.
   */
  public refundMilestoneOp(params: {
    agreementId: number | bigint;
    milestoneId: number;
  }): xdr.Operation {
    return this.contract.call(
      "refund_milestone",
      nativeToScVal(BigInt(params.agreementId), { type: "u64" }),
      nativeToScVal(params.milestoneId, { type: "u32" })
    );
  }

  /**
   * Generates an Operation to cancel an unfunded milestone.
   */
  public cancelMilestoneOp(params: {
    agreementId: number | bigint;
    milestoneId: number;
  }): xdr.Operation {
    return this.contract.call(
      "cancel_milestone",
      nativeToScVal(BigInt(params.agreementId), { type: "u64" }),
      nativeToScVal(params.milestoneId, { type: "u32" })
    );
  }

  /**
   * Fetch contract events filtered by contract ID.
   */
  public async getContractEvents(options: {
    startLedger?: number;
    cursor?: string;
    limit?: number;
  }): Promise<{ events: EscrowEventPayload[]; cursor?: string }> {
    const filter: rpc.Api.EventFilter = {
      type: "contract",
      contractIds: [this.contractId],
    };

    const response = await this.server.getEvents({
      filters: [filter],
      startLedger: options.cursor ? undefined : options.startLedger,
      cursor: options.cursor,
      limit: options.limit,
    });

    const parsedEvents: EscrowEventPayload[] = [];
    const rawEvents = response.events || [];

    for (const ev of rawEvents) {
      try {
        const topic0 = ev.topic[0] ? scValToNative(ev.topic[0]) : null;
        const topic1 = ev.topic[1] ? scValToNative(ev.topic[1]) : null;
        const topic2 = ev.topic[2] ? scValToNative(ev.topic[2]) : null;
        const dataVal = ev.value ? scValToNative(ev.value) : null;

        if (topic0 === "ag_create") {
          parsedEvents.push({
            type: "agreement_created",
            agreementId: Number(topic1),
            party: dataVal ? dataVal[0] : undefined,
            rawEvent: ev,
          });
        } else if (topic0 === "ms_fund") {
          parsedEvents.push({
            type: "milestone_funded",
            agreementId: Number(topic1),
            milestoneId: Number(topic2),
            amount: typeof dataVal === "bigint" ? dataVal : BigInt(dataVal || 0),
            rawEvent: ev,
          });
        } else if (topic0 === "ms_rel") {
          parsedEvents.push({
            type: "milestone_released",
            agreementId: Number(topic1),
            milestoneId: Number(topic2),
            party: dataVal ? dataVal[0] : undefined,
            amount: dataVal ? BigInt(dataVal[1] || 0) : undefined,
            rawEvent: ev,
          });
        } else if (topic0 === "ms_ref") {
          parsedEvents.push({
            type: "milestone_refunded",
            agreementId: Number(topic1),
            milestoneId: Number(topic2),
            party: dataVal ? dataVal[0] : undefined,
            amount: dataVal ? BigInt(dataVal[1] || 0) : undefined,
            rawEvent: ev,
          });
        } else if (topic0 === "ms_canc") {
          parsedEvents.push({
            type: "milestone_cancelled",
            agreementId: Number(topic1),
            milestoneId: Number(topic2),
            rawEvent: ev,
          });
        }
      } catch {
        // Skip unparseable event gracefully
      }
    }

    const latestCursor = response.cursor || options.cursor;

    return {
      events: parsedEvents,
      cursor: latestCursor,
    };
  }
}
