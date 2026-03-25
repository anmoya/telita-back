import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { ChangeUserPasswordUseCase } from "../../application/use-cases/change-user-password.use-case";
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case";
import { GetUserByIdUseCase } from "../../application/use-cases/get-user-by-id.use-case";
import { ListUsersUseCase } from "../../application/use-cases/list-users.use-case";
import { MarkUserOnboardingCompleteUseCase } from "../../application/use-cases/mark-user-onboarding-complete.use-case";
import { SetUserStatusUseCase } from "../../application/use-cases/set-user-status.use-case";
import { UpdateUserUseCase } from "../../application/use-cases/update-user.use-case";
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto
} from "../dto/users.dto";

@Authenticated()
@Controller("users")
export class UsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserByIdUseCase: GetUserByIdUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly changeUserPasswordUseCase: ChangeUserPasswordUseCase,
    private readonly markUserOnboardingCompleteUseCase: MarkUserOnboardingCompleteUseCase,
    private readonly setUserStatusUseCase: SetUserStatusUseCase
  ) {}

  /** GET /v1/users?branchCode= */
  @Get()
  @Roles("superadmin", "admin")
  async list(@Query("branchCode") branchCode: string, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      return await this.listUsersUseCase.execute(branchCode ?? "", auth.role, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** GET /v1/users/:id */
  @Get(":id")
  async getById(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    if (auth.sub !== id) {
      if (auth.role !== "superadmin" && auth.role !== "admin") {
        throw new ForbiddenException("Insufficient role permissions.");
      }
    }
    const user = await this.getUserByIdUseCase.execute(id);
    if (!user) throw new BadRequestException("Usuario no encontrado.");
    return user;
  }

  /** POST /v1/users */
  @Post()
  @Roles("superadmin", "admin")
  async create(@Body() body: CreateUserDto, @CurrentAuth() auth: AuthTokenPayload) {

    if (!body.password || body.password.length < 8) {
      throw new BadRequestException("Contraseña debe tener al menos 8 caracteres.");
    }

    if (body.role === "superadmin" && auth.role !== "superadmin") {
      throw new ForbiddenException("Solo superadmin puede crear superadmins.");
    }

    try {
      const user = await this.createUserUseCase.execute({ ...body, actorId: auth.sub });
      return user;
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** PUT /v1/users/:id */
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateUserDto,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    const isSelf = auth.sub === id;

    if (!isSelf) {
      if (auth.role !== "superadmin" && auth.role !== "admin") {
        throw new ForbiddenException("Insufficient role permissions.");
      }
    }

    if (isSelf && auth.role === "operador") {
      if (body.role !== undefined || body.branchCode !== undefined) {
        throw new ForbiddenException("Operador solo puede cambiar su nombre.");
      }
    }

    if (body.role === "superadmin" && auth.role !== "superadmin") {
      throw new ForbiddenException("Solo superadmin puede asignar rol superadmin.");
    }

    try {
      return await this.updateUserUseCase.execute(id, { ...body, actorId: auth.sub });
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** PATCH /v1/users/:id/password */
  @Patch(":id/password")
  async changePassword(
    @Param("id") id: string,
    @Body() body: ChangePasswordDto,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      await this.changeUserPasswordUseCase.execute(
        id,
        { currentPassword: body.currentPassword, newPassword: body.newPassword, actorId: auth.sub, actorRole: auth.role }
      );
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** PATCH /v1/users/:id/onboarding-complete */
  @Patch(":id/onboarding-complete")
  async markOnboarding(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    if (auth.sub !== id) throw new ForbiddenException();
    await this.markUserOnboardingCompleteUseCase.execute(id);
    return { ok: true };
  }

  /** PATCH /v1/users/:id/status */
  @Patch(":id/status")
  @Roles("superadmin", "admin")
  async setStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.setUserStatusUseCase.execute(id, body.isActive, auth.sub, auth.role);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
