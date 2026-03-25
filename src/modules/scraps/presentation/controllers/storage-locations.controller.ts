import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { StorageLocationsService } from "../../application/services/storage-locations.service";

@Authenticated("superadmin", "admin", "operador")
@Controller("storage-locations")
export class StorageLocationsController {
  constructor(private readonly storageLocationsService: StorageLocationsService) {}

  @Get()
  async list(
    @Query("branchCode") branchCode: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.storageLocationsService.list(branchCode, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  @Post("bulk-create")
  @Roles("superadmin", "admin")
  async bulkCreate(
    @Body()
    body: {
      branchCode: string;
      rowMode: "LETTER" | "FIXED";
      rowStart: string;
      rowEnd: string;
      colStart: number;
      colEnd: number;
      separator: string;
      descriptionTemplate?: string;
    },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return this.storageLocationsService.bulkCreate({ ...body, createdByEmail: auth.email });
  }

  @Post("bulk-preview")
  @Roles("superadmin", "admin")
  async bulkPreview(
    @Body()
    body: {
      branchCode: string;
      rowMode: "LETTER" | "FIXED";
      rowStart: string;
      rowEnd: string;
      colStart: number;
      colEnd: number;
      separator: string;
      descriptionTemplate?: string;
    }
  ) {
    return this.storageLocationsService.bulkPreview(body);
  }

  @Post()
  @Roles("superadmin", "admin")
  async create(@Body() body: { branchCode: string; code: string; description?: string }, @CurrentAuth() auth: AuthTokenPayload) {
    const location = await this.storageLocationsService.create({
      ...body,
      createdByEmail: auth.email
    });
    return {
      id: location.id,
      code: location.code,
      description: location.description,
      isActive: location.isActive
    };
  }

  @Put(":id")
  @Roles("superadmin", "admin")
  async update(
    @Param("id") id: string,
    @Body() body: { code?: string; description?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    const location = await this.storageLocationsService.update(id, {
      ...body,
      actorEmail: auth.email
    });
    return {
      id: location.id,
      code: location.code,
      description: location.description,
      isActive: location.isActive
    };
  }

  @Delete(":id")
  @Roles("superadmin", "admin")
  async delete(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    await this.storageLocationsService.delete(id, auth.email);
    return { ok: true };
  }

  @Patch(":id/status")
  @Roles("superadmin", "admin")
  async toggleStatus(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    const location = await this.storageLocationsService.toggleStatus(id, auth.email);
    return {
      id: location.id,
      code: location.code,
      isActive: location.isActive
    };
  }
}
