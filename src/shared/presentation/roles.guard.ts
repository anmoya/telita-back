import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthTokenPayload } from "../infrastructure/auth/token.service";
import { ROLES_KEY } from "./roles.decorator";

type AuthenticatedRequest = {
  auth?: AuthTokenPayload;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Array<AuthTokenPayload["role"]>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth || !requiredRoles.includes(auth.role)) {
      throw new ForbiddenException("Insufficient role permissions.");
    }

    return true;
  }
}
