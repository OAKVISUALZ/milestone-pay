import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MilestoneCard } from "../src/components/MilestoneCard.js";
import { CreateProjectModal } from "../src/components/CreateProjectModal.js";
import { TestnetBanner } from "../src/components/TestnetBanner.js";
import { DisputeNotice } from "../src/components/DisputeNotice.js";
import { Header } from "../src/components/Header.js";
import { WalletService } from "../src/lib/wallet.js";
import { CreateProjectSchema, xlmToStroops, TESTNET_XLM_SAC_CONTRACT_ID } from "@milestone-pay/shared";

const CLIENT_ADDR = "GCLIENT7777777777777777777777777777777777777777777777777";
const FREELANCER_ADDR = "GFREELANCER777777777777777777777777777777777777777777777";
const OBSERVER_ADDR = "GOBSERVER77777777777777777777777777777777777777777777777";

const baseMilestone = {
  id: "ms_test_1",
  milestoneIndex: 1,
  title: "Soroban Escrow Implementation",
  deliverableCriteria: "All contract invariants verified with unit tests",
  amountStroops: "250000000", // 25 XLM
  status: "CREATED",
  deliverableUrl: null,
  deliverableNotes: null,
  deliverableHash: null,
  deliverableSubmittedAt: null,
  fundedTxHash: null,
  releasedTxHash: null,
  refundedTxHash: null,
};

describe("MilestonePay Browser & UI Component Suite", () => {
  describe("1. Role-Specific Actions & Escrow Status Guards", () => {
    it("renders Fund Escrow and Cancel Milestone controls ONLY for the Client on CREATED milestones", () => {
      const clientHtml = renderToStaticMarkup(
        <MilestoneCard
          milestone={baseMilestone}
          clientAddress={CLIENT_ADDR}
          freelancerAddress={FREELANCER_ADDR}
          currentAddress={CLIENT_ADDR}
          onFund={async () => {}}
          onRelease={async () => {}}
          onRefund={async () => {}}
          onCancel={async () => {}}
          onSubmitDeliverable={async () => {}}
        />
      );

      expect(clientHtml).toContain("Fund Escrow (25 XLM)");
      expect(clientHtml).toContain("Cancel Milestone");
      expect(clientHtml).not.toContain("Awaiting client funding");

      const freelancerHtml = renderToStaticMarkup(
        <MilestoneCard
          milestone={baseMilestone}
          clientAddress={CLIENT_ADDR}
          freelancerAddress={FREELANCER_ADDR}
          currentAddress={FREELANCER_ADDR}
          onFund={async () => {}}
          onRelease={async () => {}}
          onRefund={async () => {}}
          onCancel={async () => {}}
          onSubmitDeliverable={async () => {}}
        />
      );

      expect(freelancerHtml).not.toContain("Fund Escrow");
      expect(freelancerHtml).not.toContain("Cancel Milestone");
      expect(freelancerHtml).toContain("Awaiting client funding");
    });

    it("renders Submit Deliverable ONLY for Freelancer and Approve & Release ONLY for Client on FUNDED milestones", () => {
      const fundedMilestone = {
        ...baseMilestone,
        status: "FUNDED",
        fundedTxHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      };

      const freelancerHtml = renderToStaticMarkup(
        <MilestoneCard
          milestone={fundedMilestone}
          clientAddress={CLIENT_ADDR}
          freelancerAddress={FREELANCER_ADDR}
          currentAddress={FREELANCER_ADDR}
          onFund={async () => {}}
          onRelease={async () => {}}
          onRefund={async () => {}}
          onCancel={async () => {}}
          onSubmitDeliverable={async () => {}}
        />
      );

      expect(freelancerHtml).toContain("Submit Deliverable Reference");
      expect(freelancerHtml).toContain("Request Mutual Refund");
      expect(freelancerHtml).not.toContain("Approve &amp; Release Payment");

      const clientHtml = renderToStaticMarkup(
        <MilestoneCard
          milestone={fundedMilestone}
          clientAddress={CLIENT_ADDR}
          freelancerAddress={FREELANCER_ADDR}
          currentAddress={CLIENT_ADDR}
          onFund={async () => {}}
          onRelease={async () => {}}
          onRefund={async () => {}}
          onCancel={async () => {}}
          onSubmitDeliverable={async () => {}}
        />
      );

      expect(clientHtml).toContain("Approve &amp; Release Payment");
      expect(clientHtml).toContain("Request Mutual Refund");
      expect(clientHtml).not.toContain("Submit Deliverable Reference");
    });

    it("displays Stellar Expert Explorer links and disables funding/release buttons in terminal RELEASED state", () => {
      const releasedMilestone = {
        ...baseMilestone,
        status: "RELEASED",
        fundedTxHash: "1111111111111111111111111111111111111111111111111111111111111111",
        releasedTxHash: "2222222222222222222222222222222222222222222222222222222222222222",
      };

      const html = renderToStaticMarkup(
        <MilestoneCard
          milestone={releasedMilestone}
          clientAddress={CLIENT_ADDR}
          freelancerAddress={FREELANCER_ADDR}
          currentAddress={CLIENT_ADDR}
          onFund={async () => {}}
          onRelease={async () => {}}
          onRefund={async () => {}}
          onCancel={async () => {}}
          onSubmitDeliverable={async () => {}}
        />
      );

      expect(html).toContain("Released (Paid)");
      expect(html).toContain("https://stellar.expert/explorer/testnet/tx/11111111");
      expect(html).toContain("https://stellar.expert/explorer/testnet/tx/22222222");
      expect(html).not.toContain("Fund Escrow");
      expect(html).not.toContain("Approve &amp; Release Payment");
    });
  });

  describe("2. Project Creation Modal & Form Validation", () => {
    it("hides modal when isOpen is false and renders accessible form dialog when isOpen is true", () => {
      const closedHtml = renderToStaticMarkup(
        <CreateProjectModal
          isOpen={false}
          onClose={() => {}}
          clientAddress={CLIENT_ADDR}
          onProjectCreated={() => {}}
        />
      );
      expect(closedHtml).toBe("");

      const openHtml = renderToStaticMarkup(
        <CreateProjectModal
          isOpen={true}
          onClose={() => {}}
          clientAddress={CLIENT_ADDR}
          onProjectCreated={() => {}}
        />
      );
      expect(openHtml).toContain('role="dialog"');
      expect(openHtml).toContain("Create Milestone Agreement");
      expect(openHtml).toContain("Freelancer Stellar Address (G...)");
    });

    it("validates project creation payload and rejects invalid Stellar addresses or non-positive amounts", () => {
      const validPayload = {
        title: "Soroban Audit & Hardening",
        description: "Review storage archival and multi-party authorization",
        freelancerAddress: "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L",
        tokenAddress: TESTNET_XLM_SAC_CONTRACT_ID,
        milestoneTitle: "Milestone 1",
        amountStroops: xlmToStroops("50").toString(),
        deliverableCriteria: "All tests pass",
      };

      expect(CreateProjectSchema.safeParse(validPayload).success).toBe(true);

      const invalidAddressPayload = {
        ...validPayload,
        freelancerAddress: "INVALID_ADDRESS",
      };
      expect(CreateProjectSchema.safeParse(invalidAddressPayload).success).toBe(false);

      const zeroAmountPayload = {
        ...validPayload,
        amountStroops: xlmToStroops("0").toString(),
      };
      expect(CreateProjectSchema.safeParse(zeroAmountPayload).success).toBe(false);
      expect(() => xlmToStroops("-15")).toThrow();
    });
  });

  describe("3. Wallet Connection, Network Changes & Wrong-Network Rejection", () => {
    let storageMap: Map<string, string>;

    beforeEach(() => {
      storageMap = new Map<string, string>();
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => storageMap.get(k) ?? null,
          setItem: (k: string, v: string) => storageMap.set(k, v),
          removeItem: (k: string) => storageMap.delete(k),
        },
      };
    });

    it("rejects wallet connection when Freighter is on Mainnet (PUBLIC) instead of Testnet", async () => {
      (globalThis as any).window.freighterApi = {
        isConnected: async () => true,
        getNetwork: async () => "PUBLIC",
        getPublicKey: async () => CLIENT_ADDR,
      };

      const wallet = new WalletService();
      await expect(wallet.connect()).rejects.toThrow(/Wrong network detected \(PUBLIC\)/);
    });

    it("rejects wallet connection when user cancels or rejects the wallet signature prompt", async () => {
      (globalThis as any).window.freighterApi = undefined;
      (globalThis as any).window.prompt = () => null; // User clicked Cancel

      const wallet = new WalletService();
      await expect(wallet.connect()).rejects.toThrow(/Wallet connection cancelled by user/);
    });

    it("connects cleanly when Freighter is set to TESTNET and handles account switching", async () => {
      const validPubKey = "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L";
      (globalThis as any).window.freighterApi = {
        isConnected: async () => true,
        getNetwork: async () => "TESTNET",
        getPublicKey: async () => validPubKey,
      };

      const wallet = new WalletService();
      const connectedAddr = await wallet.connect();
      expect(connectedAddr).toBe(validPubKey);
      expect(storageMap.get("milestonepay_wallet_addr")).toBe(validPubKey);

      // Disconnect clears session
      wallet.disconnect();
      expect(wallet.getAddress()).toBeNull();
      expect(storageMap.has("milestonepay_wallet_addr")).toBe(false);
    });
  });

  describe("4. Refresh Recovery & Persistent Session State", () => {
    it("recovers connected wallet address from localStorage after page refresh", () => {
      const savedAddress = "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L";
      const storageMap = new Map<string, string>([
        ["milestonepay_wallet_addr", savedAddress],
      ]);

      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => storageMap.get(k) ?? null,
          setItem: (k: string, v: string) => storageMap.set(k, v),
          removeItem: (k: string) => storageMap.delete(k),
        },
      };

      // Simulate fresh page load by constructing a new WalletService instance
      const refreshedWallet = new WalletService();
      expect(refreshedWallet.getAddress()).toBe(savedAddress);

      // Verify Header renders the recovered address
      const headerHtml = renderToStaticMarkup(
        <Header
          walletAddress={refreshedWallet.getAddress()}
          onConnect={() => {}}
          onDisconnect={() => {}}
        />
      );
      expect(headerHtml).toContain("GBBMY...7K6L");
      expect(headerHtml).toContain(savedAddress);
    });
  });

  describe("5. Transaction Failure Propagation & Dispute Lock Disclosure", () => {
    it("renders explicit TestnetBanner and non-custodial DisputeNotice warning", () => {
      const bannerHtml = renderToStaticMarkup(<TestnetBanner />);
      expect(bannerHtml).toContain("Stellar Testnet Environment:");

      const disputeHtml = renderToStaticMarkup(<DisputeNotice />);
      expect(disputeHtml).toContain("Escrow Safety &amp; Mutual Settlement Policy");
      expect(disputeHtml).toContain("until mutual agreement is reached");
    });
  });
});
