import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { AddPriceListItemUseCase } from "../../application/use-cases/add-price-list-item.use-case";
import { CreatePriceListUseCase } from "../../application/use-cases/create-price-list.use-case";
import { CreatePriceListCellUseCase } from "../../application/use-cases/create-price-list-cell.use-case";
import { DeletePriceListCellUseCase } from "../../application/use-cases/delete-price-list-cell.use-case";
import { DeletePriceListItemUseCase } from "../../application/use-cases/delete-price-list-item.use-case";
import { GetPriceListItemsUseCase } from "../../application/use-cases/get-price-list-items.use-case";
import { GetPriceListsUseCase } from "../../application/use-cases/get-price-lists.use-case";
import { ListPriceListCellsUseCase } from "../../application/use-cases/list-price-list-cells.use-case";
import { TogglePriceListStatusUseCase } from "../../application/use-cases/toggle-price-list-status.use-case";
import { UpdatePriceListCellUseCase } from "../../application/use-cases/update-price-list-cell.use-case";
import { UpdatePriceListItemUseCase } from "../../application/use-cases/update-price-list-item.use-case";
import { UpdatePriceListUseCase } from "../../application/use-cases/update-price-list.use-case";
import {
  AddPriceListItemDto,
  CreatePriceListCellDto,
  CreatePriceListDto,
  UpdatePriceListCellDto,
  UpdatePriceListDto,
  UpdatePriceListItemDto
} from "../dto/price-lists.dto";

@Authenticated("superadmin", "admin", "operador")
@Controller("price-lists")
export class PriceListsController {
  constructor(
    private readonly getPriceListsUseCase: GetPriceListsUseCase,
    private readonly createPriceListUseCase: CreatePriceListUseCase,
    private readonly updatePriceListUseCase: UpdatePriceListUseCase,
    private readonly togglePriceListStatusUseCase: TogglePriceListStatusUseCase,
    private readonly getPriceListItemsUseCase: GetPriceListItemsUseCase,
    private readonly addPriceListItemUseCase: AddPriceListItemUseCase,
    private readonly updatePriceListItemUseCase: UpdatePriceListItemUseCase,
    private readonly deletePriceListItemUseCase: DeletePriceListItemUseCase,
    private readonly listPriceListCellsUseCase: ListPriceListCellsUseCase,
    private readonly createPriceListCellUseCase: CreatePriceListCellUseCase,
    private readonly updatePriceListCellUseCase: UpdatePriceListCellUseCase,
    private readonly deletePriceListCellUseCase: DeletePriceListCellUseCase
  ) {}

  @Get()
  async list(@Query("branchCode") branchCode = "MAIN") {
    return this.getPriceListsUseCase.execute(branchCode);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles("superadmin", "admin")
  async create(@Body() body: CreatePriceListDto) {
    return this.createPriceListUseCase.execute(body);
  }

  @Put(":id")
  @Roles("superadmin", "admin")
  async update(@Param("id") id: string, @Body() body: UpdatePriceListDto) {
    return this.updatePriceListUseCase.execute({ id, ...body });
  }

  @Patch(":id/status")
  @Roles("superadmin", "admin")
  async toggleStatus(@Param("id") id: string) {
    return this.togglePriceListStatusUseCase.execute(id);
  }

  @Get(":id/items")
  async listItems(@Param("id") id: string) {
    return this.getPriceListItemsUseCase.execute(id);
  }

  @Post(":id/items")
  @HttpCode(HttpStatus.CREATED)
  @Roles("superadmin", "admin")
  async addItem(
    @Param("id") priceListId: string,
    @Body() body: AddPriceListItemDto
  ) {
    return this.addPriceListItemUseCase.execute({ priceListId, ...body });
  }

  @Put(":id/items/:itemId")
  @Roles("superadmin", "admin")
  async updateItem(
    @Param("id") _priceListId: string,
    @Param("itemId") itemId: string,
    @Body() body: UpdatePriceListItemDto
  ) {
    return this.updatePriceListItemUseCase.execute({ id: itemId, ...body });
  }

  @Delete(":id/items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("superadmin", "admin")
  async deleteItem(
    @Param("id") _priceListId: string,
    @Param("itemId") itemId: string
  ) {
    await this.deletePriceListItemUseCase.execute(itemId);
  }

  // SPEC-31: Price list cell endpoints
  @Get(":id/cells")
  async listCells(
    @Param("id") priceListId: string,
    @Query("skuId") skuId?: string
  ) {
    return this.listPriceListCellsUseCase.execute(priceListId, skuId);
  }

  @Post(":id/cells")
  @HttpCode(HttpStatus.CREATED)
  @Roles("superadmin", "admin")
  async createCell(
    @Param("id") priceListId: string,
    @Body() body: CreatePriceListCellDto
  ) {
    return this.createPriceListCellUseCase.execute({
      priceListId,
      skuCode: body.skuCode,
      maxWidthM: body.maxWidthM,
      maxHeightM: body.maxHeightM,
      unitPrice: body.unitPrice
    });
  }

  @Put(":id/cells/:cellId")
  @Roles("superadmin", "admin")
  async updateCell(
    @Param("id") _priceListId: string,
    @Param("cellId") cellId: string,
    @Body() body: UpdatePriceListCellDto
  ) {
    return this.updatePriceListCellUseCase.execute(cellId, body);
  }

  @Delete(":id/cells/:cellId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("superadmin", "admin")
  async deleteCell(
    @Param("id") _priceListId: string,
    @Param("cellId") cellId: string
  ) {
    await this.deletePriceListCellUseCase.execute(cellId);
  }
}
