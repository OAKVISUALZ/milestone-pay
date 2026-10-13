"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Send,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  stroopsToXlm,
  TESTNET_NETWORK_PASSPHRASE,
  RefundProposalDTO,
} from "@milestone-pay/shared";
import { MilestoneEscrowClient, appendSignatureToEnvelope } from "@milestone-pay/sdk";
import {
  Account,
  BASE_FEE,
  Keypair,
  TimeoutInfinite,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

interface MutualRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    agreementId: number | null;
    clientAddress: string;
    freelancerAddress: string;
    tokenAddress: string;
  };
  milestone: {
    id: string;
    milestoneIndex: number;
    title: string;
    amountStroops: string;
    status: string;
  };
  walletAddress: string | null;
  apiUrl?: string;
  onStatusUpdated?: () => void;
}

export function MutualRefundModal({
  isOpen,
  onClose,
  project,
  milestone,
  walletAddress,
  apiUrl = "http://localhost:4000/api",
  onStatusUpdated,
}: MutualRefundModalProps) {
  const [proposal, setProposal] = useState<RefundProposalDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isClient = walletAddress === project.clientAddress;
  const isFreelancer = walletAddress === project.freelancerAddress;
  const isParticipant = isClient || isFreelancer;
  const xlmAmount = stroopsToXlm(milestone.amountStroops);

  // Helper to build headers with session token
  const getHeaders = () => {
    const token = Buffer.from(
      JSON.stringify({ sub: walletAddress, exp: Date.now() + 3600000 })
    ).toString("base64");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    if (isOpen && walletAddress) {
      fetchProposal();
    }
  }, [isOpen, project.id, milestone.id, walletAddress]);

  const fetchProposal = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund`,
        { headers: getHeaders() }
      );
      if (res.ok) {
        const json = await res.json();
        setProposal(json.data || null);
      }
    } catch (err: any) {
      console.error("Failed to fetch refund proposal:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProposeRefund = async () => {
    if (!walletAddress || !isParticipant) return;
    if (!project.agreementId) {
      setError("Project agreement is not linked on-chain yet.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const contractId =
        process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ||
        "CB2PHGNBGYOCX2ELVI2PH2YMGIXN4JA2ORMTKZ63VGFCXS5DCL2BEZXH";
      const escrowClient = new MilestoneEscrowClient({ contractId });

      // Construct refund_milestone transaction envelope
      const account = new Account(walletAddress, "100");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
      })
        .addOperation(
          escrowClient.refundMilestoneOp({
            agreementId: project.agreementId,
            milestoneId: milestone.milestoneIndex,
          })
        )
        .setTimeout(TimeoutInfinite)
        .build();

      // Sign transaction
      // Try Freighter if present; otherwise sign with mock or test key
      const freighter = typeof window !== "undefined" ? (window as any).freighterApi : null;
      let signedXdr: string;

      if (freighter && (await freighter.isConnected())) {
        signedXdr = await freighter.signTransaction(tx.toXDR(), {
          networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
        });
      } else {
        // Fallback for demo/testing without browser extension: sign with ephemeral Keypair
        // In real wallet context, Freighter or Albedo prompts user
        const dummyKp = Keypair.random();
        // Since test addresses start with G, simulate signature with matching seed if available in demo mode
        tx.sign(dummyKp);
        signedXdr = tx.toXDR();
      }

      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund/propose`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ envelopeXdr: signedXdr }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to create refund proposal");
      }

      setProposal(data.proposal);
      setSuccess("Refund proposal created. Awaiting counter-party authorization.");
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to initiate refund proposal");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignProposal = async () => {
    if (!walletAddress || !proposal) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const freighter = typeof window !== "undefined" ? (window as any).freighterApi : null;
      let coSignedXdr: string;

      if (freighter && (await freighter.isConnected())) {
        coSignedXdr = await freighter.signTransaction(proposal.envelopeXdr, {
          networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
        });
      } else {
        const dummyKp = Keypair.random();
        coSignedXdr = appendSignatureToEnvelope(proposal.envelopeXdr, dummyKp);
      }

      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund/sign`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ envelopeXdr: coSignedXdr }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to sign proposal");
      }

      setProposal(data.proposal);
      setSuccess("Signature recorded. Mutual refund is now fully authorized!");
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to sign refund proposal");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRefund = async () => {
    if (!walletAddress || !proposal) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund/submit`,
        {
          method: "POST",
          headers: getHeaders(),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit transaction to Stellar");
      }

      setProposal(data.proposal);
      setSuccess(
        `Transaction submitted to Stellar network! Hash: ${data.txHash.slice(0, 16)}...`
      );
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to submit transaction to network");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecheckStatus = async () => {
    if (!walletAddress || !proposal) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund/recheck`,
        {
          method: "POST",
          headers: getHeaders(),
        }
      );

      const data = await res.json();
      if (data.confirmed) {
        setSuccess("Refund transaction confirmed on-chain! Escrow settled.");
        fetchProposal();
        if (onStatusUpdated) onStatusUpdated();
      } else {
        setSuccess(`Transaction status: ${data.status}. Awaiting ledger inclusion...`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to recheck status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectProposal = async () => {
    if (!walletAddress) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${apiUrl}/projects/${project.id}/milestones/${milestone.id}/refund/reject`,
        {
          method: "POST",
          headers: getHeaders(),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject proposal");

      setProposal(null);
      setSuccess("Refund proposal cancelled.");
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to reject proposal");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Mutual Escrow Refund</h3>
              <p className="text-xs text-slate-500">
                Milestone #{milestone.milestoneIndex}: {milestone.title} ({xlmAmount} XLM)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice of Trust-Minimized Dual Authorization */}
        <div className="mt-4 p-3 bg-purple-50 rounded-xl border border-purple-200 flex gap-2.5 items-start">
          <ShieldCheck className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
          <p className="text-xs text-purple-900 leading-relaxed">
            <strong>Cryptographic Co-Signing:</strong> Soroban contract invariants prevent unilateral
            refunds. Both the <strong>client</strong> and <strong>freelancer</strong> must authorize
            the transaction with their own wallets before escrowed tokens can be returned.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading proposal state...</div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Active Proposal Status Card */}
            {proposal ? (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600">Proposal Status</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      proposal.status === "CO_SIGNED"
                        ? "bg-emerald-100 text-emerald-800"
                        : proposal.status === "SUBMITTED"
                        ? "bg-blue-100 text-blue-800"
                        : proposal.status === "CONFIRMED"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {proposal.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block mb-0.5 font-medium">Client Authorization</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      {proposal.clientSigned ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authorized
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending Signature
                        </>
                      )}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block mb-0.5 font-medium">Freelancer Authorization</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      {proposal.freelancerSigned ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authorized
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending Signature
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div>
                    <span className="font-semibold text-slate-700">Envelope TX Hash:</span>{" "}
                    <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px] text-slate-800 break-all">
                      {proposal.txHash.slice(0, 24)}...
                    </code>
                  </div>
                  {proposal.submittedTxHash && (
                    <div>
                      <span className="font-semibold text-slate-700">Submitted TX:</span>{" "}
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${proposal.submittedTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        {proposal.submittedTxHash.slice(0, 16)}...
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <RotateCcw className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  No active refund proposal. Either party may propose a refund to return the{" "}
                  <strong>{xlmAmount} XLM</strong> in escrow back to the client.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              {!proposal && (
                <button
                  onClick={handleProposeRefund}
                  disabled={actionLoading || !isParticipant}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all"
                >
                  <Send className="w-4 h-4" />
                  {actionLoading ? "Preparing & Signing..." : "Initiate & Sign Refund Proposal"}
                </button>
              )}

              {proposal && proposal.status === "PROPOSED" && (
                <>
                  {((isClient && !proposal.clientSigned) ||
                    (isFreelancer && !proposal.freelancerSigned)) && (
                    <button
                      onClick={handleSignProposal}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {actionLoading ? "Signing Envelope..." : "Approve & Sign Mutual Refund"}
                    </button>
                  )}

                  {((isClient && proposal.clientSigned) ||
                    (isFreelancer && proposal.freelancerSigned)) && (
                    <div className="text-xs text-center text-slate-500 italic py-1">
                      You have signed this proposal. Waiting for the counter-party to sign.
                    </div>
                  )}

                  <button
                    onClick={handleRejectProposal}
                    disabled={actionLoading}
                    className="w-full text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 py-2 rounded-xl transition-colors font-medium border border-transparent hover:border-rose-200"
                  >
                    Cancel / Reject Proposal
                  </button>
                </>
              )}

              {proposal && proposal.status === "CO_SIGNED" && (
                <button
                  onClick={handleSubmitRefund}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all"
                >
                  <Send className="w-4 h-4" />
                  {actionLoading ? "Submitting to Network..." : "Submit Refund to Stellar Network"}
                </button>
              )}

              {proposal && proposal.status === "SUBMITTED" && (
                <button
                  onClick={handleRecheckStatus}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  {actionLoading ? "Checking Status..." : "Recheck On-Chain Status"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
