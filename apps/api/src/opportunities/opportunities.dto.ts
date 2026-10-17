import { OpportunityStatus, RiskLevel } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOpportunityDto {
  @IsString() farmId: string;
  @IsString() @Length(5, 140) title: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{3,80}$/) slug?: string;
  @IsString() @Length(10, 300) summary: string;
  @IsString() @Length(20, 20_000) description: string;
  @IsInt() @Min(2024) @Max(2100) harvestYear: number;

  @IsInt() @Min(100) @Max(100_000_00) tokenPriceCents: number; // 1 € – 100.000 €
  @IsInt() @Min(1) @Max(1_000_000) totalTokens: number;
  @IsOptional() @IsInt() @Min(1) minTokens?: number;
  @IsOptional() @IsInt() @Min(1) maxTokensPerInvestor?: number;
  @IsInt() @Min(0) @Max(10_000) expectedReturnBps: number;
  @IsInt() @Min(1) @Max(120) termMonths: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000) platformFeeBps?: number;
  @IsOptional() @IsString() @MaxLength(160) buyerName?: string;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(200, { each: true }) risks: string[];

  @IsOptional() @IsISO8601() opensAt?: string;
  @IsOptional() @IsISO8601() closesAt?: string;
  @IsOptional() @IsISO8601() expectedPayoutAt?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(250) @Matches(/^[A-Za-z]{2}$/, { each: true }) blockedCountries?: string[];
  @IsOptional() @IsInt() @Min(1) maxHolders?: number;

  @IsString() @Matches(/^[A-Z0-9-]{3,16}$/, { message: 'Símbolo: 3-16 caracteres A-Z, 0-9 o guiones' }) tokenSymbol: string;
  @IsOptional() @IsString() @Length(3, 80) tokenName?: string;
  @IsOptional() @IsUrl({ require_tld: false }) coverImageUrl?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @Length(5, 140) title?: string;
  @IsOptional() @IsString() @Length(10, 300) summary?: string;
  @IsOptional() @IsString() @Length(20, 20_000) description?: string;
  @IsOptional() @IsInt() @Min(100) @Max(100_000_00) tokenPriceCents?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) totalTokens?: number;
  @IsOptional() @IsInt() @Min(1) minTokens?: number;
  @IsOptional() @IsInt() @Min(1) maxTokensPerInvestor?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) expectedReturnBps?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) termMonths?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000) platformFeeBps?: number;
  @IsOptional() @IsString() @MaxLength(160) buyerName?: string;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) risks?: string[];
  @IsOptional() @IsISO8601() opensAt?: string;
  @IsOptional() @IsISO8601() closesAt?: string;
  @IsOptional() @IsISO8601() expectedPayoutAt?: string;
  @IsOptional() @IsArray() @Matches(/^[A-Za-z]{2}$/, { each: true }) blockedCountries?: string[];
  @IsOptional() @IsInt() @Min(1) maxHolders?: number;
  @IsOptional() @IsUrl({ require_tld: false }) coverImageUrl?: string;
}

export class TransitionDto {
  @IsEnum(OpportunityStatus) to: OpportunityStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
