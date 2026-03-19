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
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";
import { AddPriceListItemUseCase } from "../../application/use-cases/add-price-list-item.use-case";
import { CreatePriceListUseCase } from "../../application/use-cases/create-price-list.use-case";
import { DeletePriceListItemUseCase } from "../../application/use-cases/delete-price-list-item.use-case";
import { GetPriceListItemsUseCase } from "../../application/use-cases/get-price-list-items.use-case";
import { GetPriceListsUseCase } from "../../application/use-cases/get-price-lists.use-case";
import { TogglePriceListStatusUseCase } from "../../application/use-cases/toggle-price-list-status.use-case";
import { UpdatePriceListItemUseCase } from "../../application/use-cases/update-price-list-item.use-case";
import { UpdatePriceListUseCase } from "../../application/use-cases/update-price-list.use-case";
import { PrismaPriceListItemRepository } from "../../infrastructure/persistence/prisma/prisma-price-list-item.repository";
import { PrismaPriceListRepository } from "../../infrastructure/persistence/prisma/prisma-price-list.repository";
import { PrismaPriceRepository } from "../../infrastructure/persistence/prisma/prisma-price.repository";
import {
  AddPriceListItemDto,
  CreatePriceListCellDto,
  CreatePriceListDto,
  UpdatePriceListCellDto,
  UpdatePriceListDto,
  UpdatePriceListItemDto
} from "../dto/price-lists.dto";

@Controller("price-lists")
export class PriceListsController {
  private readonly getPriceListsUseCase: GetPriceListsUseCase;
  private readonly createPriceListUseCase: CreatePriceListUseCase;
  private readonly updatePriceListUseCase: UpdatePriceListUseCase;
  private readonly togglePriceListStatusUseCase: TogglePriceListStatusUseCase;
  private readonly getPriceListItemsUseCase: GetPriceListItemsUseCase;
  private readonly addPriceListItemUseCase: AddPriceListItemUseCase;
  private readonly updatePriceListItemUseCase: UpdatePriceListItemUseCase;
  private readonly deletePriceListItemUseCase: DeletePriceListItemUseCase;

  constructor(
    private readonly priceListRepo: PrismaPriceListRepository,
    private readonly itemRepo: PrismaPriceListItemRepository,
    private readonly priceRepo: PrismaPriceRepository
  ) {
    this.getPriceListsUseCase = new GetPriceListsUseCase(priceListRepo);
    this.createPriceListUseCase = new CreatePriceListUseCase(priceListRepo);
    this.updatePriceListUseCase = new UpdatePriceListUseCase(priceListRepo);
    this.togglePriceListStatusUseCase = new TogglePriceListStatusUseCase(priceListRepo);
    this.getPriceListItemsUseCase = new GetPriceListItemsUseCase(itemRepo);
    this.addPriceListItemUseCase = new AddPriceListItemUseCase(itemRepo);
    this.updatePriceListItemUseCase = new UpdatePriceListItemUseCase(itemRepo);
    this.deletePriceListItemUseCase = new DeletePriceListItemUseCase(itemRepo);
  }

  @Get()
  async list(@Query("branchCode") branchCode = "MAIN", @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.getPriceListsUseCase.execute(branchCode);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreatePriceListDto, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.createPriceListUseCase.execute(body);
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: UpdatePriceListDto, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.updatePriceListUseCase.execute({ id, ...body });
  }

  @Patch(":id/status")
  async toggleStatus(@Param("id") id: string, @Headers("authorization") authorization: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.togglePriceListStatusUseCase.execute(id);
  }

  @Get(":id/items")
  async listItems(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.getPriceListItemsUseCase.execute(id);
  }

  @Post(":id/items")
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Param("id") priceListId: string,
    @Body() body: AddPriceListItemDto,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return this.addPriceListItemUseCase.execute({ priceListId, ...body });
    } catch (error) {
      // SPEC-30: Handle duplicate SKU with 409 Conflict
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("SKU already exists in this price list") || message.includes("SKU ya existe en esta lista de precios")) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  @Put(":id/items/:itemId")
  async updateItem(
    @Param("id") _priceListId: string,
    @Param("itemId") itemId: string,
    @Body() body: UpdatePriceListItemDto,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.updatePriceListItemUseCase.execute({ id: itemId, ...body });
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
    await this.deletePriceListItemUseCase.execute(itemId);
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
    return this.priceRepo.listCells(priceListId, skuId);
  }

  @Post(":id/cells")
  @HttpCode(HttpStatus.CREATED)
  async createCell(
    @Param("id") priceListId: string,
    @Body() body: CreatePriceListCellDto,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.priceRepo.createCellBySkuCode({
      priceListId,
      skuCode: body.skuCode,
      maxWidthM: body.maxWidthM,
      maxHeightM: body.maxHeightM,
      unitPrice: body.unitPrice
    });
  }

  @Put(":id/cells/:cellId")
  async updateCell(
    @Param("id") _priceListId: string,
    @Param("cellId") cellId: string,
    @Body() body: UpdatePriceListCellDto,
    @Headers("authorization") authorization: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    return this.priceRepo.updateCell(cellId, body);
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
    await this.priceRepo.deleteCell(cellId);
  }
}
