# AGENTS.md

Guia para agentes trabajando en `telita-back/`.

## 1. Comandos

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run verify`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:seed`

## 2. Arquitectura que debe respetarse

Regla base:

- `Controller -> Application -> Infrastructure`

Interpretacion:

- controllers reciben request, auth, params y serializan respuesta;
- use cases y application services coordinan negocio;
- persistencia, Prisma y queries viven en infraestructura;
- dependencias transversales viven en `shared/`.

## 3. Reglas obligatorias

- no crear use cases con `new` dentro de controllers;
- no importar Prisma directo fuera del camino via DI / `PrismaService`;
- no meter queries o logica funcional relevante en controllers;
- preferir ports/tokens cuando la frontera application/infrastructure sea clara;
- usar `AppValidationError`, `AppNotFoundError`, `AppConflictError`, `AppForbiddenError` o `AppUnauthorizedError` para errores funcionales;
- si agregas endpoint nuevo, debe quedar bajo el modulo/dominio correcto;
- health/readiness forman parte del contrato operativo del backend.

## 4. Estado actual importante

- auth usa guards/decorators, no helpers manuales viejos;
- Prisma vive por DI y no debe reintroducirse como singleton ad hoc;
- existe filtro global de `AppError`;
- hay endpoints operativos en `/v1/health`, `/v1/health/live` y `/v1/health/ready`;
- `npm run verify` es la secuencia minima de cierre tecnico.

## 5. Antipatrones prohibidos

- `throw new Error(...)` para casos funcionales normales;
- controllers que importen repositorios Prisma concretos salvo excepcion muy justificada;
- wiring manual de dependencias en capa HTTP;
- logica de dominio mezclada con serializacion;
- cambios que pasen `build` pero no `verify`.

## 6. Documentacion relevante

- `../telita-docs/01-arquitectura/arquitectura-vigente-y-reglas-de-ejecucion.md`
- `../telita-docs/04-specs/backlog-remediacion-tecnica.md`

Si cambias una frontera importante de arquitectura o el backlog vigente, actualiza `telita-docs/`.
