-- CreateTable
CREATE TABLE "RefundProposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "milestoneIndex" INTEGER NOT NULL,
    "initiatorAddress" TEXT NOT NULL,
    "envelopeXdr" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "clientSigned" BOOLEAN NOT NULL DEFAULT false,
    "freelancerSigned" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "submittedTxHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundProposal_projectId_milestoneId_idx" ON "RefundProposal"("projectId", "milestoneId");

-- CreateIndex
CREATE INDEX "RefundProposal_status_idx" ON "RefundProposal"("status");
