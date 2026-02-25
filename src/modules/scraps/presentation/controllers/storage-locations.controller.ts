import { BadRequestException, Body, Controller, Headers, Post } from "@nestjs/common";
import { PrismaScrapsRepository } from "../../infrastructure/persistence/prisma/prisma-scraps.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("storage-locations")
export class StorageLocationsController {
  private readonly repo = new PrismaScrapsRepository();

  @Post()
  async create(
    @Body() body: { branchCode: string; createdByEmail?: string; code: string; description?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const location = await this.repo.createStorageLocation({
        ...body,
        createdByEmail: auth.email
      });
      return {
        id: location.id,
        code: location.code,
        description: location.description
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
