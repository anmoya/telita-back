import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export class SaleQuoteItemDto {
  @IsString()
  skuCode!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedWidthM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedHeightM!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  roomAreaName?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  lineNote?: string;
}

export class CreateSaleFromQuoteDto {
  @IsString()
  branchCode!: string;

  @IsString()
  priceListName!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscountPct?: number;

  @IsOptional()
  @IsString()
  manualDiscountReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commercialAdjustmentPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installationAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleQuoteItemDto)
  items!: SaleQuoteItemDto[];
}

export class CreateSaleDraftDto {
  @IsString()
  branchCode!: string;

  @IsString()
  priceListName!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscountPct?: number;

  @IsOptional()
  @IsString()
  manualDiscountReason?: string;
}

export class SaleLineMutationDto {
  @IsString()
  skuCode!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedWidthM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedHeightM!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  roomAreaName?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  categoryName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  lineNote?: string | null;
}

export class CancelSaleDto {
  @IsOptional()
  @IsString()
  canceledReason?: string;
}

export class AllocateScrapDto {
  @IsString()
  scrapId!: string;
}

export class UpdateSaleCustomerDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  customerName?: string | null;

  @IsOptional()
  @IsString()
  customerReference?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscountPct?: number | null;

  @IsOptional()
  @IsString()
  manualDiscountReason?: string | null;
}

export class UpdatePaymentSummaryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid!: number;
}

export class OfferPreviewDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lineIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limitPerLine?: number;
}

export class PickListItemDto {
  @IsString()
  saleLineId!: string;

  @IsString()
  scrapId!: string;
}

export class PickListDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickListItemDto)
  items!: PickListItemDto[];
}

export class AutoScrapAssignmentItemDto {
  @IsString()
  saleLineId!: string;

  @IsString()
  saleLinePieceId!: string;

  @IsString()
  scrapId!: string;
}

export class CommitAutoScrapAssignmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AutoScrapAssignmentItemDto)
  items!: AutoScrapAssignmentItemDto[];
}
