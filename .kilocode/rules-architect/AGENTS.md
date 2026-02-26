# AGENTS.md - Architect Mode

This file provides guidance to agents when working with code in this repository in Architect mode.

## Architecture Principles

### Port/Adapter Pattern (Hexagonal)

- **Application Layer** (`src/modules/*/application/`): Business logic, depends only on ports/interfaces
- **Infrastructure Layer** (`src/modules/*/infrastructure/`): External dependencies (Prisma, external APIs)
- **Presentation Layer** (`src/modules/*/presentation/`): HTTP controllers

### Dependency Rules (Enforced by ESLint)

1. `@prisma/client` can ONLY be imported in `infrastructure/` directories
2. Application layer CANNOT import from `infrastructure/` layer
3. This ensures testability and replaceable dependencies

## API Design

- **Prefix**: All routes prefixed with `/v1` (set in `src/main.ts`)
- **CORS**: Controlled by `FRONTEND_ORIGIN` env var
- **Auth Header**: Bearer token format expected

## Authentication/Authorization

- **Custom Token Service**: Uses HMAC-SHA256 (not JWT) - see `src/shared/infrastructure/auth/token.service.ts`
- **Token Format**: `{base64Payload}.{hmacSignature}`
- **Roles**: `superadmin`, `admin`, `operador`
- **Auth Helpers**: `requireAuth()` and `requireAnyRole()` in `src/shared/presentation/auth.ts`

## Adding New Modules

To add a new feature module:

1. Create directory structure:
   ```
   src/modules/{module-name}/
   ├── application/
   │   ├── ports/          # Interface definitions
   │   └── use-cases/      # Business logic
   ├── infrastructure/
   │   ├── persistence/
   │   │   └── prisma/     # Prisma repository
   │   └── factories/      # Factory functions
   └── presentation/
       └── controllers/    # HTTP endpoints
   ```

2. Register controller in `src/app.module.ts`

3. Follow factory pattern for dependency injection:
   ```typescript
   export function create{Feature}UseCase(): {Feature}UseCase {
     return new {Feature}UseCase(new SystemClockService(), new Prisma{Entity}Repository(prisma));
   }
   ```

## Database

- **Prisma Schema**: `prisma/schema.prisma`
- **Migrations**: `prisma/migrations/`
- **Seeding**: `prisma/seed.ts` (run via `npm run db:seed`)
- **No transactions by default**: Use `$transaction()` for atomic operations

## Configuration

- **Port**: 3001 (not 3000)
- **Node**: >=22 <23 required
- **PostgreSQL**: Required for runtime

## Documentation Updates (CRITICAL)

After each session or relevant change, you MUST update these files:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`

Also reference specs in: `/home/alfonso/Dev/projects/telita/telita-docs/`
