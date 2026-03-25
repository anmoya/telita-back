import { Module } from "@nestjs/common";
import { LoginUseCase } from "./application/use-cases/login.use-case";
import { PrismaAuthRepository } from "./infrastructure/prisma-auth.repository";
import { AuthController } from "./presentation/controllers/auth.controller";

@Module({
  controllers: [AuthController],
  providers: [PrismaAuthRepository, LoginUseCase]
})
export class AuthModule {}
