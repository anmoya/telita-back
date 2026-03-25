import { Global, Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { getRuntimeEnv } from "./infrastructure/config/load-env";
import { BcryptPasswordHasher } from "./infrastructure/auth/bcrypt-password-hasher";
import { TokenService } from "./infrastructure/auth/token.service";
import { PrismaAuditRepository } from "./infrastructure/persistence/prisma-audit.repository";
import { PrismaService } from "./infrastructure/persistence/prisma.service";
import { SystemClockService } from "./infrastructure/time/system-clock.service";
import { AuthGuard } from "./presentation/auth.guard";
import { RolesGuard } from "./presentation/roles.guard";

@Global()
@Module({
  providers: [
    AuthGuard,
    BcryptPasswordHasher,
    PrismaService,
    PrismaAuditRepository,
    RolesGuard,
    SystemClockService,
    {
      provide: PrismaClient,
      useExisting: PrismaService
    },
    {
      provide: TokenService,
      useFactory: () => new TokenService(getRuntimeEnv().AUTH_SECRET)
    }
  ],
  exports: [
    AuthGuard,
    BcryptPasswordHasher,
    PrismaService,
    PrismaAuditRepository,
    PrismaClient,
    RolesGuard,
    SystemClockService,
    TokenService
  ]
})
export class SharedModule {}
