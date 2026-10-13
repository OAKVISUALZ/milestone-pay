import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { MilestoneEscrowClient } from "../src/client.js";
import {
  TESTNET_XLM_SAC_CONTRACT_ID,
  xlmToStroops,
  stroopsToXlm,
  isValidStellarAddress,
} from "@milestone-pay/shared";

describe("MilestoneEscrowClient SDK Unit Tests", () => {
  const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
  const client = new MilestoneEscrowClient({ contractId });

  // Generate cryptographically valid testnet addresses with valid strkey checksums
  const clientAddress = Keypair.random().publicKey();
  const freelancerAddress = Keypair.random().publicKey();

  it("initializes with contract ID and default testnet RPC", () => {
    expect(client.contractId).toBe(contractId);
    expect(client.rpcUrl).toContain("soroban-testnet.stellar.org");
    expect(client.networkPassphrase).toContain("Test SDF Network");
  });

  it("builds valid createAgreementOp operation", () => {
    const op = client.createAgreementOp({
      client: clientAddress,
      freelancer: freelancerAddress,
      token: TESTNET_XLM_SAC_CONTRACT_ID,
      milestoneAmount: 100_000_000n,
    });

    expect(op).toBeDefined();
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("builds valid fundMilestoneOp operation", () => {
    const op = client.fundMilestoneOp({
      agreementId: 1,
      milestoneId: 1,
    });

    expect(op).toBeDefined();
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("builds valid releaseMilestoneOp operation", () => {
    const op = client.releaseMilestoneOp({
      agreementId: 1,
      milestoneId: 1,
    });

    expect(op).toBeDefined();
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("builds valid refundMilestoneOp operation", () => {
    const op = client.refundMilestoneOp({
      agreementId: 1,
      milestoneId: 1,
    });

    expect(op).toBeDefined();
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("builds valid cancelMilestoneOp operation", () => {
    const op = client.cancelMilestoneOp({
      agreementId: 1,
      milestoneId: 1,
    });

    expect(op).toBeDefined();
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  describe("Amount conversion utilities", () => {
    it("converts XLM to stroops using BigInt without floating point errors", () => {
      expect(xlmToStroops("1")).toBe(10_000_000n);
      expect(xlmToStroops("0.1")).toBe(1_000_000n);
      expect(xlmToStroops("0.0000001")).toBe(1n);
      expect(xlmToStroops("15.5")).toBe(155_000_000n);
      expect(xlmToStroops(20)).toBe(200_000_000n);
    });

    it("converts stroops to XLM string representation", () => {
      expect(stroopsToXlm(10_000_000n)).toBe("1");
      expect(stroopsToXlm(1_000_000n)).toBe("0.1");
      expect(stroopsToXlm(1n)).toBe("0.0000001");
      expect(stroopsToXlm(155_000_000n)).toBe("15.5");
      expect(stroopsToXlm("500000000")).toBe("50");
    });

    it("rejects invalid amounts", () => {
      expect(() => xlmToStroops("-5")).toThrow();
      expect(() => xlmToStroops("abc")).toThrow();
    });
  });

  describe("Stellar address validation", () => {
    it("validates valid public keys and contract IDs", () => {
      expect(isValidStellarAddress(clientAddress)).toBe(true);
      expect(isValidStellarAddress(TESTNET_XLM_SAC_CONTRACT_ID)).toBe(true);
      expect(isValidStellarAddress("invalid")).toBe(false);
      expect(isValidStellarAddress("G123")).toBe(false);
    });
  });
});
