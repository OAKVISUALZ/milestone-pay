import { InMemoryDatabase } from "./mockDb.js";

const mockDb = new InMemoryDatabase();
// Set global.prisma before any app imports so db/client.ts uses our mock database
(globalThis as any).prisma = mockDb.prismaMock;

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import { createApp } from "../src/app.js";
import { IndexerService } from "../src/indexer/service.js";

describe("MilestonePay API & Indexer Tests (In-Memory Adapter)", () => {
  let app: any;

  beforeEach(() => {
    mockDb.reset();
    app = createApp();
  });

  describe("GET /api/health", () => {
    it("returns healthy status and testnet network info", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.network).toBe("testnet");
      expect(res.body.version).toBe("0.1.0");
    });
  });

  describe("OpenAPI Documentation", () => {
    it("serves OpenAPI 3.0 json schema", async () => {
      const res = await request(app).get("/api/openapi.json");
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe("3.0.3");
      expect(res.body.paths["/api/projects"]).toBeDefined();
      expect(res.body.paths["/api/auth/challenge"]).toBeDefined();
    });
  });

  describe("Wallet Authentication, Challenge Consumption & Concurrent Replay Prevention", () => {
    it("generates single-use expiring challenge", async () => {
      const kp = Keypair.random();
      const res = await request(app)
        .post("/api/auth/challenge")
        .send({ publicKey: kp.publicKey() });

      expect(res.status).toBe(200);
      expect(res.body.nonce).toBeDefined();
      expect(res.body.message).toContain(kp.publicKey());
      expect(res.body.expiresAt).toBeDefined();
    });

    it("verifies ed25519 signature and prevents sequential replay attacks", async () => {
      const kp = Keypair.random();

      const chalRes = await request(app)
        .post("/api/auth/challenge")
        .send({ publicKey: kp.publicKey() });

      expect(chalRes.status).toBe(200);
      const { nonce, message } = chalRes.body;

      const signature = kp.sign(Buffer.from(message)).toString("base64");

      const verifyRes = await request(app)
        .post("/api/auth/verify")
        .send({
          publicKey: kp.publicKey(),
          nonce,
          signature,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.token).toBeDefined();

      // Sequential replay attempt
      const replayRes = await request(app)
        .post("/api/auth/verify")
        .send({
          publicKey: kp.publicKey(),
          nonce,
          signature,
        });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.reason).toContain("replay detected");
    });

    it("prevents concurrent replay attempts (TOCTOU race protection)", async () => {
      const kp = Keypair.random();

      const chalRes = await request(app)
        .post("/api/auth/challenge")
        .send({ publicKey: kp.publicKey() });

      const { nonce, message } = chalRes.body;
      const signature = kp.sign(Buffer.from(message)).toString("base64");

      // Fire 5 concurrent verification requests with the exact same challenge
      const responses = await Promise.all(
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

      const successes = responses.filter((r) => r.status === 200);
      const rejections = responses.filter((r) => r.status === 401);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(4);
      for (const rej of rejections) {
        expect(rej.body.reason).toContain("replay detected");
      }
    });

    it("rejects forged or corrupted cryptographic signatures", async () => {
      const kp = Keypair.random();
      const chalRes = await request(app)
        .post("/api/auth/challenge")
        .send({ publicKey: kp.publicKey() });

      const invalidSig = Buffer.alloc(64).fill(1).toString("base64");

      const res = await request(app)
        .post("/api/auth/verify")
        .send({
          publicKey: kp.publicKey(),
          nonce: chalRes.body.nonce,
          signature: invalidSig,
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authentication failed");
    });
  });

  describe("Request Size Limits & Auth Rate Limiting", () => {
    it("rejects oversized JSON payloads (>50kb) with 413 Payload Too Large", async () => {
      const oversizedDescription = "x".repeat(60 * 1024);
      const res = await request(app)
        .post("/api/projects")
        .send({
          title: "Oversized Payload",
          description: oversizedDescription,
        });

      expect(res.status).toBe(413);
    });

    it("rate limits excessive authentication challenge requests with 429 Too Many Requests", async () => {
      const kp = Keypair.random();
      const testIp = "203.0.113.99";

      const responses = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post("/api/auth/challenge")
          .set("X-Forwarded-For", testIp)
          .send({ publicKey: kp.publicKey() });
        responses.push(res);
      }

      const okCount = responses.filter((r) => r.status === 200).length;
      const rateLimited = responses.filter((r) => r.status === 429);

      expect(okCount).toBe(10);
      expect(rateLimited.length).toBe(2);
      expect(rateLimited[0].headers["retry-after"]).toBeDefined();
      expect(rateLimited[0].body.error).toBe("Too Many Requests");
    });
  });

  describe("Project Creation & Role Authorization", () => {
    it("rejects project creation without authentication token", async () => {
      const res = await request(app).post("/api/projects").send({
        title: "Test Project",
        description: "Test description with more than 10 characters",
        freelancerAddress: "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L",
        milestoneTitle: "Milestone 1",
        amountStroops: "100000000",
        deliverableCriteria: "Criteria here",
      });

      expect(res.status).toBe(401);
    });

    it("creates project when client is authenticated and rejects self-freelancing", async () => {
      const clientKp = Keypair.random();
      const freelancerKp = Keypair.random();

      const authHeader = `Bearer ${Buffer.from(
        JSON.stringify({ sub: clientKp.publicKey(), exp: Date.now() + 60000 })
      ).toString("base64")}`;

      // Self-freelancing attempt
      const selfRes = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader)
        .send({
          title: "Self Project",
          description: "Long enough description",
          freelancerAddress: clientKp.publicKey(),
          milestoneTitle: "M1",
          amountStroops: "100000000",
          deliverableCriteria: "Criteria",
        });

      expect(selfRes.status).toBe(400);

      // Valid project creation
      const validRes = await request(app)
        .post("/api/projects")
        .set("Authorization", authHeader)
        .send({
          title: "Stellar Integration",
          description: "Build Soroban smart escrow contract",
          freelancerAddress: freelancerKp.publicKey(),
          milestoneTitle: "MVP Escrow",
          amountStroops: "500000000",
          deliverableCriteria: "All 13 contract tests pass on-chain",
        });

      expect(validRes.status).toBe(201);
      expect(validRes.body.project.title).toBe("Stellar Integration");
      expect(validRes.body.project.milestones.length).toBe(1);
      expect(validRes.body.project.milestones[0].status).toBe("CREATED");
    });

    it("allows only the assigned freelancer to submit deliverable references and keeps status CREATED/FUNDED until on-chain confirmation", async () => {
      const clientKp = Keypair.random();
      const freelancerKp = Keypair.random();
      const strangerKp = Keypair.random();

      const clientAuth = `Bearer ${Buffer.from(
        JSON.stringify({ sub: clientKp.publicKey(), exp: Date.now() + 60000 })
      ).toString("base64")}`;

      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", clientAuth)
        .send({
          title: "Deliverable Test",
          description: "Testing deliverable access control",
          freelancerAddress: freelancerKp.publicKey(),
          milestoneTitle: "Milestone 1",
          amountStroops: "100000000",
          deliverableCriteria: "PR merged",
        });

      const milestoneId = createRes.body.project.milestones[0].id;

      // Stranger attempt (403)
      const strangerAuth = `Bearer ${Buffer.from(
        JSON.stringify({ sub: strangerKp.publicKey(), exp: Date.now() + 60000 })
      ).toString("base64")}`;

      const strangerRes = await request(app)
        .post(`/api/projects/milestones/${milestoneId}/deliverable`)
        .set("Authorization", strangerAuth)
        .send({
          deliverableUrl: "https://github.com/project/pull/1",
          notes: "Stranger notes longer than 5 chars",
        });

      expect(strangerRes.status).toBe(403);

      // Client attempt to submit freelancer deliverable (403)
      const clientDeliverableRes = await request(app)
        .post(`/api/projects/milestones/${milestoneId}/deliverable`)
        .set("Authorization", clientAuth)
        .send({
          deliverableUrl: "https://github.com/project/pull/1",
          notes: "Client trying to submit deliverable",
        });

      expect(clientDeliverableRes.status).toBe(403);

      // Assigned freelancer attempt (200)
      const freelancerAuth = `Bearer ${Buffer.from(
        JSON.stringify({ sub: freelancerKp.publicKey(), exp: Date.now() + 60000 })
      ).toString("base64")}`;

      const freelancerRes = await request(app)
        .post(`/api/projects/milestones/${milestoneId}/deliverable`)
        .set("Authorization", freelancerAuth)
        .send({
          deliverableUrl: "https://github.com/project/pull/1",
          notes: "Implemented and verified all tests.",
        });

      expect(freelancerRes.status).toBe(200);
      expect(freelancerRes.body.milestone.deliverableUrl).toBe("https://github.com/project/pull/1");
      // Authoritative state check: submitting a deliverable NEVER marks the milestone as RELEASED or FUNDED
      expect(freelancerRes.body.milestone.status).toBe("CREATED");
      expect(freelancerRes.body.message).toContain("Release requires explicit on-chain approval");
    });
  });

  describe("Event Deduplication, Durable Cursors & Indexer Restart Recovery", () => {
    it("processes Soroban events idempotently, persists cursors, and resumes cleanly after restart", async () => {
      const clientKp = Keypair.random();
      const freelancerKp = Keypair.random();
      const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

      const clientAuth = `Bearer ${Buffer.from(
        JSON.stringify({ sub: clientKp.publicKey(), exp: Date.now() + 60000 })
      ).toString("base64")}`;

      // 1. Create off-chain project and link to on-chain agreementId = 42
      const createRes = await request(app)
        .post("/api/projects")
        .set("Authorization", clientAuth)
        .send({
          title: "Indexer Recovery Test",
          description: "Testing durable cursor and event deduplication",
          freelancerAddress: freelancerKp.publicKey(),
          milestoneTitle: "Phase 1",
          amountStroops: "250000000",
          deliverableCriteria: "Pass integration tests",
        });

      const projectId = createRes.body.project.id;

      await request(app)
        .post(`/api/projects/${projectId}/link-contract`)
        .send({
          projectId,
          agreementId: 42,
          clientAddress: clientKp.publicKey(),
          freelancerAddress: freelancerKp.publicKey(),
          tokenAddress: contractId,
          txHash: "a".repeat(64),
        });

      // 2. Instantiate Indexer #1 and mock Soroban RPC getContractEvents
      const indexer1 = new IndexerService(contractId);
      const fundEvent = {
        type: "milestone_funded" as const,
        agreementId: 42,
        milestoneId: 1,
        amount: "250000000",
        rawEvent: {
          id: "0001000-1",
          txHash: "1111111111111111111111111111111111111111111111111111111111111111",
          ledger: 1000,
        },
      };

      const spy1 = vi
        .spyOn((indexer1 as any).client, "getContractEvents")
        .mockResolvedValueOnce({
          events: [fundEvent],
          cursor: "cursor_ledger_1000",
        });

      const poll1 = await indexer1.pollEvents();
      expect(poll1.processedCount).toBe(1);
      expect(poll1.newCursor).toBe("cursor_ledger_1000");
      expect(spy1).toHaveBeenCalledWith({ cursor: undefined, limit: 50 });

      // Verify milestone is now authoritatively FUNDED
      const projAfterFund = await request(app).get(`/api/projects/${projectId}`);
      expect(projAfterFund.body.data.milestones[0].status).toBe("FUNDED");
      expect(projAfterFund.body.data.milestones[0].fundedTxHash).toBe(
        "1111111111111111111111111111111111111111111111111111111111111111"
      );

      // 3. Simulate Indexer crash/restart by creating a brand-new IndexerService instance
      // Deliver duplicate fundEvent + new releaseEvent
      const indexer2 = new IndexerService(contractId);
      const releaseEvent = {
        type: "milestone_released" as const,
        agreementId: 42,
        milestoneId: 1,
        amount: "250000000",
        party: freelancerKp.publicKey(),
        rawEvent: {
          id: "0001005-2",
          txHash: "2222222222222222222222222222222222222222222222222222222222222222",
          ledger: 1005,
        },
      };

      const spy2 = vi
        .spyOn((indexer2 as any).client, "getContractEvents")
        .mockResolvedValueOnce({
          events: [fundEvent, releaseEvent], // Duplicate fundEvent included!
          cursor: "cursor_ledger_1005",
        });

      const poll2 = await indexer2.pollEvents();
      // Verify indexer2 resumed from durable cursor "cursor_ledger_1000"
      expect(spy2).toHaveBeenCalledWith({ cursor: "cursor_ledger_1000", limit: 50 });
      // Verify duplicate fundEvent was skipped and only releaseEvent was processed
      expect(poll2.processedCount).toBe(1);
      expect(poll2.newCursor).toBe("cursor_ledger_1005");

      // Verify milestone is now RELEASED and project is COMPLETED
      const projAfterRelease = await request(app).get(`/api/projects/${projectId}`);
      expect(projAfterRelease.body.data.milestones[0].status).toBe("RELEASED");
      expect(projAfterRelease.body.data.milestones[0].releasedTxHash).toBe(
        "2222222222222222222222222222222222222222222222222222222222222222"
      );
      expect(projAfterRelease.body.data.status).toBe("COMPLETED");
    });
  });
});
