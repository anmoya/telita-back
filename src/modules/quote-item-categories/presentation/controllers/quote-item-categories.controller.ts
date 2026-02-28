import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Headers } from "@nestjs/common";
import { PrismaQuoteItemCategoriesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-item-categories.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("quote-item-categories")
export class QuoteItemCategoriesController {
  private readonly repo = new PrismaQuoteItemCategoriesRepository();

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("isActive") isActive?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const isActiveFilter = isActive === undefined ? undefined : isActive === "true";
      const categories = await this.repo.list({ branchCode, isActive: isActiveFilter });
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
  async create(
    @Body() body: { branchCode: string; name: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const category = await this.repo.create({
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
  async update(
    @Param("id") id: string,
    @Body() body: { name?: string; isActive?: boolean },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const category = await this.repo.update({
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
