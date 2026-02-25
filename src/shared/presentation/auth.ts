import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { TokenService, type AuthTokenPayload } from "../infrastructure/auth/token.service";

const tokenService = new TokenService(process.env.AUTH_SECRET ?? "telita_dev_secret");

export function requireAuth(authorization?: string): AuthTokenPayload {
  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedException("Missing or invalid Authorization header.");
  }

  const token = authorization.slice("Bearer ".length);
  try {
    return tokenService.verify(token);
  } catch {
    throw new UnauthorizedException("Invalid access token.");
  }
}

export function requireAnyRole(auth: AuthTokenPayload, roles: Array<AuthTokenPayload["role"]>) {
  if (!roles.includes(auth.role)) {
    throw new ForbiddenException("Insufficient role permissions.");
  }
}
