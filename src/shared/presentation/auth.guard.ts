import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthTokenPayload } from "../infrastructure/auth/token.service";
import { TokenService } from "../infrastructure/auth/token.service";

type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  auth?: AuthTokenPayload;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers?.authorization;
    const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!headerValue?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header.");
    }

    const token = headerValue.slice("Bearer ".length);
    try {
      request.auth = this.tokenService.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token.");
    }
  }
}
