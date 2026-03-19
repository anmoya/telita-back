import { Injectable } from "@nestjs/common";
import { prismaClient } from "../../../shared/infrastructure/persistence/prisma-client";

@Injectable()
export class PrismaAuthRepository {
  async findActiveUserByEmail(email: string) {
    return prismaClient.appUser.findFirst({
      where: { email, isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        passwordHash: true,
        onboardingCompletedAt: true,
        branch: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });
  }
}
