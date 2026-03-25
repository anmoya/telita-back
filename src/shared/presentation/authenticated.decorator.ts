import { applyDecorators, UseGuards } from "@nestjs/common";
import type { AuthTokenPayload } from "../infrastructure/auth/token.service";
import { AuthGuard } from "./auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";

export function Authenticated(...roles: Array<AuthTokenPayload["role"]>) {
  return applyDecorators(
    UseGuards(AuthGuard, RolesGuard),
    Roles(...roles)
  );
}
