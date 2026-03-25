import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveUserByEmail(email: string) {
    return this.prisma.appUser.findFirst({
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
