import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateQuoteDto {
  @IsString()
  branchCode!: string;

  @IsString()
  skuCode!: string;

  @IsString()
  priceListName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedWidthM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedHeightM!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class QuoteBatchItemDto {
  @IsString()
  clientItemId!: string;

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
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class QuoteBatchRequestDto {
  @IsString()
  branchCode!: string;

  @IsString()
  priceListName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteBatchItemDto)
  items!: QuoteBatchItemDto[];
}

export class PreviewItemDto {
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
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;
}

export class PreviewRequestDto {
  @IsIn(["CUSTOMER", "INTERNAL"])
  mode!: "CUSTOMER" | "INTERNAL";

  @IsString()
  branchCode!: string;

  @IsString()
  priceListName!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewItemDto)
  items!: PreviewItemDto[];
}
