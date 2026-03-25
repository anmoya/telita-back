import { BadRequestException, Injectable } from "@nestjs/common";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";
import { TokenService } from "../../../../shared/infrastructure/auth/token.service";
import { PrismaAuthRepository } from "../../infrastructure/prisma-auth.repository";

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly authRepo: PrismaAuthRepository,
    private readonly tokenService: TokenService,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  async execute(email: string, password: string) {
    const user = await this.authRepo.findActiveUserByEmail(email);
    if (!user) throw new BadRequestException("Invalid credentials.");

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      throw new BadRequestException("Invalid credentials.");
    }

    const accessToken = this.tokenService.sign({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchCode: user.branch.code,
        branchName: user.branch.name,
        onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null
      }
    };
  }
}
