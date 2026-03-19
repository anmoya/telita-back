import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { PrismaAuthRepository } from "../../infrastructure/prisma-auth.repository";
import { TokenService } from "../../../../shared/infrastructure/auth/token.service";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";
import { LoginDto } from "../dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly repo: PrismaAuthRepository,
    private readonly tokenService: TokenService,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  @Post("login")
  async login(@Body() body: LoginDto) {
    const user = await this.repo.findActiveUserByEmail(body.email);
    if (!user) throw new BadRequestException("Invalid credentials.");

    if (!(await this.hasher.verify(body.password, user.passwordHash))) {
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
