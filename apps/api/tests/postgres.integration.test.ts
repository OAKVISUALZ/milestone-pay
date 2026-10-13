import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import { createApp } from "../src/app.js";
import { IndexerService } from "../src/indexer/service.js";
import { setupIsolatedTestDatabase, type IsolatedTestDb } from "./setup-test-db.js";

/**
 * Real PostgreSQL Database Integration Test Suite.
 *
 * Connects to a live PostgreSQL database (via Docker or local isolated PGlite server)
 * with committed Prisma SQL migrations applied.
 *
 * Run explicitly via:
 *   npm run test:db --workspace=@milestone-pay/api
 */
describe("MilestonePay Real PostgreSQL Integration Tests", { timeout: 60000 }, () => {
  let testDb: IsolatedTestDb;
  let realPrisma: PrismaClient;
  let app: any;

  beforeAll(async () => {
    testDb = await setupIsolatedTestDatabase(5433);
    realPrisma = testDb.prisma;
    (globalThis as any).prisma = realPrisma;
    app = createApp();
  }, 30000);

  afterAll(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  beforeEach(async () => {
    // Clean tables in foreign-key safe order before each test
    await realPrisma.processedEvent.deleteMany();
    await realPrisma.indexerState.deleteMany();
    await realPrisma.milestone.deleteMany();
    await realPrisma.project.deleteMany();
    await realPrisma.authChallenge.deleteMany();
  });

  it("persists and consumes authentication challenges atomically against concurrent replay in PostgreSQL", async () => {
    const kp = Keypair.random();

    const chalRes = await request(app)
      .post("/api/auth/challenge")
      .send({ publicKey: kp.publicKey() });

    expect(chalRes.status).toBe(200);
    const { nonce, message } = chalRes.body;

    // Verify record exists in PostgreSQL AuthChallenge table
    const dbRecordBefore = await realPrisma.authChallenge.findUnique({ where: { nonce } });
    expect(dbRecordBefore).not.toBeNull();
    expect(dbRecordBefore?.used).toBe(false);

    const signature = kp.sign(Buffer.from(message)).toString("base64");

    // Concurrent replay attempt against real PostgreSQL row-level locking
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/auth/verify")
          .send({
            publicKey: kp.publicKey(),
            nonce,
            signature,
          })
      )
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 401);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);

    const dbRecordAfter = await realPrisma.authChallenge.findUnique({ where: { nonce } });
    expect(dbRecordAfter?.used).toBe(true);
  });

  it("enforces role authorization and persists deliverable metadata in PostgreSQL without altering escrow status", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const unauthorizedKp = Keypair.random();

    const clientToken = Buffer.from(
      JSON.stringify({ sub: clientKp.publicKey(), exp: Date.now() + 60000 })
    ).toString("base64");

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        title: "PostgreSQL Integration Project",
        description: "Verifying real relational constraints and role checks",
        freelancerAddress: freelancerKp.publicKey(),
        milestoneTitle: "Database Schema Migration",
        amountStroops: "100000000",
        deliverableCriteria: "Committed SQL migrations tested",
      });

    expect(createRes.status).toBe(201);
    const milestoneId = createRes.body.project.milestones[0].id;

    // Unauthorized role attempt
    const unauthorizedToken = Buffer.from(
      JSON.stringify({ sub: unauthorizedKp.publicKey(), exp: Date.now() + 60000 })
    ).toString("base64");

    const forbiddenRes = await request(app)
      .post(`/api/projects/milestones/${milestoneId}/deliverable`)
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .send({
        deliverableUrl: "https://github.com/org/repo/pull/99",
        notes: "Attempted hijack",
      });

    expect(forbiddenRes.status).toBe(403);

    // Authorized freelancer submission
    const freelancerToken = Buffer.from(
      JSON.stringify({ sub: freelancerKp.publicKey(), exp: Date.now() + 60000 })
    ).toString("base64");

    const okRes = await request(app)
      .post(`/api/projects/milestones/${milestoneId}/deliverable`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        deliverableUrl: "https://github.com/org/repo/pull/100",
        notes: "Real PostgreSQL integration tests added",
      });

    expect(okRes.status).toBe(200);

    const dbMilestone = await realPrisma.milestone.findUnique({ where: { id: milestoneId } });
    expect(dbMilestone?.deliverableUrl).toBe("https://github.com/org/repo/pull/100");
    expect(dbMilestone?.status).toBe("CREATED");
  });

  it("enforces event deduplication, durable cursors, and restart recovery in PostgreSQL", async () => {
    const clientKp = Keypair.random();
    const freelancerKp = Keypair.random();
    const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

    const project = await realPrisma.project.create({
      data: {
        agreementId: 77,
        title: "Real DB Indexer Project",
        description: "Testing PostgreSQL ProcessedEvent and IndexerState tables",
        clientAddress: clientKp.publicKey(),
        freelancerAddress: freelancerKp.publicKey(),
        tokenAddress: contractId,
        status: "ACTIVE",
        milestones: {
          create: {
            milestoneIndex: 1,
            title: "Milestone 1",
            deliverableCriteria: "Criteria",
            amountStroops: "500000000",
            status: "CREATED",
          },
        },
      },
    });

    const indexerA = new IndexerService(contractId);
    const evFund = {
      type: "milestone_funded" as const,
      agreementId: 77,
      milestoneId: 1,
      amount: "500000000",
      rawEvent: {
        id: "ev-pg-001",
        txHash: "a".repeat(64),
        ledger: 2001,
      },
    };

    vi.spyOn((indexerA as any).client, "getContractEvents").mockResolvedValueOnce({
      events: [evFund],
      cursor: "pg_cursor_2001",
    });

    const resA = await indexerA.pollEvents();
    expect(resA.processedCount).toBe(1);

    // Verify durable cursor in PostgreSQL
    const stateAfterA = await realPrisma.indexerState.findUnique({ where: { id: "default" } });
    expect(stateAfterA?.lastCursor).toBe("pg_cursor_2001");

    // Restart recovery: New indexer instance reads cursor from PostgreSQL and skips duplicate event
    const indexerB = new IndexerService(contractId);
    const evRelease = {
      type: "milestone_released" as const,
      agreementId: 77,
      milestoneId: 1,
      amount: "500000000",
      party: freelancerKp.publicKey(),
      rawEvent: {
        id: "ev-pg-002",
        txHash: "b".repeat(64),
        ledger: 2005,
      },
    };

    const spyB = vi.spyOn((indexerB as any).client, "getContractEvents").mockResolvedValueOnce({
      events: [evFund, evRelease],
      cursor: "pg_cursor_2005",
    });

    const resB = await indexerB.pollEvents();
    expect(spyB).toHaveBeenCalledWith({ cursor: "pg_cursor_2001", limit: 50 });
    expect(resB.processedCount).toBe(1);

    const processedCount = await realPrisma.processedEvent.count();
    expect(processedCount).toBe(2);

    const updatedProject = await realPrisma.project.findUnique({
      where: { id: project.id },
      include: { milestones: true },
    });
    expect(updatedProject?.status).toBe("COMPLETED");
    expect(updatedProject?.milestones[0].status).toBe("RELEASED");
  });
});
