export interface PriceListItemRepositoryPort {
  getByPriceListId(priceListId: string): Promise<PriceListItemDetail[]>;

  create(params: CreatePriceListItemParams): Promise<{ id: string }>;

  update(id: string, params: UpdatePriceListItemParams): Promise<void>;

  delete(id: string): Promise<void>;

  existsByPriceListAndSku(priceListId: string, skuId: string): Promise<boolean>;

  getById(id: string): Promise<PriceListItemDetail | null>;
}

export interface PriceListItemDetail {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  basePrice: number;
  discountPct: number;
  finalPrice: number;
}

export interface CreatePriceListItemParams {
  priceListId: string;
  skuCode: string;
  basePrice: number;
  discountPct: number;
}

export interface UpdatePriceListItemParams {
  basePrice?: number;
  discountPct?: number;
}
