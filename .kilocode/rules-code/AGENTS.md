# AGENTS.md - Code Mode

This file provides guidance to agents when working with code in this repository in Code mode.

## Critical Code Patterns

- **Prisma in Infrastructure Only**: Never import `@prisma/client` or `infrastructure/` in application layer - ESLint will error
- **Factory Pattern**: Always use factory functions to create use cases with dependencies injected
  ```typescript
  // Example: src/modules/pricing/infrastructure/factories/create-quote-use-case.factory.ts
  export function createQuoteUseCase(): CalculateQuoteUseCase {
    return new CalculateQuoteUseCase(new SystemClockService(), new PrismaPriceRepository(prisma));
  }
  ```
- **Port Injection**: Use constructor injection for ports in use cases
  ```typescript
  constructor(
    private readonly clock: ClockPort,
    private readonly priceRepository: PriceRepositoryPort
  ) {}
  ```

## Auth Helpers

- Use `requireAuth()` and `requireAnyRole()` from `src/shared/presentation/auth.ts`
- Auth uses custom HMAC-SHA256 tokens (not JWT) via `src/shared/infrastructure/auth/token.service.ts`

## Controller Patterns

- Controllers instantiate dependencies directly (e.g., `new PrismaCatalogRepository()`)
- Routes are prefixed with `v1` globally
- Always use `@HttpCode(HttpStatus.OK)` for POST endpoints returning 200

## Naming Conventions

- Ports: `{Entity}RepositoryPort` or `{Feature}Port` (e.g., `SkuRepositoryPort`, `ClockPort`)
- Repositories: `Prisma{Entity}Repository`
- Use Cases: `{Action}{Entity}UseCase` (e.g., `CalculateQuoteUseCase`)
- Factory functions: `create{UseCase}()` pattern

## Documentation Updates

After making changes, update:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`
