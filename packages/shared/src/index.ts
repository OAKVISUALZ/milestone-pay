import { z } from "zod";

// Canonical Network Constants
export const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
export const TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const TESTNET_XLM_SAC_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const STROOPS_PER_XLM = 10_000_000n;

// Milestone Status Enum matching contract
export enum MilestoneStatus {
  CREATED = 0,
  FUNDED = 1,
  RELEASED = 2,
  REFUNDED = 3,
  CANCELLED = 4,
}

export const MilestoneStatusLabels: Record<MilestoneStatus, string> = {
  [MilestoneStatus.CREATED]: "Created (Unfunded)",
  [MilestoneStatus.FUNDED]: "Funded (In Escrow)",
  [MilestoneStatus.RELEASED]: "Released (Paid)",
  [MilestoneStatus.REFUNDED]: "Refunded (Returned to Client)",
  [MilestoneStatus.CANCELLED]: "Cancelled",
};

// Stellar Address Format Regex (Account G... or Contract C...)
export const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
export const STELLAR_CONTRACT_REGEX = /^C[A-Z2-7]{55}$/;
export const STELLAR_ADDRESS_REGEX = /^[GC][A-Z2-7]{55}$/;

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_REGEX.test(address);
}

export function isValidStellarAccount(address: string): boolean {
  return STELLAR_ACCOUNT_REGEX.test(address);
}

// Token conversion utilities using BigInt arithmetic (never floats!)
export function xlmToStroops(xlmAmount: string | number): bigint {
  const str = xlmAmount.toString().trim();
  if (!str || isNaN(Number(str)) || Number(str) < 0) {
    throw new Error(`Invalid XLM amount: ${xlmAmount}`);
  }
  const parts = str.split(".");
  const wholePart = BigInt(parts[0] || "0");
  let fracPartStr = (parts[1] || "").slice(0, 7);
  while (fracPartStr.length < 7) {
    fracPartStr += "0";
  }
  const fracPart = BigInt(fracPartStr);
  return wholePart * STROOPS_PER_XLM + fracPart;
}

export function stroopsToXlm(stroops: bigint | string): string {
  const b = typeof stroops === "string" ? BigInt(stroops) : stroops;
  const whole = b / STROOPS_PER_XLM;
  const remainder = b % STROOPS_PER_XLM;
  if (remainder === 0n) {
    return whole.toString();
  }
  const fracStr = remainder.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

// Zod Schemas
export const StellarAccountSchema = z
  .string()
  .regex(STELLAR_ACCOUNT_REGEX, "Invalid Stellar account public key (must start with G and be 56 characters)");

export const StellarAddressSchema = z
  .string()
  .regex(STELLAR_ADDRESS_REGEX, "Invalid Stellar address (must start with G or C and be 56 characters)");

export const PositiveStroopsStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Amount must be a positive integer in base units (stroops)")
  .refine((val) => {
    try {
      const b = BigInt(val);
      return b > 0n;
    } catch {
      return false;
    }
  }, "Invalid integer amount");

export const CreateProjectSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().min(10, "Description must be at least 10 characters").max(2000),
  freelancerAddress: StellarAccountSchema,
  tokenAddress: StellarAddressSchema.default(TESTNET_XLM_SAC_CONTRACT_ID),
  milestoneTitle: z.string().min(3, "Milestone title must be at least 3 characters").max(100),
  amountStroops: PositiveStroopsStringSchema,
  deliverableCriteria: z.string().min(5, "Deliverable criteria must be specified").max(1000),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const SubmitDeliverableSchema = z.object({
  deliverableUrl: z.string().url("Must be a valid URL").or(z.string().min(5)),
  notes: z.string().min(5, "Deliverable notes must be at least 5 characters").max(2000),
  commitOrHash: z.string().max(128).optional(),
});

export type SubmitDeliverableInput = z.infer<typeof SubmitDeliverableSchema>;

export const ChallengeRequestSchema = z.object({
  publicKey: StellarAccountSchema,
});

export type ChallengeRequestInput = z.infer<typeof ChallengeRequestSchema>;

export const ChallengeVerifySchema = z.object({
  publicKey: StellarAccountSchema,
  nonce: z.string().min(16),
  signature: z.string().min(10),
});

export type ChallengeVerifyInput = z.infer<typeof ChallengeVerifySchema>;

export const RecordContractAgreementSchema = z.object({
  agreementId: z.number().int().positive(),
  clientAddress: StellarAccountSchema,
  freelancerAddress: StellarAccountSchema,
  tokenAddress: StellarAddressSchema,
  txHash: z.string().length(64, "Invalid Stellar transaction hash"),
  ledger: z.number().int().positive().optional(),
});

export type RecordContractAgreementInput = z.infer<typeof RecordContractAgreementSchema>;

// Refund Proposal Domain Types and Schemas
export type RefundProposalStatus =
  | "PROPOSED"
  | "CO_SIGNED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED";

export interface RefundProposalDTO {
  id: string;
  projectId: string;
  milestoneId: string;
  agreementId: number;
  milestoneIndex: number;
  initiatorAddress: string;
  envelopeXdr: string;
  txHash: string;
  clientSigned: boolean;
  freelancerSigned: boolean;
  status: RefundProposalStatus;
  submittedTxHash?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export const ProposeRefundSchema = z.object({
  envelopeXdr: z.string().min(20, "Envelope XDR is required"),
});
export type ProposeRefundInput = z.infer<typeof ProposeRefundSchema>;

export const SignRefundSchema = z.object({
  envelopeXdr: z.string().min(20, "Co-signed envelope XDR is required"),
});
export type SignRefundInput = z.infer<typeof SignRefundSchema>;

