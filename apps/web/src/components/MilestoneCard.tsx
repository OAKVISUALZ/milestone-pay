"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  RotateCcw,
  Send,
  XCircle,
  FileCheck,
  AlertCircle,
} from "lucide-react";
import { stroopsToXlm } from "@milestone-pay/shared";

interface MilestoneProps {
  milestone: {
    id: string;
    milestoneIndex: number;
    title: string;
    deliverableCriteria: string;
    amountStroops: string;
    status: string;
    deliverableUrl?: string | null;
    deliverableNotes?: string | null;
    deliverableHash?: string | null;
    deliverableSubmittedAt?: string | null;
    fundedTxHash?: string | null;
    releasedTxHash?: string | null;
    refundedTxHash?: string | null;
  };
  clientAddress: string;
  freelancerAddress: string;
  currentAddress: string | null;
  onFund: (milestoneId: string) => Promise<void>;
  onRelease: (milestoneId: string) => Promise<void>;
  onRefund: (milestoneId: string) => Promise<void>;
  onCancel: (milestoneId: string) => Promise<void>;
  onSubmitDeliverable: (
    milestoneId: string,
    data: { deliverableUrl: string; notes: string; commitOrHash?: string }
  ) => Promise<void>;
}

export function MilestoneCard({
  milestone,
  clientAddress,
  freelancerAddress,
  currentAddress,
  onFund,
  onRelease,
  onRefund,
  onCancel,
  onSubmitDeliverable,
}: MilestoneProps) {
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false);
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [deliverableNotes, setDeliverableNotes] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const isClient = currentAddress === clientAddress;
  const isFreelancer = currentAddress === freelancerAddress;
  const xlmAmount = stroopsToXlm(milestone.amountStroops);

  const getStatusBadge = () => {
    switch (milestone.status) {
      case "CREATED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Created (Unfunded)
          </span>
        );
      case "FUNDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Lock className="w-3.5 h-3.5" /> Funded (Locked in Escrow)
          </span>
        );
      case "RELEASED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Released (Paid)
          </span>
        );
      case "REFUNDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <RotateCcw className="w-3.5 h-3.5" /> Refunded (Mutual Settlement)
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            {milestone.status}
          </span>
        );
    }
  };

  const handleAction = async (actionFn: () => Promise<void>, actionName: string) => {
    setTxStatus(`Awaiting signature for ${actionName}...`);
    setTxError(null);
    try {
      await actionFn();
      setTxStatus(`${actionName} confirmed!`);
      setTimeout(() => setTxStatus(null), 4000);
    } catch (err: any) {
      setTxError(err.message || "Transaction failed");
      setTxStatus(null);
    }
  };

  const handleDeliverableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverableUrl || !deliverableNotes) return;
    try {
      await onSubmitDeliverable(milestone.id, {
        deliverableUrl,
        notes: deliverableNotes,
      });
      setSubmittingDeliverable(false);
      setDeliverableUrl("");
      setDeliverableNotes("");
    } catch (err: any) {
      setTxError(err.message || "Failed to submit deliverable");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
              Milestone {milestone.milestoneIndex}
            </span>
            {getStatusBadge()}
          </div>
          <h3 className="font-semibold text-lg text-slate-900">{milestone.title}</h3>
        </div>
        <div className="text-right sm:border-l sm:border-slate-100 sm:pl-4">
          <div className="text-2xl font-bold text-slate-900 font-mono">{xlmAmount} XLM</div>
          <div className="text-xs text-slate-400 font-mono">{milestone.amountStroops} stroops</div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Deliverable Requirements
        </h4>
        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
          {milestone.deliverableCriteria}
        </p>
      </div>

      {/* Deliverable submission display if available */}
      {milestone.deliverableUrl && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 text-emerald-900">
              <FileCheck className="w-4 h-4 text-emerald-700" /> Deliverable Submitted by Freelancer
            </span>
            {milestone.deliverableSubmittedAt && (
              <span className="text-xs text-emerald-700 font-mono">
                {new Date(milestone.deliverableSubmittedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm text-emerald-900 italic">"{milestone.deliverableNotes}"</p>
          <a
            href={milestone.deliverableUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
          >
            Inspect Submitted Deliverable <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Transaction status or error alerts */}
      {txStatus && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-900 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
          {txStatus}
        </div>
      )}
      {txError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium text-rose-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
          {txError}
        </div>
      )}

      {/* Confirmed Transaction Receipts */}
      <div className="flex flex-wrap gap-2 pt-2 text-xs font-mono text-slate-500">
        {milestone.fundedTxHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${milestone.fundedTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-blue-600 underline"
          >
            Funded TX: {milestone.fundedTxHash.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {milestone.releasedTxHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${milestone.releasedTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-emerald-600 underline"
          >
            Released TX: {milestone.releasedTxHash.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {milestone.refundedTxHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${milestone.refundedTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-purple-600 underline"
          >
            Refunded TX: {milestone.refundedTxHash.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Interactive Actions */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        {milestone.status === "CREATED" && (
          <div className="flex items-center gap-2">
            {isClient && (
              <>
                <button
                  onClick={() => handleAction(() => onFund(milestone.id), "Milestone Funding")}
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" /> Fund Escrow ({xlmAmount} XLM)
                </button>
                <button
                  onClick={() => handleAction(() => onCancel(milestone.id), "Milestone Cancellation")}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-rose-600 text-xs font-medium px-3 py-2 rounded-lg transition-colors hover:bg-slate-100"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel Milestone
                </button>
              </>
            )}
            {!isClient && (
              <span className="text-xs text-slate-500 italic">Awaiting client funding</span>
            )}
          </div>
        )}

        {milestone.status === "FUNDED" && (
          <div className="flex flex-wrap items-center gap-2">
            {isFreelancer && !submittingDeliverable && (
              <button
                onClick={() => setSubmittingDeliverable(true)}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Submit Deliverable Reference
              </button>
            )}

            {isClient && (
              <button
                onClick={() => handleAction(() => onRelease(milestone.id), "Release to Freelancer")}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; Release Payment
              </button>
            )}

            <button
              onClick={() => handleAction(() => onRefund(milestone.id), "Mutual Refund")}
              className="inline-flex items-center gap-1.5 text-slate-700 hover:text-purple-700 hover:bg-purple-50 border border-slate-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              title="Requires authorization from both client and freelancer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Request Mutual Refund
            </button>
          </div>
        )}

        {milestone.status === "RELEASED" && (
          <span className="text-xs text-emerald-800 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Settled in full on Stellar Testnet.
          </span>
        )}

        {milestone.status === "REFUNDED" && (
          <span className="text-xs text-purple-800 font-medium flex items-center gap-1">
            <RotateCcw className="w-4 h-4 text-purple-600" /> Mutual refund executed. Funds returned to client.
          </span>
        )}
      </div>

      {/* Deliverable submission inline form */}
      {submittingDeliverable && (
        <form onSubmit={handleDeliverableSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 mt-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Submit Deliverable Reference (Informational)
          </h4>
          <p className="text-xs text-slate-500">
            Note: Submitting this reference notifies the client off-chain. The client must explicitly sign the on-chain release transaction.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deliverable URL (GitHub PR, Figma, Demo URL, or IPFS)
            </label>
            <input
              type="text"
              required
              value={deliverableUrl}
              onChange={(e) => setDeliverableUrl(e.target.value)}
              placeholder="https://github.com/org/repo/pull/12"
              className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Submission Notes / Verification Criteria Met
            </label>
            <textarea
              required
              rows={2}
              value={deliverableNotes}
              onChange={(e) => setDeliverableNotes(e.target.value)}
              placeholder="Completed all unit tests and responsive review as agreed."
              className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubmittingDeliverable(false)}
              className="text-xs px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm"
            >
              Submit Deliverable
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
