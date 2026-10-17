export type Role = 'INVESTOR' | 'OPERATOR' | 'ADMIN';
export type KycStatus = 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type OpportunityStatus = 'DRAFT' | 'PUBLISHED' | 'FUNDED' | 'ACTIVE' | 'DISTRIBUTING' | 'CLOSED' | 'CANCELLED';
export type HarvestStage = 'FLOWERING' | 'HARVESTING' | 'FERMENTING_DRYING' | 'EXPORT' | 'SOLD' | 'DISTRIBUTED';
export type InvestmentStatus = 'PENDING_PAYMENT' | 'PAID' | 'TOKENS_ISSUED' | 'CANCELLED' | 'REFUNDED';
export type DocumentType =
  | 'CONTRACT'
  | 'PROSPECTUS'
  | 'KEY_INFO_SHEET'
  | 'AGRONOMY_REPORT'
  | 'BUYER_LETTER'
  | 'LAND_TITLE'
  | 'INVOICE'
  | 'EXPORT_PERMIT'
  | 'PHOTO'
  | 'OTHER';

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  country: string;
  role: Role;
  investorCategory: 'RETAIL' | 'PROFESSIONAL';
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  wallet: { address: string; custodial: boolean; onchainRegisteredAt: string | null } | null;
  kyc: { status: KycStatus; approvedAt?: string | null; expiresAt?: string | null; rejectReason?: string | null };
}

export interface OpportunityStats {
  tokensSold: number;
  tokensReserved: number;
  tokensAvailable: number;
  raisedCents: number;
  investorsCount: number;
  progressPct: number;
}

export interface OpportunitySummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: OpportunityStatus;
  harvestYear: number;
  coverImageUrl: string | null;
  targetAmountCents: number;
  tokenPriceCents: number;
  totalTokens: number;
  minTokens: number;
  maxTokensPerInvestor: number | null;
  expectedReturnBps: number;
  termMonths: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  opensAt: string | null;
  closesAt: string | null;
  tokenSymbol: string;
  currentStage: HarvestStage | null;
  farm: { name: string; crop: 'CACAO' | 'COFFEE'; varieties: string[]; country: string; region: string; hectares: number };
  stats: OpportunityStats;
}

export interface DocumentInfo {
  id: string;
  type: DocumentType;
  title: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  visibility: 'PUBLIC' | 'INVESTORS' | 'ADMIN';
  anchoredTxHash: string | null;
  anchoredAt: string | null;
  explorerUrl: string | null;
}

export interface OpportunityDetail extends OpportunitySummary {
  description: string;
  risks: string[];
  buyerName: string | null;
  platformFeeBps: number;
  expectedPayoutAt: string | null;
  blockedCountries: string[];
  farm: OpportunitySummary['farm'] & {
    municipality: string | null;
    altitudeM: number | null;
    latitude: number | null;
    longitude: number | null;
    description: string;
    ownerName: string;
    ownerType: string;
    productionHistory: { year: number; kg: number; pricePerKgCents?: number }[];
  };
  token: {
    name: string;
    symbol: string;
    standard: string;
    address: string | null;
    chainId: number | null;
    explorerUrl: string | null;
    deployTxHash: string | null;
    decimals: number;
  };
  updates: {
    id: string;
    stage: HarvestStage;
    title: string;
    body: string;
    publishedAt: string;
    documents: { id: string; title: string; type: DocumentType; mimeType: string }[];
  }[];
  documents: DocumentInfo[];
  viewer: { isInvestor: boolean; kycApproved: boolean };
}

export interface Investment {
  id: string;
  opportunityId: string;
  opportunity?: { title: string; slug: string; tokenSymbol?: string; status?: OpportunityStatus };
  tokens: number;
  amountCents: number;
  status: InvestmentStatus;
  paymentMethod: 'BANK_TRANSFER' | 'CARD' | 'STABLECOIN';
  paymentReference: string;
  expiresAt: string;
  paidAt: string | null;
  issuedAt: string | null;
  mintTxHash: string | null;
  mintExplorerUrl: string | null;
  createdAt: string;
}

export interface CreatedInvestment extends Investment {
  paymentInstructions:
    | { method: 'BANK_TRANSFER'; iban: string; bic: string; beneficiary: string; reference: string; amountCents: number; expiresAt: string }
    | { method: 'CARD'; checkoutUrl?: string };
}

export interface Portfolio {
  totals: { investedCents: number; receivedCents: number; estimatedValueCents: number; pendingCents: number };
  nextPayout: { opportunityTitle: string; expectedAt: string; estimatedCents: number } | null;
  holdings: {
    opportunity: {
      id: string;
      slug: string;
      title: string;
      status: OpportunityStatus;
      harvestYear: number;
      tokenSymbol: string;
      tokenAddress: string | null;
      explorerUrl: string | null;
      expectedReturnBps: number;
      expectedPayoutAt: string | null;
      farm: { name: string; crop: string; region: string; country: string };
      latestUpdate: { stage: HarvestStage; title: string; publishedAt: string } | null;
    };
    tokens: number;
    pendingTokens: number;
    pendingCents: number;
    investedCents: number;
    receivedCents: number;
    expectedTotalCents: number;
    estimatedValueCents: number;
  }[];
  payouts: { id: string; opportunityId: string; kind: string; amountCents: number; tokens: number; executedAt: string; explorerUrl: string | null }[];
  wallet: { address: string; custodial: boolean; verified: boolean; explorerUrl: string | null } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
