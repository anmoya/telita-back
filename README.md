# Telita Back

API backend de Telita para calculo de cortes, gestion de retazos y etiquetas.

## Stack
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Pino (logs)

## Regla de arquitectura
- Capa `application` usa puertos/interfaces.
- Prisma solo en `infrastructure`.
- Enforced con `eslint.config.mjs`.

## Requisitos
- Node.js 22.x
- npm 10.x
- Docker + Docker Compose

## Variables de entorno (dev)
Crea `telita-back/.env` (puedes copiar desde `.env.example`):

```env
NODE_ENV=development
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
AUTH_SECRET=telita_dev_secret
DATABASE_URL=postgresql://telita:telita_dev@localhost:5432/telita_dev?schema=public
```

## Levantar base de datos con Docker
Desde la raiz del repo (`/home/alfonso/Dev/projects/telita`):

```bash
docker compose -f docker-compose.dev.yml up -d telita-postgres
docker compose -f docker-compose.dev.yml ps
```

Para apagar:

```bash
docker compose -f docker-compose.dev.yml down
```

Para apagar y borrar volumen:

```bash
docker compose -f docker-compose.dev.yml down -v
```

## Levantar servidor backend (dev)
Desde `telita-back/`:

```bash
npm_config_cache=./.npm-cache npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Servidor esperado: `http://localhost:3001`

## Verificacion rapida de API
Health:

```bash
curl -sS http://localhost:3001/v1/health
```

Login:

```bash
curl -sS -X POST http://localhost:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@telita.local","password":"dev_only_change_me"}'
```

Cotizacion (con token):

```bash
TOKEN='<accessToken>'
curl -sS -X POST http://localhost:3001/v1/pricing/quote \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"branchCode":"MAIN","skuCode":"BLACKOUT_3X5","priceListName":"LISTA_BASE","requestedWidthM":2,"requestedHeightM":2.3,"quantity":2}'
```

## Endpoints v1 implementados
- `GET /v1/health`
- `POST /v1/auth/login`
- `GET /v1/audit`
- `GET /v1/dashboard/kpis`
- `GET /v1/dashboard/pending-scraps`
- `GET /v1/catalog/skus`
- `POST /v1/pricing/quote`
- `GET /v1/pricing/quotes`
- `POST /v1/sales`
- `POST /v1/sales/:saleId/lines`
- `POST /v1/sales/:saleId/confirm`
- `POST /v1/sales/:saleId/cancel`
- `GET /v1/sales`
- `GET /v1/cut-jobs`
- `POST /v1/cut-jobs/:cutJobId/mark-cut`
- `POST /v1/scraps/register-from-quote`
- `GET /v1/scraps`
- `PATCH /v1/scraps/:id/assign-location`
- `POST /v1/storage-locations`
- `POST /v1/labels/quote/:quoteId`
- `POST /v1/labels/scrap/:scrapId`
- `GET /v1/labels/:labelId/pdf`
- `POST /v1/labels/:labelId/reprint`

## Flujo recomendado diario
1. Levantar Postgres por Docker.
2. Ejecutar migraciones Prisma.
3. Levantar Nest en modo watch.
