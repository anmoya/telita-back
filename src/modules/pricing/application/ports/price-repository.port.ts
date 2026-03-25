export const QUOTE_REPOSITORY = Symbol("QUOTE_REPOSITORY");
export const PRICE_CELL_REPOSITORY = Symbol("PRICE_CELL_REPOSITORY");

export type QuoteContextResolution =
  | {
      ok: true;
      branchId: string;
      createdBy: string;
      skuId: string;
      priceListId: string;
      currencyCode: string;
      skuWidthM: number;
      unitPrice: number;
      discountPct: number;
    }
  | {
      ok: false;
      reason:
        | "BRANCH_NOT_FOUND"
        | "USER_NOT_FOUND"
        | "SKU_NOT_FOUND"
        | "PRICE_LIST_NOT_FOUND"
        | "SKU_NOT_IN_PRICE_LIST";
    };

export interface QuoteRepositoryPort {
  getQuoteContext(params: {
    branchCode: string;
    createdByEmail: string;
    skuCode: string;
    priceListName: string;
  }): Promise<QuoteContextResolution>;

  saveQuote(params: {
    branchId: string;
    createdBy: string;
    skuId: string;
    priceListId: string;
    currencyCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    quantity: number;
    unitPrice: number;
    linearMeters: number;
    subtotalAmount: number;
    totalRounded: number;
    createdAt: Date;
  }): Promise<{ quoteId: string }>;

  listQuotes(branchCode: string): Promise<
    Array<{
      id: string;
      currencyCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      unitPrice: number;
      linearMeters: number;
      subtotalAmount: number;
      totalRounded: number;
      createdAt: string;
    }>
  >;

  getBranchSummaryByCode(branchCode: string): Promise<{ id: string; name: string } | null>;
}

export interface PriceCellRepositoryPort {
  getCellPrice(params: {
    priceListId: string;
    skuId: string;
    requestedWidthM: number;
    requestedHeightM: number;
  }): Promise<{ unitPrice: number; cellId: string } | null>;

  listCells(priceListId: string, skuId?: string): Promise<
    Array<{
      id: string;
      priceListId: string;
      skuId: string;
      maxWidthM: number;
      maxHeightM: number;
      unitPrice: number;
    }>
  >;

  createCell(params: {
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }): Promise<{
    id: string;
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }>;

  createCellBySkuCode(params: {
    priceListId: string;
    skuCode: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }): Promise<{
    id: string;
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }>;

  updateCell(
    cellId: string,
    params: Partial<{
      maxWidthM: number;
      maxHeightM: number;
      unitPrice: number;
    }>,
  ): Promise<{
    id: string;
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }>;

  deleteCell(cellId: string): Promise<void>;
}
