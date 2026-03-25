import { Injectable } from "@nestjs/common";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import type { CreateUserInput } from "../ports/user-repository.port";

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly usersRepo: PrismaUsersRepository,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  execute(input: CreateUserInput) {
    return this.usersRepo.create(input, this.hasher);
  }
}
