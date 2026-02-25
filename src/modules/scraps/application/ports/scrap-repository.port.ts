export interface ScrapRepositoryPort {
  saveComputedScrap(input: {
    saleLineId: string;
    widthM: number;
    heightM: number;
    areaM2: number;
    createdAt: Date;
  }): Promise<void>;
}
