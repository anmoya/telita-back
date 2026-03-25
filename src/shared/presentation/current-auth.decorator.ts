import { UnauthorizedException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthTokenPayload } from "../infrastructure/auth/token.service";

type AuthenticatedRequest = {
  auth?: AuthTokenPayload;
};

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext): AuthTokenPayload => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    throw new UnauthorizedException("Missing authenticated user.");
  }
  return request.auth;
});
