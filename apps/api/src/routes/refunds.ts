import { Router, Request, Response } from "express";
import {
  TESTNET_NETWORK_PASSPHRASE,
  TESTNET_RPC_URL,
  ProposeRefundSchema,
  SignRefundSchema,
} from "@milestone-pay/shared";
import { verifyRefundEnvelope } from "@milestone-pay/sdk";
import { rpc, TransactionBuilder, Transaction } from "@stellar/stellar-sdk";
import { prisma } from "../db/client.js";

export const refundsRouter = Router({ mergeParams: true });

function getAuthAddress(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    const raw = Buffer.from(authHeader.slice(7), "base64").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.exp && parsed.exp < Date.now()) {
      return null;
    }
    return parsed.sub || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/projects/:projectId/milestones/:milestoneId/refund
 * Retrieve the active refund proposal for a milestone.
 */
refundsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { where: { id: milestoneId } } },
    });

    if (!project || project.milestones.length === 0) {
      res.status(404).json({ error: "Project or milestone not found" });
      return;
    }

    if (project.clientAddress !== caller && project.freelancerAddress !== caller) {
      res.status(403).json({ error: "Unauthorized: You are not a participant in this project" });
      return;
    }

    const proposal = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: { in: ["PROPOSED", "CO_SIGNED", "SUBMITTED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!proposal) {
      res.json({ data: null });
      return;
    }

    // Check expiration
    if (proposal.status === "PROPOSED" && new Date() > proposal.expiresAt) {
      const expired = await prisma.refundProposal.update({
        where: { id: proposal.id },
        data: { status: "EXPIRED" },
      });
      res.json({ data: expired });
      return;
    }

    res.json({ data: proposal });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch refund proposal", message: err.message });
  }
});

/**
 * POST /api/projects/:projectId/milestones/:milestoneId/refund/propose
 * Initiate a mutual-refund proposal with the first party's signature.
 */
refundsRouter.post("/propose", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const parseResult = ProposeRefundSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const { envelopeXdr } = parseResult.data;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { where: { id: milestoneId } } },
    });

    if (!project || project.milestones.length === 0) {
      res.status(404).json({ error: "Project or milestone not found" });
      return;
    }

    const milestone = project.milestones[0];

    if (project.clientAddress !== caller && project.freelancerAddress !== caller) {
      res.status(403).json({ error: "Unauthorized: Only project client or freelancer can propose refund" });
      return;
    }

    if (!project.agreementId) {
      res.status(400).json({ error: "Agreement is not linked on-chain" });
      return;
    }

    // Resolve contract ID
    const contractId = process.env.ESCROW_CONTRACT_ID || "CB2PHGNBGYOCX2ELVI2PH2YMGIXN4JA2ORMTKZ63VGFCXS5DCL2BEZXH";

    // Validate envelope structure and signatures
    const verification = verifyRefundEnvelope({
      envelopeXdr,
      contractId,
      agreementId: project.agreementId,
      milestoneIndex: milestone.milestoneIndex,
      clientAddress: project.clientAddress,
      freelancerAddress: project.freelancerAddress,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    });

    if (!verification.valid) {
      res.status(400).json({ error: "Invalid refund transaction envelope", details: verification.error });
      return;
    }

    // Ensure the caller's signature is present
    const isClient = caller === project.clientAddress;
    if (isClient && !verification.clientSigned) {
      res.status(400).json({ error: "Transaction must be signed by the client" });
      return;
    }
    if (!isClient && !verification.freelancerSigned) {
      res.status(400).json({ error: "Transaction must be signed by the freelancer" });
      return;
    }

    // Check for existing active proposals
    const existing = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: { in: ["CO_SIGNED", "SUBMITTED"] },
      },
    });

    if (existing) {
      res.status(409).json({
        error: "An active refund proposal is already co-signed or submitted",
        proposal: existing,
      });
      return;
    }

    // Mark previous PROPOSED ones as superseded
    await prisma.refundProposal.updateMany({
      where: {
        projectId,
        milestoneId,
        status: "PROPOSED",
      },
      data: { status: "EXPIRED" },
    });

    const isFullyCoSigned = verification.clientSigned && verification.freelancerSigned;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const proposal = await prisma.refundProposal.create({
      data: {
        projectId,
        milestoneId,
        agreementId: project.agreementId,
        milestoneIndex: milestone.milestoneIndex,
        initiatorAddress: caller,
        envelopeXdr,
        txHash: verification.txHash,
        clientSigned: verification.clientSigned,
        freelancerSigned: verification.freelancerSigned,
        status: isFullyCoSigned ? "CO_SIGNED" : "PROPOSED",
        expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      proposal,
      message: isFullyCoSigned
        ? "Refund transaction is fully co-signed and ready for network submission."
        : "Refund proposal created. Awaiting counter-party signature.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create refund proposal", message: err.message });
  }
});

/**
 * POST /api/projects/:projectId/milestones/:milestoneId/refund/sign
 * Counter-party reviews and signs the refund proposal.
 */
refundsRouter.post("/sign", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const parseResult = SignRefundSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const { envelopeXdr } = parseResult.data;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { where: { id: milestoneId } } },
    });

    if (!project || project.milestones.length === 0) {
      res.status(404).json({ error: "Project or milestone not found" });
      return;
    }

    if (project.clientAddress !== caller && project.freelancerAddress !== caller) {
      res.status(403).json({ error: "Unauthorized: Only project participants can sign refund proposal" });
      return;
    }

    const proposal = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: "PROPOSED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!proposal) {
      res.status(404).json({ error: "No pending refund proposal found to sign" });
      return;
    }

    if (new Date() > proposal.expiresAt) {
      await prisma.refundProposal.update({
        where: { id: proposal.id },
        data: { status: "EXPIRED" },
      });
      res.status(400).json({ error: "The refund proposal has expired. Please initiate a fresh proposal." });
      return;
    }

    const contractId = process.env.ESCROW_CONTRACT_ID || "CB2PHGNBGYOCX2ELVI2PH2YMGIXN4JA2ORMTKZ63VGFCXS5DCL2BEZXH";

    const verification = verifyRefundEnvelope({
      envelopeXdr,
      contractId,
      agreementId: proposal.agreementId,
      milestoneIndex: proposal.milestoneIndex,
      clientAddress: project.clientAddress,
      freelancerAddress: project.freelancerAddress,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    });

    if (!verification.valid) {
      res.status(400).json({ error: "Invalid transaction envelope", details: verification.error });
      return;
    }

    // Critical invariant: Transaction hash MUST match the proposed envelope hash!
    if (verification.txHash !== proposal.txHash) {
      res.status(400).json({
        error: "Transaction hash mismatch: The signed transaction does not match the proposed transaction. Envelope parameters may have been altered.",
      });
      return;
    }

    // Verify caller signed
    const isClient = caller === project.clientAddress;
    if (isClient && !verification.clientSigned) {
      res.status(400).json({ error: "Client signature missing from envelope" });
      return;
    }
    if (!isClient && !verification.freelancerSigned) {
      res.status(400).json({ error: "Freelancer signature missing from envelope" });
      return;
    }

    const bothSigned = verification.clientSigned && verification.freelancerSigned;

    const updated = await prisma.refundProposal.update({
      where: { id: proposal.id },
      data: {
        envelopeXdr,
        clientSigned: verification.clientSigned,
        freelancerSigned: verification.freelancerSigned,
        status: bothSigned ? "CO_SIGNED" : "PROPOSED",
      },
    });

    res.json({
      success: true,
      proposal: updated,
      message: bothSigned
        ? "Both parties have authorized the refund. Transaction is ready to submit to Stellar."
        : "Signature appended.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to sign refund proposal", message: err.message });
  }
});

/**
 * POST /api/projects/:projectId/milestones/:milestoneId/refund/submit
 * Submit the co-signed refund transaction to Stellar Testnet.
 */
refundsRouter.post("/submit", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { where: { id: milestoneId } } },
    });

    if (!project || project.milestones.length === 0) {
      res.status(404).json({ error: "Project or milestone not found" });
      return;
    }

    if (project.clientAddress !== caller && project.freelancerAddress !== caller) {
      res.status(403).json({ error: "Unauthorized: Only project participants can submit refund" });
      return;
    }

    const proposal = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: "CO_SIGNED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!proposal) {
      res.status(400).json({ error: "No co-signed refund proposal found ready for submission" });
      return;
    }

    const server = new rpc.Server(TESTNET_RPC_URL);
    const tx = TransactionBuilder.fromXDR(proposal.envelopeXdr, TESTNET_NETWORK_PASSPHRASE) as Transaction;

    const sendRes = await server.sendTransaction(tx);
    if (sendRes.status === "ERROR") {
      res.status(400).json({
        error: "Stellar RPC submission failed",
        errorResult: sendRes.errorResult,
        hash: sendRes.hash,
      });
      return;
    }

    // Persist original transaction hash and set status to SUBMITTED
    const updated = await prisma.refundProposal.update({
      where: { id: proposal.id },
      data: {
        status: "SUBMITTED",
        submittedTxHash: sendRes.hash,
      },
    });

    res.json({
      success: true,
      txHash: sendRes.hash,
      proposal: updated,
      message: "Transaction submitted to Stellar network. Confirmation is verified via on-chain indexer events.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to submit transaction", message: err.message });
  }
});

/**
 * POST /api/projects/:projectId/milestones/:milestoneId/refund/recheck
 * Recheck on-chain status of a submitted refund transaction to handle confirmation timeouts.
 */
refundsRouter.post("/recheck", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);

  try {
    const proposal = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: { in: ["SUBMITTED", "CONFIRMED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!proposal || !proposal.submittedTxHash) {
      res.status(404).json({ error: "No submitted refund proposal to recheck" });
      return;
    }

    const server = new rpc.Server(TESTNET_RPC_URL);
    const txStatus = await server.getTransaction(proposal.submittedTxHash);

    if (txStatus.status === "SUCCESS") {
      await prisma.refundProposal.update({
        where: { id: proposal.id },
        data: { status: "CONFIRMED" },
      });

      await prisma.milestone.update({
        where: { id: milestoneId },
        data: {
          status: "REFUNDED",
          refundedTxHash: proposal.submittedTxHash,
        },
      });

      res.json({
        confirmed: true,
        status: "SUCCESS",
        txHash: proposal.submittedTxHash,
      });
      return;
    }

    res.json({
      confirmed: false,
      status: txStatus.status,
      txHash: proposal.submittedTxHash,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to recheck transaction status", message: err.message });
  }
});

/**
 * POST /api/projects/:projectId/milestones/:milestoneId/refund/reject
 * Cancel or reject an unsubmitted refund proposal.
 */
refundsRouter.post("/reject", async (req: Request, res: Response): Promise<void> => {
  const caller = getAuthAddress(req);
  if (!caller) {
    res.status(401).json({ error: "Unauthorized: Wallet authentication required" });
    return;
  }

  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || (project.clientAddress !== caller && project.freelancerAddress !== caller)) {
      res.status(403).json({ error: "Unauthorized: Only project participants can cancel proposals" });
      return;
    }

    const proposal = await prisma.refundProposal.findFirst({
      where: {
        projectId,
        milestoneId,
        status: { in: ["PROPOSED", "CO_SIGNED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!proposal) {
      res.status(404).json({ error: "No active proposal found to reject" });
      return;
    }

    const updated = await prisma.refundProposal.update({
      where: { id: proposal.id },
      data: { status: "REJECTED" },
    });

    res.json({ success: true, proposal: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reject proposal", message: err.message });
  }
});
