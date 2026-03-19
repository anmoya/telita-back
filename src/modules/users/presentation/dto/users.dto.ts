import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const userRoles = ["superadmin", "admin", "operador"] as const;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  fullName!: string;

  @IsIn(userRoles)
  role!: (typeof userRoles)[number];

  @IsString()
  branchCode!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(userRoles)
  role?: (typeof userRoles)[number];

  @IsOptional()
  @IsString()
  branchCode?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateUserStatusDto {
  @Type(() => Boolean)
  @IsBoolean()
  isActive!: boolean;
}
