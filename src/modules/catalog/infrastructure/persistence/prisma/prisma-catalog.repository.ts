import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";

export class PrismaCatalogRepository {
  async listSkus(branchCode: string) {
    return prismaClient.fabricSku.findMany({
      where: {
        branch: { code: branchCode },
        isActive: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        widthValue: true,
        lengthValue: true,
        thicknessValue: true,
        weightValue: true
      },
      orderBy: { name: "asc" }
    });
  }
}
