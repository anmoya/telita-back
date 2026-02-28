export interface PriceRepositoryPort {
  getQuoteContext(params: {
    branchCode: string;
    createdByEmail: string;
    skuCode: string;
    priceListName: string;
  }): Promise<{
    branchId: string;
    createdBy: string;
    skuId: string;
    priceListId: string;
    currencyCode: string;
    skuWidthM: number;
    unitPrice: number;
    discountPct: number; // from price_list_item
  } | null>;

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

  // Price list cell methods (SPEC-31)
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
