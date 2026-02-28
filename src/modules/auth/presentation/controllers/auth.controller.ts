import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { PrismaAuthRepository } from "../../infrastructure/prisma-auth.repository";
import { TokenService } from "../../../../shared/infrastructure/auth/token.service";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";

@Controller("auth")
export class AuthController {
  private readonly repo = new PrismaAuthRepository();
  private readonly tokenService = new TokenService(process.env.AUTH_SECRET ?? "telita_dev_secret");
  private readonly hasher = new BcryptPasswordHasher();

  @Post("login")
  async login(@Body() body: { email: string; password: string }) {
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
