export const PRICE_LIST_REPOSITORY = Symbol("PRICE_LIST_REPOSITORY");

export interface PriceListRepositoryPort {
  getByBranchCode(branchCode: string): Promise<PriceListSummary[]>;

  getById(id: string): Promise<PriceListDetail | null>;

  create(params: CreatePriceListParams): Promise<{ id: string }>;

  update(id: string, params: UpdatePriceListParams): Promise<void>;

  toggleStatus(id: string): Promise<boolean>;

  hasActiveSales(priceListId: string): Promise<boolean>;
}

export interface PriceListSummary {
  id: string;
  name: string;
  currencyCode: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  itemCount: number;
}

export interface PriceListDetail {
  id: string;
  branchId: string;
  branchCode: string;
  name: string;
  currencyCode: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreatePriceListParams {
  branchCode: string;
  name: string;
  currencyCode: string;
  validFrom: Date;
  validTo?: Date | null;
}

export interface UpdatePriceListParams {
  name?: string;
  validFrom?: Date;
  validTo?: Date | null;
}
