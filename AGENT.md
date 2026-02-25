# Telita Back Agent Context

Fecha de inicializacion: 2026-02-24

## Scope
Repositorio backend API de Telita.

## Stack
- NestJS
- TypeScript
- Prisma
- PostgreSQL

## Reglas de arquitectura
- Casos de uso en `application` dependen de puertos/interfaces.
- Prisma solo se usa en `infrastructure`.
- No importar `@prisma/client` fuera de adaptadores de infraestructura.

## Regla obligatoria de documentacion (global)
Despues de cada sesion o cambio relevante, actualizar SIEMPRE:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`

## Referencias
- Specs: `/home/alfonso/Dev/projects/telita/telita-docs/`
- Arquitectura reemplazable: `spec-07-replaceable-dependencies.md`
