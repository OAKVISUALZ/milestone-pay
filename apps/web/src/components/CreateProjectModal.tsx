"use client";

import React, { useState } from "react";
import { X, Plus, AlertCircle } from "lucide-react";
import {
  CreateProjectSchema,
  xlmToStroops,
  TESTNET_XLM_SAC_CONTRACT_ID,
} from "@milestone-pay/shared";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientAddress: string;
  onProjectCreated: (newProject: any) => void;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  clientAddress,
  onProjectCreated,
}: CreateProjectModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [freelancerAddress, setFreelancerAddress] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [amountXlm, setAmountXlm] = useState("10");
  const [deliverableCriteria, setDeliverableCriteria] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let amountStroops: string;
    try {
      amountStroops = xlmToStroops(amountXlm).toString();
    } catch (err: any) {
      setError(err.message || "Invalid amount");
      return;
    }

    const payload = {
      title,
      description,
      freelancerAddress: freelancerAddress.trim(),
      tokenAddress: TESTNET_XLM_SAC_CONTRACT_ID,
      milestoneTitle,
      amountStroops,
      deliverableCriteria,
    };

    const validation = CreateProjectSchema.safeParse(payload);
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || "Validation failed");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("http://localhost:4000/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Buffer.from(
            JSON.stringify({ sub: clientAddress, exp: Date.now() + 86400000 })
          ).toString("base64")}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      onProjectCreated(data.project);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 id="modal-title" className="text-lg font-bold text-slate-900">
            Create Milestone Agreement
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs md:text-sm">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Project Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Full-Stack Web App Migration"
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Project Description</label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Refactoring legacy frontend into Next.js and connecting Stellar wallet..."
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Freelancer Stellar Address (G...)
            </label>
            <input
              type="text"
              required
              value={freelancerAddress}
              onChange={(e) => setFreelancerAddress(e.target.value)}
              placeholder="GA..."
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
            />
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Initial Milestone (Vertical Slice)
            </span>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Milestone Name</label>
              <input
                type="text"
                required
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="Milestone 1: Prototype and Test Suite"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount in XLM (Stellar Testnet)
              </label>
              <input
                type="number"
                step="0.0000001"
                min="0.0000001"
                required
                value={amountXlm}
                onChange={(e) => setAmountXlm(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Deliverable Verification Criteria
              </label>
              <textarea
                required
                rows={2}
                value={deliverableCriteria}
                onChange={(e) => setDeliverableCriteria(e.target.value)}
                placeholder="All GitHub CI checks pass, pull request reviewed, and deployment preview live."
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {isSubmitting ? "Creating..." : "Create Agreement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
