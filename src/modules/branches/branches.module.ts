import { Module } from "@nestjs/common";
import { ListBranchesUseCase } from "./application/use-cases/list-branches.use-case";
import { PrismaBranchRepository } from "./infrastructure/persistence/prisma/prisma-branch.repository";
import { BranchesController } from "./presentation/controllers/branches.controller";

@Module({
  controllers: [BranchesController],
  providers: [PrismaBranchRepository, ListBranchesUseCase]
})
export class BranchesModule {}
