import { Injectable } from "@nestjs/common";
import { PrismaBranchRepository } from "../../infrastructure/persistence/prisma/prisma-branch.repository";

@Injectable()
export class ListBranchesUseCase {
  constructor(private readonly branchesRepo: PrismaBranchRepository) {}

  execute() {
    return this.branchesRepo.findAll();
  }
}
