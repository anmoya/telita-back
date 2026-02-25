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
}
