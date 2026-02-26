import { Controller, Get, Headers } from "@nestjs/common";
import { PrismaBranchRepository } from "../../infrastructure/persistence/prisma/prisma-branch.repository";
import { requireAuth, requireAnyRole } from "../../../../shared/presentation/auth";

@Controller("branches")
export class BranchesController {
  private readonly repo = new PrismaBranchRepository();

  @Get()
  async list(@Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const branches = await this.repo.findAll();
    return branches.map((b: any) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      isActive: b.isActive
    }));
  }
}
