# Prisma migrations (dev)

Una vez con conectividad a npm:

```bash
npm_config_cache=./.npm-cache npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

Este repositorio ya incluye `prisma/schema.prisma` y `prisma/seed.ts` listos.
