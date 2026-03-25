import { Injectable } from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import type { UserRole } from "../ports/user-repository.port";

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly usersRepo: PrismaUsersRepository) {}

  async execute(branchCode: string, actorRole: UserRole, actorId: string) {
    const actorBranchCode = await this.usersRepo.getBranchCodeByUserId(actorId);
    return this.usersRepo.listByBranch(branchCode, actorRole, actorBranchCode);
  }
}
