export interface SaleRepositoryPort {
  createDraft(input: {
    branchId: string;
    createdBy: string;
    priceListId: string;
  }): Promise<{ saleId: string }>;
}
