import { InvestmentStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateInvestmentDto {
  @IsString() opportunityId: string;
  @IsInt() @Min(1) @Max(1_000_000) tokens: number;
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  /** El inversor confirma haber leído la ficha de datos y los riesgos. */
  @IsBoolean() riskAcknowledged: boolean;
  /** Patrimonio declarado (céntimos), para el límite del 5 % de minoristas. */
  @IsOptional() @IsInt() @Min(0) netWorthCents?: number;
  /** Aceptación expresa del aviso al superar el límite de minoristas. */
  @IsOptional() @IsBoolean() acknowledgeRetailLimit?: boolean;
}

export class ConfirmPaymentDto {
  @IsInt() @Min(1) amountCents: number;
  @IsString() @MaxLength(120) bankReference: string;
}

export class ListInvestmentsQuery {
  @IsOptional() @IsEnum(InvestmentStatus) status?: InvestmentStatus;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
