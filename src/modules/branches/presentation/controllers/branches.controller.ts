import { Controller, Get } from "@nestjs/common";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { ListBranchesUseCase } from "../../application/use-cases/list-branches.use-case";

@Authenticated("superadmin", "admin", "operador")
@Controller("branches")
export class BranchesController {
  constructor(private readonly listBranchesUseCase: ListBranchesUseCase) {}

  @Get()
  async list() {
    const branches = await this.listBranchesUseCase.execute();
    return branches.map((b: any) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      isActive: b.isActive
    }));
  }
}
