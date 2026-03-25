import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { CreateQuoteItemCategoryUseCase } from "../../application/use-cases/create-quote-item-category.use-case";
import { ListQuoteItemCategoriesUseCase } from "../../application/use-cases/list-quote-item-categories.use-case";
import { UpdateQuoteItemCategoryUseCase } from "../../application/use-cases/update-quote-item-category.use-case";

@Authenticated("superadmin", "admin", "operador")
@Controller("quote-item-categories")
export class QuoteItemCategoriesController {
  constructor(
    private readonly listQuoteItemCategoriesUseCase: ListQuoteItemCategoriesUseCase,
    private readonly createQuoteItemCategoryUseCase: CreateQuoteItemCategoryUseCase,
    private readonly updateQuoteItemCategoryUseCase: UpdateQuoteItemCategoryUseCase
  ) {}

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("isActive") isActive?: string
  ) {
    try {
      const isActiveFilter = isActive === undefined ? undefined : isActive === "true";
      const categories = await this.listQuoteItemCategoriesUseCase.execute({ branchCode, isActive: isActiveFilter });
      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        createdAt: c.createdAt
      }));
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post()
  @Roles("superadmin", "admin")
  async create(
    @Body() body: { branchCode: string; name: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const category = await this.createQuoteItemCategoryUseCase.execute({
        branchCode: body.branchCode,
        name: body.name,
        createdByEmail: auth.email
      });
      return { id: category.id, name: category.name, isActive: category.isActive };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch(":id")
  @Roles("superadmin", "admin")
  async update(
    @Param("id") id: string,
    @Body() body: { name?: string; isActive?: boolean },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const category = await this.updateQuoteItemCategoryUseCase.execute({
        id,
        name: body.name,
        isActive: body.isActive,
        updatedByEmail: auth.email
      });
      return { id: category.id, name: category.name, isActive: category.isActive };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
