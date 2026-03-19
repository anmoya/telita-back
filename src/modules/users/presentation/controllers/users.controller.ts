import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { PrismaUsersRepository } from "../../infrastructure/persistence/prisma/prisma-users.repository";
import { BcryptPasswordHasher } from "../../../../shared/infrastructure/auth/bcrypt-password-hasher";
import { requireAuth, requireAnyRole } from "../../../../shared/presentation/auth";
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto
} from "../dto/users.dto";

@Controller("users")
export class UsersController {
  constructor(
    private readonly repo: PrismaUsersRepository,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  /** GET /v1/users?branchCode= */
  @Get()
  async list(@Query("branchCode") branchCode: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.listByBranch(branchCode ?? "", auth.role, await this.getActorBranchCode(auth.sub));
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** GET /v1/users/:id */
  @Get(":id")
  async getById(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    if (auth.sub !== id) {
      requireAnyRole(auth, ["superadmin", "admin"]);
    }
    const user = await this.repo.findById(id);
    if (!user) throw new BadRequestException("Usuario no encontrado.");
    return user;
  }

  /** POST /v1/users */
  @Post()
  async create(@Body() body: CreateUserDto, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);

    if (!body.password || body.password.length < 8) {
      throw new BadRequestException("Contraseña debe tener al menos 8 caracteres.");
    }

    if (body.role === "superadmin" && auth.role !== "superadmin") {
      throw new ForbiddenException("Solo superadmin puede crear superadmins.");
    }

    try {
      const user = await this.repo.create({ ...body, actorId: auth.sub }, this.hasher);
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
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    const isSelf = auth.sub === id;

    if (!isSelf) {
      requireAnyRole(auth, ["superadmin", "admin"]);
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
      return await this.repo.update(id, { ...body, actorId: auth.sub });
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** PATCH /v1/users/:id/password */
  @Patch(":id/password")
  async changePassword(
    @Param("id") id: string,
    @Body() body: ChangePasswordDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    try {
      await this.repo.changePassword(
        id,
        { currentPassword: body.currentPassword, newPassword: body.newPassword, actorId: auth.sub, actorRole: auth.role },
        this.hasher
      );
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  /** PATCH /v1/users/:id/onboarding-complete */
  @Patch(":id/onboarding-complete")
  async markOnboarding(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    if (auth.sub !== id) throw new ForbiddenException();
    await this.repo.markOnboardingComplete(id);
    return { ok: true };
  }

  /** PATCH /v1/users/:id/status */
  @Patch(":id/status")
  async setStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.setStatus(id, body.isActive, auth.sub, auth.role);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  private async getActorBranchCode(actorId: string): Promise<string> {
    return this.repo.getBranchCodeByUserId(actorId);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
