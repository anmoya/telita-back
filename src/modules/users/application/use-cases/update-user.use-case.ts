import { Injectable } from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import type { UpdateUserInput } from "../ports/user-repository.port";

@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly usersRepo: PrismaUsersRepository) {}

  execute(id: string, input: UpdateUserInput) {
    return this.usersRepo.update(id, input);
  }
}
