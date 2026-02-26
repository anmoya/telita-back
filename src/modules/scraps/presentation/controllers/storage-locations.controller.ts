import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { PrismaScrapsRepository } from "../../infrastructure/persistence/prisma/prisma-scraps.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("storage-locations")
export class StorageLocationsController {
  private readonly repo = new PrismaScrapsRepository();

  @Get()
  async list(@Query("branchCode") branchCode: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      return await this.repo.listStorageLocations(branchCode);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post()
  async create(
    @Body() body: { branchCode: string; code: string; description?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const location = await this.repo.createStorageLocation({
        ...body,
        createdByEmail: auth.email
      });
      return {
        id: location.id,
        code: location.code,
        description: location.description,
        isActive: location.isActive
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: { code?: string; description?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const location = await this.repo.updateStorageLocation(id, {
        ...body,
        actorEmail: auth.email
      });
      return {
        id: location.id,
        code: location.code,
        description: location.description,
        isActive: location.isActive
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Delete(":id")
  async delete(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      await this.repo.deleteStorageLocation(id, auth.email);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Patch(":id/status")
  async toggleStatus(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const location = await this.repo.toggleStorageLocationStatus(id, auth.email);
      return {
        id: location.id,
        code: location.code,
        isActive: location.isActive
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
