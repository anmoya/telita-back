import { Injectable } from "@nestjs/common";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import type { ChangePasswordInput } from "../ports/user-repository.port";

@Injectable()
export class ChangeUserPasswordUseCase {
  constructor(
    private readonly usersRepo: PrismaUsersRepository,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  execute(id: string, input: ChangePasswordInput) {
    return this.usersRepo.changePassword(id, input, this.hasher);
  }
}
