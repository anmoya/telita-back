import {
  Body,
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
    return this.factory.addPriceListItemUseCase.execute({ priceListId, ...body });
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
