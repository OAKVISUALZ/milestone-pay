import { MilestoneStatus } from "@milestone-pay/shared";

export interface AgreementData {
  client: string;
  freelancer: string;
  token: string;
  createdAt: bigint;
  milestoneCount: number;
}

export interface MilestoneData {
  agreementId: bigint;
  milestoneId: number;
  amount: bigint;
  status: MilestoneStatus;
}

export interface EscrowEventPayload {
  type: "agreement_created" | "milestone_funded" | "milestone_released" | "milestone_refunded" | "milestone_cancelled";
  agreementId: number;
  milestoneId?: number;
  amount?: bigint;
  party?: string;
  rawEvent: any;
}

export interface ClientConfig {
  contractId: string;
  rpcUrl?: string;
  networkPassphrase?: string;
}
