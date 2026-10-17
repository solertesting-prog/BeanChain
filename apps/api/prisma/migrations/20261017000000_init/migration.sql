-- CreateEnum
CREATE TYPE "Role" AS ENUM ('INVESTOR', 'OPERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvestorCategory" AS ENUM ('RETAIL', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Crop" AS ENUM ('CACAO', 'COFFEE');

-- CreateEnum
CREATE TYPE "FarmOwnerType" AS ENUM ('OWNER', 'COOPERATIVE', 'PRODUCER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FUNDED', 'ACTIVE', 'DISTRIBUTING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'TOKENS_ISSUED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'STABLECOIN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DistributionKind" AS ENUM ('PROFIT', 'PRINCIPAL', 'FINAL');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DRAFT', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "HarvestStage" AS ENUM ('FLOWERING', 'HARVESTING', 'FERMENTING_DRYING', 'EXPORT', 'SOLD', 'DISTRIBUTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'PROSPECTUS', 'KEY_INFO_SHEET', 'AGRONOMY_REPORT', 'BUYER_LETTER', 'LAND_TITLE', 'INVOICE', 'EXPORT_PERMIT', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PUBLIC', 'INVESTORS', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChainTxStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'FAILED', 'SIMULATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "country" CHAR(2) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "role" "Role" NOT NULL DEFAULT 'INVESTOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "investorCategory" "InvestorCategory" NOT NULL DEFAULT 'RETAIL',
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerifyToken" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "level" TEXT NOT NULL DEFAULT 'basic',
    "sanctionsHit" BOOLEAN NOT NULL DEFAULT false,
    "pepHit" BOOLEAN NOT NULL DEFAULT false,
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "custodial" BOOLEAN NOT NULL DEFAULT true,
    "encryptedKey" TEXT,
    "onchainRegisteredAt" TIMESTAMP(3),
    "registryTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crop" "Crop" NOT NULL,
    "varieties" TEXT[],
    "country" CHAR(2) NOT NULL,
    "region" TEXT NOT NULL,
    "municipality" TEXT,
    "hectares" DOUBLE PRECISION NOT NULL,
    "altitudeM" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerType" "FarmOwnerType" NOT NULL DEFAULT 'OWNER',
    "productionHistory" JSONB NOT NULL DEFAULT '[]',
    "sanctionsClear" BOOLEAN NOT NULL DEFAULT false,
    "sanctionsNote" TEXT,
    "sanctionsCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "harvestYear" INTEGER NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DRAFT',
    "coverImageUrl" TEXT,
    "targetAmountCents" INTEGER NOT NULL,
    "tokenPriceCents" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "minTokens" INTEGER NOT NULL DEFAULT 1,
    "maxTokensPerInvestor" INTEGER,
    "expectedReturnBps" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 300,
    "buyerName" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'HIGH',
    "risks" TEXT[],
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "expectedPayoutAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "blockedCountries" TEXT[],
    "maxHolders" INTEGER,
    "tokenName" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenAddress" TEXT,
    "complianceAddress" TEXT,
    "chainId" INTEGER,
    "deployTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "riskAcknowledgedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "mintTxHash" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "kind" "DistributionKind" NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "txHash" TEXT,
    "error" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionPayout" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "claimTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestUpdate" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "stage" "HarvestStage" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarvestUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "farmId" TEXT,
    "harvestUpdateId" TEXT,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INVESTORS',
    "anchoredTxHash" TEXT,
    "anchoredAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainTransaction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "txHash" TEXT,
    "status" "ChainTxStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "KycVerification_userId_createdAt_idx" ON "KycVerification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KycVerification_provider_externalId_key" ON "KycVerification"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_slug_key" ON "Farm"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_slug_key" ON "Opportunity"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_tokenSymbol_key" ON "Opportunity"("tokenSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_tokenAddress_key" ON "Opportunity"("tokenAddress");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_paymentReference_key" ON "Investment"("paymentReference");

-- CreateIndex
CREATE INDEX "Investment_opportunityId_status_idx" ON "Investment"("opportunityId", "status");

-- CreateIndex
CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_externalId_key" ON "Payment"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Distribution_opportunityId_idx" ON "Distribution"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionPayout_distributionId_userId_key" ON "DistributionPayout"("distributionId", "userId");

-- CreateIndex
CREATE INDEX "HarvestUpdate_opportunityId_publishedAt_idx" ON "HarvestUpdate"("opportunityId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_opportunityId_idx" ON "Document"("opportunityId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "ChainTransaction_reference_idx" ON "ChainTransaction"("reference");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionPayout" ADD CONSTRAINT "DistributionPayout_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionPayout" ADD CONSTRAINT "DistributionPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestUpdate" ADD CONSTRAINT "HarvestUpdate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestUpdate" ADD CONSTRAINT "HarvestUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_harvestUpdateId_fkey" FOREIGN KEY ("harvestUpdateId") REFERENCES "HarvestUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

