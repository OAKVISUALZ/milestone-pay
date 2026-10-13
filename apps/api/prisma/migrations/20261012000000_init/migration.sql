-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "networkPassphrase" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "agreementId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "freelancerAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneIndex" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "deliverableCriteria" TEXT NOT NULL,
    "amountStroops" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "deliverableUrl" TEXT,
    "deliverableNotes" TEXT,
    "deliverableHash" TEXT,
    "deliverableSubmittedAt" TIMESTAMP(3),
    "fundedTxHash" TEXT,
    "releasedTxHash" TEXT,
    "refundedTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "contractId" TEXT NOT NULL,
    "lastCursor" TEXT,
    "lastLedger" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "txHash" TEXT,
    "agreementId" INTEGER,
    "milestoneId" INTEGER,
    "payload" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_nonce_key" ON "AuthChallenge"("nonce");

-- CreateIndex
CREATE INDEX "AuthChallenge_publicKey_idx" ON "AuthChallenge"("publicKey");

-- CreateIndex
CREATE INDEX "AuthChallenge_nonce_idx" ON "AuthChallenge"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "Project_agreementId_key" ON "Project"("agreementId");

-- CreateIndex
CREATE INDEX "Project_clientAddress_idx" ON "Project"("clientAddress");

-- CreateIndex
CREATE INDEX "Project_freelancerAddress_idx" ON "Project"("freelancerAddress");

-- CreateIndex
CREATE INDEX "Project_agreementId_idx" ON "Project"("agreementId");

-- CreateIndex
CREATE INDEX "Milestone_status_idx" ON "Milestone"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_projectId_milestoneIndex_key" ON "Milestone"("projectId", "milestoneIndex");

-- CreateIndex
CREATE INDEX "ProcessedEvent_contractId_idx" ON "ProcessedEvent"("contractId");

-- CreateIndex
CREATE INDEX "ProcessedEvent_eventType_idx" ON "ProcessedEvent"("eventType");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
