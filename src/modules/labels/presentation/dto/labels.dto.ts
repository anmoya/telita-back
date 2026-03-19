import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateLabelBatchItemDto {
  @IsIn(["SALE_LINE", "SCRAP"])
  type!: "SALE_LINE" | "SCRAP";

  @IsOptional()
  @IsString()
  saleLineId?: string;

  @IsOptional()
  @IsString()
  scrapId?: string;
}

export class CreateGenericLabelBatchDto {
  @IsString()
  branchCode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLabelBatchItemDto)
  items!: CreateLabelBatchItemDto[];
}

export class BatchPrintDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labelIds!: string[];
}
