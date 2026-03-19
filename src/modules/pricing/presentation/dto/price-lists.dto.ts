import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreatePriceListDto {
  @IsString()
  branchCode!: string;

  @IsString()
  name!: string;

  @IsString()
  currencyCode!: string;

  @IsString()
  validFrom!: string;

  @IsOptional()
  @IsString()
  validTo?: string | null;
}

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string | null;
}

export class AddPriceListItemDto {
  @IsString()
  skuCode!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  basePrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct!: number;
}

export class UpdatePriceListItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  basePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;
}

export class CreatePriceListCellDto {
  @IsString()
  skuCode!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  maxWidthM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  maxHeightM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPrice!: number;
}

export class UpdatePriceListCellDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  maxWidthM?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  maxHeightM?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPrice?: number;
}
