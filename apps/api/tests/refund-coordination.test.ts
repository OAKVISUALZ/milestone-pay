import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import {
  Keypair,
  TransactionBuilder,
  TimeoutInfinite,
  BASE_FEE,
  nativeToScVal,
  Account,
} from "@stellar/stellar-sdk";
import { TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";
import { MilestoneEscrowClient, appendSignatureToEnvelope } from "@milestone-pay/sdk";
import { createApp } from "../src/app.js";
import { setupIsolatedTestDatabase, type IsolatedTestDb } from "./setup-test-db.js";

describe("MilestonePay Mutual-Refund Coordination API", { timeout: 60000 }, () => {
  let testDb: IsolatedTestDb;
  let app: any;
  const contractId = "CB2PHGNBGYOCX2ELVI2PH2YMGIXN4JA2ORMTKZ63VGFCXS5DCL2BEZXH";
  let escrowClient: MilestoneEscrowClient;

  beforeAll(async () => {
    testDb = await setupIsolatedTestDatabase(5435);
    (globalThis as any).prisma = testDb.prisma;
    process.env.ESCROW_CONTRACT_ID = contractId;
    escrowClient = new MilestoneEscrowClient({ contractId });
    app = createApp();
  }, 30000);

  afterAll(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  beforeEach(async () => {
    await testDb.prisma.refundProposal.deleteMany();
    await testDb.prisma.milestone.deleteMany();
    await testDb.prisma.project.deleteMany();
    await testDb.prisma.authChallenge.deleteMany();
  });

  function createAuthToken(publicKey: string): string {
    return Buffer.from(
      JSON.stringify({ sub: publicKey, exp: Date.now() + 60000 })
    ).toString("base64");
  }

  async function createTestProject(clientKp: Keypair, freelancerKp: Keypair, agreementId = 42) {
    return testDb.prisma.project.create({
      data: {
        agreementId,
        title: "Refund Coordination Project",
        description: "Testing two-party envelope signing workflow",
        clientAddress: clientKp.publicKey(),
        freelancerAddress: freelancerKp.publicKey(),
        tokenAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        status: "ACTIVE",
        milestones: {
          create: {
            milestoneIndex: 1,
            title: "Milestone 1",
            deliverableCriteria: "Criteria",
            amountStroops: "150000000",
            status: "FUNDED",
          },
        },
      },
      include: { milestones: true },
    });
  }

  function buildTestRefundEnvelope(
    sourceKp: Keypair,
    signerKp: Keypair,
    agreementId: number,
    milestoneId: number,
    altContractId?: string
  ): string {
    const client = altContractId
      ? new MilestoneEscrowClient({ contractId: altContractId })
      : escrowClient;
    const account = new Account(sourceKp.publicKey(), "100");
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    })
      .addOperation(client.refundMilestoneOp({ agreementId, milestoneId }))
      .setTimeout(TimeoutInfinite)
      .build();

    tx.sign(signerKp);
    return tx.toXDR();
  }

  it("rejects unauthenticated or non-participant requests to refund endpoints", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const attackerKp = Keypair.random();

    const project = await createTestProject(clientKp, freelancerKp);
    const mId = project.milestones[0].id;

    // 1. Missing Auth Token
    const unauthGet = await request(app).get(
      `/api/projects/${project.id}/milestones/${mId}/refund`
    );
    expect(unauthGet.status).toBe(401);

    // 2. Attacker attempting to propose refund
    const attackerToken = createAuthToken(attackerKp.publicKey());
    const validClientXdr = buildTestRefundEnvelope(clientKp, clientKp, 42, 1);

    const attackerPropose = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ envelopeXdr: validClientXdr });

    expect(attackerPropose.status).toBe(403);
    expect(attackerPropose.body.error).toMatch(/Only project client or freelancer/);
  });

  it("rejects invalid, mismatched, or altered refund envelopes", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const clientToken = createAuthToken(clientKp.publicKey());

    const project = await createTestProject(clientKp, freelancerKp, 42);
    const mId = project.milestones[0].id;

    // Case A: Wrong milestone index in envelope
    const wrongMsXdr = buildTestRefundEnvelope(clientKp, clientKp, 42, 99);
    const resA = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: wrongMsXdr });

    expect(resA.status).toBe(400);
    expect(resA.body.details).toMatch(/Argument mismatch/);

    // Case B: Wrong contract ID
    const wrongContractXdr = buildTestRefundEnvelope(
      clientKp,
      clientKp,
      42,
      1,
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
    );
    const resB = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: wrongContractXdr });

    expect(resB.status).toBe(400);
    expect(resB.body.details).toMatch(/Contract mismatch/);

    // Case C: Client submits an envelope they haven't signed
    const unsignedByClientXdr = buildTestRefundEnvelope(clientKp, freelancerKp, 42, 1);
    const resC = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: unsignedByClientXdr });

    expect(resC.status).toBe(400);
    expect(resC.body.error).toMatch(/Transaction must be signed by the client/);
  });

  it("completes full two-party mutual-refund coordination workflow: propose -> counter-sign -> submit", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const clientToken = createAuthToken(clientKp.publicKey());
    const freelancerToken = createAuthToken(freelancerKp.publicKey());

    const project = await createTestProject(clientKp, freelancerKp, 77);
    const mId = project.milestones[0].id;

    // Step 1: Client constructs and signs refund transaction envelope
    const clientSignedXdr = buildTestRefundEnvelope(clientKp, clientKp, 77, 1);

    const proposeRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: clientSignedXdr });

    expect(proposeRes.status).toBe(201);
    expect(proposeRes.body.proposal.status).toBe("PROPOSED");
    expect(proposeRes.body.proposal.clientSigned).toBe(true);
    expect(proposeRes.body.proposal.freelancerSigned).toBe(false);
    const proposalId = proposeRes.body.proposal.id;
    const initialTxHash = proposeRes.body.proposal.txHash;

    // Step 2: Freelancer inspects the proposal via API
    const getRes = await request(app)
      .get(`/api/projects/${project.id}/milestones/${mId}/refund`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(proposalId);
    expect(getRes.body.data.txHash).toBe(initialTxHash);

    // Step 3: Freelancer attempts to submit a modified transaction (altered fee -> altered tx.hash)
    const alteredAccount = new Account(clientKp.publicKey(), "100");
    const alteredTx = new TransactionBuilder(alteredAccount, {
      fee: "500", // Altered fee
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    })
      .addOperation(escrowClient.refundMilestoneOp({ agreementId: 77, milestoneId: 1 }))
      .setTimeout(TimeoutInfinite)
      .build();
    alteredTx.sign(freelancerKp);
    const alteredXdr = alteredTx.toXDR();

    const badSignRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/sign`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ envelopeXdr: alteredXdr });

    // Must be rejected because transaction hash differs from proposal!
    expect(badSignRes.status).toBe(400);
    expect(badSignRes.body.error).toMatch(/Transaction hash mismatch/);

    // Step 4: Freelancer correctly appends their signature to the EXACT proposed envelope
    const coSignedXdr = appendSignatureToEnvelope(clientSignedXdr, freelancerKp);

    const signRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/sign`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ envelopeXdr: coSignedXdr });

    expect(signRes.status).toBe(200);
    expect(signRes.body.proposal.status).toBe("CO_SIGNED");
    expect(signRes.body.proposal.clientSigned).toBe(true);
    expect(signRes.body.proposal.freelancerSigned).toBe(true);
    expect(signRes.body.proposal.txHash).toBe(initialTxHash);

    // Step 5: Prevent concurrent proposal creation once a proposal is CO_SIGNED
    const duplicatePropose = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: clientSignedXdr });

    expect(duplicatePropose.status).toBe(409);
    expect(duplicatePropose.body.error).toMatch(/already co-signed or submitted/);

    // Step 6: Mock Soroban RPC submission and submit
    const mockTxHash = "c".repeat(64);
    const mockSendTransaction = vi.fn().mockResolvedValue({
      status: "PENDING",
      hash: mockTxHash,
    });
    const { rpc } = await import("@stellar/stellar-sdk");
    vi.spyOn(rpc.Server.prototype, "sendTransaction").mockImplementation(mockSendTransaction as any);

    const submitRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/submit`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.txHash).toBe(mockTxHash);
    expect(submitRes.body.proposal.status).toBe("SUBMITTED");
    expect(submitRes.body.proposal.submittedTxHash).toBe(mockTxHash);

    // Step 7: Recheck status simulation
    vi.spyOn(rpc.Server.prototype, "getTransaction").mockResolvedValue({
      status: "SUCCESS",
    } as any);

    const recheckRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/recheck`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(recheckRes.status).toBe(200);
    expect(recheckRes.body.confirmed).toBe(true);
    expect(recheckRes.body.txHash).toBe(mockTxHash);

    // Verify database reflects REFUNDED status
    const dbMilestone = await testDb.prisma.milestone.findUnique({ where: { id: mId } });
    expect(dbMilestone?.status).toBe("REFUNDED");
    expect(dbMilestone?.refundedTxHash).toBe(mockTxHash);
  });

  it("allows participant to cancel or reject an open refund proposal", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const clientToken = createAuthToken(clientKp.publicKey());
    const freelancerToken = createAuthToken(freelancerKp.publicKey());

    const project = await createTestProject(clientKp, freelancerKp, 99);
    const mId = project.milestones[0].id;

    const clientXdr = buildTestRefundEnvelope(clientKp, clientKp, 99, 1);
    await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/propose`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ envelopeXdr: clientXdr });

    // Freelancer rejects the proposed refund
    const rejectRes = await request(app)
      .post(`/api/projects/${project.id}/milestones/${mId}/refund/reject`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.proposal.status).toBe("REJECTED");

    // Fetching proposal returns null since REJECTED is inactive
    const fetchRes = await request(app)
      .get(`/api/projects/${project.id}/milestones/${mId}/refund`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data).toBeNull();
  });
});
