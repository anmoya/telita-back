# AGENTS.md - Debug Mode

This file provides guidance to agents when working with code in this repository in Debug mode.

## Debugging Tips

- **No Test Framework**: Project has no tests, so debugging relies on manual testing and logs
- **Run Dev Server**: Use `npm run dev` to start with watch mode and see live errors

## Common Error Patterns

- **ESLint "Use Prisma only inside infrastructure adapters"**: You're importing `@prisma/client` outside infrastructure layer
- **ESLint "Application layer must depend on ports, not infrastructure"**: Importing infrastructure code in application layer

## Database Debugging

- Prisma client must be generated: Run `npm run db:generate` after schema changes
- Check DATABASE_URL in .env - connection failures often due to wrong URL format

## Auth Debugging

- Token verification uses HMAC-SHA256 in `src/shared/infrastructure/auth/token.service.ts`
- Tokens expire after 12 hours by default (configurable in TokenService.sign())
- Use `AUTH_SECRET` env var - defaults to `telita_dev_secret`

## Runtime Debugging

- PORT defaults to 3001 (not 3000)
- CORS uses FRONTEND_ORIGIN env var - verify it's set correctly
- All API routes prefixed with `/v1` (e.g., `/v1/auth/login`)

## Prisma Debugging

- Schema is at `prisma/schema.prisma`
- Run `npm run db:migrate` to apply migrations
- Run `npm run db:seed` to populate initial data
- Check `prisma/migrations/` for migration history

## Documentation Updates

After fixing bugs or making changes, update:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`
