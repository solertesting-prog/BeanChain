import { Crop, FarmOwnerType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionYearDto {
  @IsInt() @Min(1990) @Max(2100) year: number;
  @IsInt() @Min(0) kg: number;
  @IsOptional() @IsInt() @Min(0) pricePerKgCents?: number;
}

export class CreateFarmDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{3,80}$/) slug?: string;
  @IsEnum(Crop) crop: Crop;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) varieties: string[];
  @IsString() @Matches(/^[A-Za-z]{2}$/) country: string;
  @IsString() @Length(2, 120) region: string;
  @IsOptional() @IsString() @MaxLength(120) municipality?: string;
  @IsNumber() @Min(0.1) @Max(100_000) hectares: number;
  @IsOptional() @IsInt() @Min(0) @Max(6000) altitudeM?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsString() @Length(10, 5000) description: string;
  @IsString() @Length(2, 160) ownerName: string;
  @IsOptional() @IsEnum(FarmOwnerType) ownerType?: FarmOwnerType;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProductionYearDto)
  productionHistory?: ProductionYearDto[];
}

export class UpdateFarmDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEnum(Crop) crop?: Crop;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) varieties?: string[];
  @IsOptional() @IsString() @Length(2, 120) region?: string;
  @IsOptional() @IsString() @MaxLength(120) municipality?: string;
  @IsOptional() @IsNumber() @Min(0.1) @Max(100_000) hectares?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6000) altitudeM?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @Length(10, 5000) description?: string;
  @IsOptional() @IsString() @Length(2, 160) ownerName?: string;
  @IsOptional() @IsEnum(FarmOwnerType) ownerType?: FarmOwnerType;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProductionYearDto)
  productionHistory?: ProductionYearDto[];
}

export class SanctionsCheckDto {
  @IsBoolean() clear: boolean;
  @IsString() @Length(5, 2000) note: string;
}
