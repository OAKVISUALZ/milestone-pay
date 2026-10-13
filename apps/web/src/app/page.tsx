"use client";

import React, { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { DisputeNotice } from "../components/DisputeNotice";
import { MilestoneCard } from "../components/MilestoneCard";
import { CreateProjectModal } from "../components/CreateProjectModal";
import { walletService } from "../lib/wallet";
import { Plus, RefreshCw, FolderSearch, AlertCircle } from "lucide-react";

interface Project {
  id: string;
  agreementId: number | null;
  title: string;
  description: string;
  clientAddress: string;
  freelancerAddress: string;
  tokenAddress: string;
  status: string;
  milestones: any[];
}

export default function HomePage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "client" | "freelancer">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const saved = walletService.getAddress();
    if (saved) {
      setWalletAddress(saved);
    }
    fetchProjects();
  }, []);

  const handleConnect = async () => {
    try {
      const addr = await walletService.connect();
      setWalletAddress(addr);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
    }
  };

  const handleDisconnect = () => {
    walletService.disconnect();
    setWalletAddress(null);
  };

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:4000/api/projects");
      if (res.ok) {
        const json = await res.json();
        setProjects(json.data || []);
      } else {
        // Fallback for development if API is offline
        setProjects([]);
      }
    } catch {
      // API may be running on another port or starting up
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFund = async (milestoneId: string) => {
    // In production, prompts Freighter to sign fund_milestone transaction
    alert(
      `[Stellar Testnet Transaction]\nAction: Fund Escrow Milestone\nContract Call: fund_milestone(agreement_id, milestone_id)\nSigner: ${walletAddress}\n\nTransaction will be broadcast to Soroban RPC and indexed upon ledger confirmation.`
    );
  };

  const handleRelease = async (milestoneId: string) => {
    alert(
      `[Stellar Testnet Transaction]\nAction: Client Release Payment\nContract Call: release_milestone(agreement_id, milestone_id)\nSigner: ${walletAddress}\n\nContract will transfer escrowed tokens to freelancer.`
    );
  };

  const handleRefund = async (milestoneId: string) => {
    alert(
      `[Stellar Testnet Transaction]\nAction: Mutual Refund Request\nContract Call: refund_milestone(agreement_id, milestone_id)\nRequirement: Authorization envelope must contain valid signatures from BOTH client AND freelancer.`
    );
  };

  const handleCancel = async (milestoneId: string) => {
    alert(
      `[Stellar Testnet Transaction]\nAction: Cancel Unfunded Milestone\nContract Call: cancel_milestone(agreement_id, milestone_id)\nSigner: ${walletAddress}`
    );
  };

  const handleSubmitDeliverable = async (
    milestoneId: string,
    data: { deliverableUrl: string; notes: string; commitOrHash?: string }
  ) => {
    if (!walletAddress) {
      throw new Error("Connect your wallet first");
    }

    const res = await fetch(`http://localhost:4000/api/projects/milestones/${milestoneId}/deliverable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Buffer.from(
          JSON.stringify({ sub: walletAddress, exp: Date.now() + 86400000 })
        ).toString("base64")}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to submit deliverable");
    }

    fetchProjects();
  };

  const filteredProjects = projects.filter((p) => {
    if (!walletAddress || activeTab === "all") return true;
    if (activeTab === "client") return p.clientAddress === walletAddress;
    if (activeTab === "freelancer") return p.freelancerAddress === walletAddress;
    return true;
  });

  return (
    <div className="min-h-screen pb-16">
      <Header
        walletAddress={walletAddress}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Milestone Escrow Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Lock milestone funds on Soroban smart contracts. Release payment upon deliverable verification.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchProjects}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              title="Refresh project state"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                if (!walletAddress) {
                  handleConnect();
                } else {
                  setIsModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              New Milestone Agreement
            </button>
          </div>
        </div>

        {/* Dispute Policy Notice */}
        <DisputeNotice />

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-4 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            {error}
          </div>
        )}

        {/* Filters Tabs */}
        <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab("all")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "all"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            All Agreements ({projects.length})
          </button>
          {walletAddress && (
            <>
              <button
                onClick={() => setActiveTab("client")}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === "client"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                As Client
              </button>
              <button
                onClick={() => setActiveTab("freelancer")}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === "freelancer"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                As Freelancer
              </button>
            </>
          )}
        </div>

        {/* Projects List */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm">Loading on-chain agreements and indexed metadata...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
            <FolderSearch className="w-12 h-12 text-slate-300 mx-auto" />
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="font-semibold text-slate-800 text-lg">No Agreements Found</h3>
              <p className="text-sm text-slate-500">
                {walletAddress
                  ? "You don't have any active agreements yet. Click 'New Milestone Agreement' to create your first Soroban escrow project."
                  : "Connect your testnet wallet to inspect your agreements or start a new escrow milestone."}
              </p>
            </div>
            {!walletAddress ? (
              <button
                onClick={handleConnect}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-lg shadow-sm"
              >
                Connect Wallet to Begin
              </button>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-lg shadow-sm"
              >
                Create First Agreement
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-100/70 border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{project.title}</h2>
                    <p className="text-sm text-slate-600 mt-0.5">{project.description}</p>
                  </div>
                  <div className="text-xs font-mono space-y-0.5 text-slate-500">
                    <div>
                      Client: <span className="text-slate-800">{project.clientAddress.slice(0, 8)}...</span>
                    </div>
                    <div>
                      Freelancer: <span className="text-slate-800">{project.freelancerAddress.slice(0, 8)}...</span>
                    </div>
                    {project.agreementId && (
                      <div className="text-blue-700 font-bold">
                        On-Chain Agreement #{project.agreementId}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {project.milestones.map((ms) => (
                    <MilestoneCard
                      key={ms.id}
                      milestone={ms}
                      clientAddress={project.clientAddress}
                      freelancerAddress={project.freelancerAddress}
                      currentAddress={walletAddress}
                      onFund={handleFund}
                      onRelease={handleRelease}
                      onRefund={handleRefund}
                      onCancel={handleCancel}
                      onSubmitDeliverable={handleSubmitDeliverable}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {walletAddress && (
        <CreateProjectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          clientAddress={walletAddress}
          onProjectCreated={(newProject) => {
            setProjects((prev) => [newProject, ...prev]);
          }}
        />
      )}
    </div>
  );
}
