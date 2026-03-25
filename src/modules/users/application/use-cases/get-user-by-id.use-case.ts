import { Injectable } from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";

@Injectable()
export class GetUserByIdUseCase {
  constructor(private readonly usersRepo: PrismaUsersRepository) {}

  execute(id: string) {
    return this.usersRepo.findById(id);
  }
}
