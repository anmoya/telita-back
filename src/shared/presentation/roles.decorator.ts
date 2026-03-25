import { SetMetadata } from "@nestjs/common";
import type { AuthTokenPayload } from "../infrastructure/auth/token.service";

export const ROLES_KEY = "roles";

export function Roles(...roles: Array<AuthTokenPayload["role"]>) {
  return SetMetadata(ROLES_KEY, roles);
}
