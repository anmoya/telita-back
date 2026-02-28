import { AuditAction } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import type { PasswordHasherPort } from "../../../../../shared/application/ports/password-hasher.port";
import type {
  ChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
  UserDto,
  UserRole,
  UserRepositoryPort
} from "../../../application/ports/user-repository.port";

function toDto(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  branch: { code: string };
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    branchCode: user.branch.code,
    isActive: user.isActive,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  onboardingCompletedAt: true,
  createdAt: true,
  branch: { select: { code: true } }
} as const;

export class PrismaUsersRepository implements UserRepositoryPort {
  private readonly auditRepo = new PrismaAuditRepository();

  async listByBranch(branchCode: string, actorRole: UserRole, actorBranchCode: string): Promise<UserDto[]> {
    const where =
      actorRole === "superadmin"
        ? {}
        : { branch: { code: actorBranchCode } };

    const users = await prismaClient.appUser.findMany({
      where,
      select: userSelect,
      orderBy: [{ role: "asc" }, { fullName: "asc" }]
    });

    return users.map(toDto);
  }

  async findById(id: string): Promise<UserDto | null> {
    const user = await prismaClient.appUser.findUnique({
      where: { id },
      select: userSelect
    });
    return user ? toDto(user) : null;
  }

  async findByEmail(email: string): Promise<UserDto | null> {
    const user = await prismaClient.appUser.findUnique({
      where: { email },
      select: userSelect
    });
    return user ? toDto(user) : null;
  }

  async create(input: CreateUserInput, hasher: PasswordHasherPort): Promise<UserDto> {
    const existing = await prismaClient.appUser.findUnique({ where: { email: input.email } });
    if (existing) throw new Error(`Email ya registrado: ${input.email}`);

    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error(`Sucursal no encontrada: ${input.branchCode}`);

    const passwordHash = await hasher.hash(input.password);

    const user = await prismaClient.appUser.create({
      data: {
        branchId: branch.id,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        passwordHash,
        isActive: true
      },
      select: userSelect
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: input.actorId,
      entityType: "app_user",
      entityId: user.id,
      action: AuditAction.CREATE,
      afterJson: { email: user.email, role: user.role, branchCode: input.branchCode }
    });

    return toDto(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserDto> {
    const existing = await prismaClient.appUser.findUnique({
      where: { id },
      include: { branch: { select: { code: true } } }
    });
    if (!existing) throw new Error("Usuario no encontrado.");

    const beforeJson = { fullName: existing.fullName, role: existing.role, branchCode: existing.branch.code };

    let branchId = existing.branchId;
    if (input.branchCode) {
      const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
      if (!branch) throw new Error(`Sucursal no encontrada: ${input.branchCode}`);
      branchId = branch.id;
    }

    const user = await prismaClient.appUser.update({
      where: { id },
      data: {
        fullName: input.fullName ?? existing.fullName,
        role: input.role ?? existing.role,
        branchId
      },
      select: userSelect
    });

    await this.auditRepo.log({
      branchId: branchId ?? null,
      actorUserId: input.actorId,
      entityType: "app_user",
      entityId: id,
      action: AuditAction.UPDATE,
      beforeJson,
      afterJson: { fullName: user.fullName, role: user.role, branchCode: user.branch.code }
    });

    return toDto(user);
  }

  async changePassword(id: string, input: ChangePasswordInput, hasher: PasswordHasherPort): Promise<void> {
    const user = await prismaClient.appUser.findUnique({
      where: { id },
      select: { id: true, passwordHash: true, branchId: true }
    });
    if (!user) throw new Error("Usuario no encontrado.");

    const isSelf = input.actorId === id;
    const isAdmin = input.actorRole === "superadmin" || input.actorRole === "admin";

    if (!isSelf && !isAdmin) {
      throw new Error("Sin permisos para cambiar contraseña de otro usuario.");
    }

    if (isSelf) {
      const valid = await hasher.verify(input.currentPassword, user.passwordHash);
      if (!valid) throw new Error("Contraseña actual incorrecta.");
    }

    const newHash = await hasher.hash(input.newPassword);
    await prismaClient.appUser.update({ where: { id }, data: { passwordHash: newHash } });

    await this.auditRepo.log({
      branchId: user.branchId,
      actorUserId: input.actorId,
      entityType: "app_user",
      entityId: id,
      action: AuditAction.UPDATE,
      afterJson: { passwordChanged: true }
    });
  }

  async setStatus(id: string, isActive: boolean, actorId: string, actorRole: UserRole): Promise<UserDto> {
    const user = await prismaClient.appUser.findUnique({
      where: { id },
      include: { branch: { select: { code: true } } }
    });
    if (!user) throw new Error("Usuario no encontrado.");

    if (!isActive && user.role === "superadmin") {
      const activeSuperadmins = await this.countActiveSuperadmins();
      if (activeSuperadmins <= 1) {
        throw new Error("No se puede desactivar al último superadmin.");
      }
    }

    const updated = await prismaClient.appUser.update({
      where: { id },
      data: { isActive },
      select: userSelect
    });

    await this.auditRepo.log({
      branchId: user.branchId,
      actorUserId: actorId,
      entityType: "app_user",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: user.isActive },
      afterJson: { isActive }
    });

    return toDto(updated);
  }

  async countActiveSuperadmins(): Promise<number> {
    return prismaClient.appUser.count({ where: { role: "superadmin", isActive: true } });
  }

  async markOnboardingComplete(userId: string): Promise<void> {
    await prismaClient.appUser.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() }
    });
  }
}
