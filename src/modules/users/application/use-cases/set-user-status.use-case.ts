import { Injectable } from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import type { UserRole } from "../ports/user-repository.port";

@Injectable()
export class SetUserStatusUseCase {
  constructor(private readonly usersRepo: PrismaUsersRepository) {}

  execute(id: string, isActive: boolean, actorId: string, actorRole: UserRole) {
    return this.usersRepo.setStatus(id, isActive, actorId, actorRole);
  }
}
