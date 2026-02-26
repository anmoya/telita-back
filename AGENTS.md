# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with watch mode |
| `npm run build` | Generate Prisma client and build |
| `npm run lint` | Run ESLint on src |
| `npm run typecheck` | TypeScript type checking |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed database |

## Environment Variables

- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string
- `FRONTEND_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)
- `AUTH_SECRET` - Secret for token signing (default: telita_dev_secret)

## Architecture Rules (Non-Obvious)

- **Port/Adapter Pattern**: Use cases in `application/` depend on interfaces/ports. Never import `@prisma/client` or `infrastructure/` in application layer
- **Prisma Only in Infrastructure**: Database access must be in `infrastructure/persistence/prisma/` repositories
- **No JWT**: Auth uses custom HMAC-SHA256 token format (not JWT)
- **API Prefix**: All routes are prefixed with `v1` (e.g., `/v1/auth/login`)

## Code Patterns

- **Use Case Injection**: Pass ports via constructor to use cases
- **Factory Pattern**: Use factory functions to create use cases with dependencies (see `create-quote-use-case.factory.ts`)
- **Auth Helper**: Use `requireAuth()` and `requireAnyRole()` from `shared/presentation/auth.ts`
- **Roles**: Only `superadmin`, `admin`, `operador` roles exist

## Testing

- **No test framework**: Project does not have Jest/Vitest configured
- To add tests, install Jest or Vitest and configure separately

## Project Documentation (IMPORTANT)

After each session or relevant change, you MUST update these files:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`  
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`

Also reference specs in: `/home/alfonso/Dev/projects/telita/telita-docs/`

## Dependencies

- Node >=22 <23 (check with `node --version`)
- npm >=10 <11
- PostgreSQL database required
