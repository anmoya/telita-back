import { Module } from "@nestjs/common";
import { ChangeUserPasswordUseCase } from "./application/use-cases/change-user-password.use-case";
import { CreateUserUseCase } from "./application/use-cases/create-user.use-case";
import { GetUserByIdUseCase } from "./application/use-cases/get-user-by-id.use-case";
import { ListUsersUseCase } from "./application/use-cases/list-users.use-case";
import { MarkUserOnboardingCompleteUseCase } from "./application/use-cases/mark-user-onboarding-complete.use-case";
import { SetUserStatusUseCase } from "./application/use-cases/set-user-status.use-case";
import { UpdateUserUseCase } from "./application/use-cases/update-user.use-case";
import { PrismaUsersRepository } from "./infrastructure/persistence/prisma/prisma-users.repository";
import { UsersController } from "./presentation/controllers/users.controller";

@Module({
  controllers: [UsersController],
  providers: [
    PrismaUsersRepository,
    ListUsersUseCase,
    GetUserByIdUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    ChangeUserPasswordUseCase,
    MarkUserOnboardingCompleteUseCase,
    SetUserStatusUseCase
  ]
})
export class UsersModule {}
