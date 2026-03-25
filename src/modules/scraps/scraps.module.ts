import { Module } from "@nestjs/common";
import { PrismaSettingsRepository } from "../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { ScrapsOperationsService } from "./application/services/scraps-operations.service";
import { StorageLocationsService } from "./application/services/storage-locations.service";
import { PrismaScrapsRepository } from "./infrastructure/persistence/prisma/prisma-scraps.repository";
import { ScrapAllocationService } from "./infrastructure/services/scrap-allocation.service";
import { ScrapCutOperationsService } from "./infrastructure/services/scrap-cut-operations.service";
import { ScrapMatchingService } from "./infrastructure/services/scrap-matching.service";
import { ScrapSoftHoldsService } from "./infrastructure/services/scrap-soft-holds.service";
import { ScrapStorageLocationsService } from "./infrastructure/services/scrap-storage-locations.service";
import { ScrapsController } from "./presentation/controllers/scraps.controller";
import { StorageLocationsController } from "./presentation/controllers/storage-locations.controller";

@Module({
  controllers: [ScrapsController, StorageLocationsController],
  providers: [
    PrismaScrapsRepository,
    PrismaSettingsRepository,
    ScrapsOperationsService,
    StorageLocationsService,
    ScrapAllocationService,
    ScrapCutOperationsService,
    ScrapStorageLocationsService,
    ScrapSoftHoldsService,
    ScrapMatchingService
  ],
  exports: [PrismaScrapsRepository]
})
export class ScrapsModule {}
