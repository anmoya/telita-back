import { Module } from "@nestjs/common";
import { AddPriceListItemUseCase } from "./application/use-cases/add-price-list-item.use-case";
import { PRICE_LIST_ITEM_REPOSITORY } from "./application/ports/price-list-item-repository.port";
import { PRICE_LIST_REPOSITORY } from "./application/ports/price-list-repository.port";
import { PRICE_CELL_REPOSITORY, QUOTE_REPOSITORY } from "./application/ports/price-repository.port";
import { BuildQuotePreviewUseCase } from "./application/use-cases/build-quote-preview.use-case";
import { CalculateQuoteBatchUseCase } from "./application/use-cases/calculate-quote-batch.use-case";
import { CalculateQuoteUseCase } from "./application/use-cases/calculate-quote.use-case";
import { CreatePriceListCellUseCase } from "./application/use-cases/create-price-list-cell.use-case";
import { CreatePriceListUseCase } from "./application/use-cases/create-price-list.use-case";
import { DeletePriceListCellUseCase } from "./application/use-cases/delete-price-list-cell.use-case";
import { DeletePriceListItemUseCase } from "./application/use-cases/delete-price-list-item.use-case";
import { GetPriceListItemsUseCase } from "./application/use-cases/get-price-list-items.use-case";
import { ListPriceListCellsUseCase } from "./application/use-cases/list-price-list-cells.use-case";
import { GetPriceListsUseCase } from "./application/use-cases/get-price-lists.use-case";
import { ListQuotesUseCase } from "./application/use-cases/list-quotes.use-case";
import { TogglePriceListStatusUseCase } from "./application/use-cases/toggle-price-list-status.use-case";
import { UpdatePriceListCellUseCase } from "./application/use-cases/update-price-list-cell.use-case";
import { UpdatePriceListItemUseCase } from "./application/use-cases/update-price-list-item.use-case";
import { UpdatePriceListUseCase } from "./application/use-cases/update-price-list.use-case";
import { PrismaPriceListItemRepository } from "./infrastructure/persistence/prisma/prisma-price-list-item.repository";
import { PrismaPriceListRepository } from "./infrastructure/persistence/prisma/prisma-price-list.repository";
import { PrismaPriceRepository } from "./infrastructure/persistence/prisma/prisma-price.repository";
import { PriceListsController } from "./presentation/controllers/price-lists.controller";
import { PricingController } from "./presentation/controllers/pricing.controller";

@Module({
  controllers: [PricingController, PriceListsController],
  providers: [
    PrismaPriceRepository,
    PrismaPriceListRepository,
    PrismaPriceListItemRepository,
    { provide: QUOTE_REPOSITORY, useExisting: PrismaPriceRepository },
    { provide: PRICE_CELL_REPOSITORY, useExisting: PrismaPriceRepository },
    { provide: PRICE_LIST_REPOSITORY, useExisting: PrismaPriceListRepository },
    { provide: PRICE_LIST_ITEM_REPOSITORY, useExisting: PrismaPriceListItemRepository },
    BuildQuotePreviewUseCase,
    CalculateQuoteUseCase,
    CalculateQuoteBatchUseCase,
    ListQuotesUseCase,
    GetPriceListsUseCase,
    CreatePriceListUseCase,
    UpdatePriceListUseCase,
    TogglePriceListStatusUseCase,
    GetPriceListItemsUseCase,
    AddPriceListItemUseCase,
    UpdatePriceListItemUseCase,
    DeletePriceListItemUseCase,
    ListPriceListCellsUseCase,
    CreatePriceListCellUseCase,
    UpdatePriceListCellUseCase,
    DeletePriceListCellUseCase
  ]
})
export class PricingModule {}
