import { GetPriceListsUseCase } from "../../application/use-cases/get-price-lists.use-case";
import { CreatePriceListUseCase } from "../../application/use-cases/create-price-list.use-case";
import { UpdatePriceListUseCase } from "../../application/use-cases/update-price-list.use-case";
import { TogglePriceListStatusUseCase } from "../../application/use-cases/toggle-price-list-status.use-case";
import { GetPriceListItemsUseCase } from "../../application/use-cases/get-price-list-items.use-case";
import { AddPriceListItemUseCase } from "../../application/use-cases/add-price-list-item.use-case";
import { UpdatePriceListItemUseCase } from "../../application/use-cases/update-price-list-item.use-case";
import { DeletePriceListItemUseCase } from "../../application/use-cases/delete-price-list-item.use-case";
import { PrismaPriceListRepository } from "../persistence/prisma/prisma-price-list.repository";
import { PrismaPriceListItemRepository } from "../persistence/prisma/prisma-price-list-item.repository";
import { prismaClient } from "../../../../shared/infrastructure/persistence/prisma-client";

export function createPriceListUseCase() {
  const priceListRepo = new PrismaPriceListRepository(prismaClient);
  const itemRepo = new PrismaPriceListItemRepository(prismaClient);

  return {
    getPriceListsUseCase: new GetPriceListsUseCase(priceListRepo),
    createPriceListUseCase: new CreatePriceListUseCase(priceListRepo),
    updatePriceListUseCase: new UpdatePriceListUseCase(priceListRepo),
    togglePriceListStatusUseCase: new TogglePriceListStatusUseCase(priceListRepo),
    getPriceListItemsUseCase: new GetPriceListItemsUseCase(itemRepo),
    addPriceListItemUseCase: new AddPriceListItemUseCase(itemRepo),
    updatePriceListItemUseCase: new UpdatePriceListItemUseCase(itemRepo),
    deletePriceListItemUseCase: new DeletePriceListItemUseCase(itemRepo)
  };
}
