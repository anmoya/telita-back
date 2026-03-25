import { Module } from "@nestjs/common";
import { CreateSkuUseCase } from "./application/use-cases/create-sku.use-case";
import { ListAllSkusUseCase } from "./application/use-cases/list-all-skus.use-case";
import { ListSkusUseCase } from "./application/use-cases/list-skus.use-case";
import { ListUnitsUseCase } from "./application/use-cases/list-units.use-case";
import { SetSkuStatusUseCase } from "./application/use-cases/set-sku-status.use-case";
import { UpdateSkuUseCase } from "./application/use-cases/update-sku.use-case";
import { PrismaCatalogRepository } from "./infrastructure/persistence/prisma/prisma-catalog.repository";
import { CatalogController } from "./presentation/controllers/catalog.controller";

@Module({
  controllers: [CatalogController],
  providers: [
    PrismaCatalogRepository,
    ListSkusUseCase,
    ListAllSkusUseCase,
    ListUnitsUseCase,
    CreateSkuUseCase,
    UpdateSkuUseCase,
    SetSkuStatusUseCase
  ]
})
export class CatalogModule {}
