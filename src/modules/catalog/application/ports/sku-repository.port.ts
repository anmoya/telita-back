export interface SkuRepositoryPort {
  getSkuDimensionsM(skuId: string): Promise<{
    widthM: number;
    heightM: number;
  } | null>;
}
