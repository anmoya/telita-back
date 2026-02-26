import type { PasswordHasherPort } from "../../../../shared/application/ports/password-hasher.port";

export type UserRole = "superadmin" | "admin" | "operador";

export type UserDto = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  branchCode: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateUserInput = {
  email: string;
  fullName: string;
  role: UserRole;
  branchCode: string;
  password: string;
  actorId: string;
};

export type UpdateUserInput = {
  fullName?: string;
  role?: UserRole;
  branchCode?: string;
  actorId: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  actorId: string;
  actorRole: UserRole;
};

export interface UserRepositoryPort {
  listByBranch(branchCode: string, actorRole: UserRole, actorBranchCode: string): Promise<UserDto[]>;
  findById(id: string): Promise<UserDto | null>;
  findByEmail(email: string): Promise<UserDto | null>;
  create(input: CreateUserInput, hasher: PasswordHasherPort): Promise<UserDto>;
  update(id: string, input: UpdateUserInput): Promise<UserDto>;
  changePassword(id: string, input: ChangePasswordInput, hasher: PasswordHasherPort): Promise<void>;
  setStatus(id: string, isActive: boolean, actorId: string, actorRole: UserRole): Promise<UserDto>;
  countActiveSuperadmins(): Promise<number>;
}
