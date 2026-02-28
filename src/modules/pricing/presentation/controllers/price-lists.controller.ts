import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { createPriceListUseCase } from "../../infrastructure/factories/create-price-list-use-case.factory";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("price-lists")
export class PriceListsController {
  private readonly factory = createPriceListUseCase();

  @Get()
  async list(@Query("branchCode") branchCode = "MAIN", @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.factory.getPriceListsUseCase.execute(branchCode);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreatePriceListBody, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.factory.createPriceListUseCase.execute(body);
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: UpdatePriceListBody, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.factory.updatePriceListUseCase.execute({ id, ...body });
  }

  @Patch(":id/status")
  async toggleStatus(@Param("id") id: string, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.factory.togglePriceListStatusUseCase.execute(id);
  }

  @Get(":id/items")
  async listItems(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.factory.getPriceListItemsUseCase.execute(id);
  }

  @Post(":id/items")
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Param("id") priceListId: string,
    @Body() body: AddPriceListItemBody,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return this.factory.addPriceListItemUseCase.execute({ priceListId, ...body });
    } catch (error) {
      // SPEC-30: Handle duplicate SKU with 409 Conflict
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("SKU already exists in this price list")) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  @Put(":id/items/:itemId")
  async updateItem(
    @Param("id") _priceListId: string,
    @Param("itemId") itemId: string,
    @Body() body: UpdatePriceListItemBody,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.factory.updatePriceListItemUseCase.execute({ id: itemId, ...body });
  }

  @Delete(":id/items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(
    @Param("id") _priceListId: string,
    @Param("itemId") itemId: string,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    await this.factory.deletePriceListItemUseCase.execute(itemId);
  }

  // SPEC-31: Price list cell endpoints
  @Get(":id/cells")
  async listCells(
    @Param("id") priceListId: string,
    @Query("skuId") skuId?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const { prismaClient } = await import("../../../../shared/infrastructure/persistence/prisma-client");
    const { PrismaPriceRepository } = await import("../../infrastructure/persistence/prisma/prisma-price.repository");
    const priceRepo = new PrismaPriceRepository(prismaClient);
    return priceRepo.listCells(priceListId, skuId);
  }

  @Post(":id/cells")
  @HttpCode(HttpStatus.CREATED)
  async createCell(
    @Param("id") priceListId: string,
    @Body() body: CreatePriceListCellBody,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);

    // Resolve skuCode to skuId
    const { prismaClient } = await import("../../../../shared/infrastructure/persistence/prisma-client");
    const priceList = await prismaClient.priceList.findUnique({
      where: { id: priceListId },
      select: { branchId: true }
    });
    if (!priceList) {
      throw new Error("Price list not found");
    }

    const sku = await prismaClient.fabricSku.findFirst({
      where: { branchId: priceList.branchId, code: body.skuCode, isActive: true },
      select: { id: true }
    });
    if (!sku) {
      throw new Error("SKU not found");
    }

    const { PrismaPriceRepository } = await import("../../infrastructure/persistence/prisma/prisma-price.repository");
    const priceRepo = new PrismaPriceRepository(prismaClient);
    return priceRepo.createCell({
      priceListId,
      skuId: sku.id,
      maxWidthM: body.maxWidthM,
      maxHeightM: body.maxHeightM,
      unitPrice: body.unitPrice
    });
  }

  @Put(":id/cells/:cellId")
  async updateCell(
    @Param("id") _priceListId: string,
    @Param("cellId") cellId: string,
    @Body() body: UpdatePriceListCellBody,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    const { prismaClient } = await import("../../../../shared/infrastructure/persistence/prisma-client");
    const { PrismaPriceRepository } = await import("../../infrastructure/persistence/prisma/prisma-price.repository");
    const priceRepo = new PrismaPriceRepository(prismaClient);
    return priceRepo.updateCell(cellId, body);
  }

  @Delete(":id/cells/:cellId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCell(
    @Param("id") _priceListId: string,
    @Param("cellId") cellId: string,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    const { prismaClient } = await import("../../../../shared/infrastructure/persistence/prisma-client");
    const { PrismaPriceRepository } = await import("../../infrastructure/persistence/prisma/prisma-price.repository");
    const priceRepo = new PrismaPriceRepository(prismaClient);
    await priceRepo.deleteCell(cellId);
  }
}

type CreatePriceListBody = {
  branchCode: string;
  name: string;
  currencyCode: string;
  validFrom: string;
  validTo?: string | null;
};

type UpdatePriceListBody = {
  name?: string;
  validFrom?: string;
  validTo?: string | null;
};

type AddPriceListItemBody = {
  skuCode: string;
  basePrice: number;
  discountPct: number;
};

type UpdatePriceListItemBody = {
  basePrice?: number;
  discountPct?: number;
};

type CreatePriceListCellBody = {
  skuCode: string;
  maxWidthM: number;
  maxHeightM: number;
  unitPrice: number;
};

type UpdatePriceListCellBody = {
  maxWidthM?: number;
  maxHeightM?: number;
  unitPrice?: number;
};
