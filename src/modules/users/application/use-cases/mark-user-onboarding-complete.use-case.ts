import { Injectable } from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";

@Injectable()
export class MarkUserOnboardingCompleteUseCase {
  constructor(private readonly usersRepo: PrismaUsersRepository) {}

  execute(userId: string) {
    return this.usersRepo.markOnboardingComplete(userId);
  }
}
