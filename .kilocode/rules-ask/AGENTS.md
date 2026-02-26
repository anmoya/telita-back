# AGENTS.md - Ask Mode

This file provides guidance to agents when working with code in this repository in Ask mode.

## Project Context

- **Backend API** for Telita application (glass cutting/sales)
- **NestJS** framework with TypeScript
- **Prisma** ORM with PostgreSQL database
- **Port/Adapter architecture** with strict layer separation

## Key Architectural Concepts

- **Application Layer** (`src/*/application/`): Contains use cases and ports - depends only on interfaces
- **Infrastructure Layer** (`src/*/infrastructure/`): Contains Prisma implementations
- **Presentation Layer** (`src/*/presentation/`): Controllers and HTTP handling

## Directory Structure

```
src/
├── modules/
│   ├── auth/          # Authentication (custom HMAC tokens, not JWT)
│   ├── catalog/       # SKU/product catalog
│   ├── pricing/       # Price quotes
│   ├── sales/         # Sales orders
│   ├── scraps/        # Scrap inventory
│   ├── labels/        # Label generation
│   ├── dashboard/     # Dashboard stats
│   ├── settings/      # Settings
│   ├── users/         # User management
│   └── audit/         # Audit logs
└── shared/
    ├── application/   # Shared ports (ClockPort, IdGeneratorPort)
    ├── infrastructure/# Prisma client, auth, time services
    └── presentation/  # Auth helpers (requireAuth, requireAnyRole)
```

## Key Interfaces/Ports

- `ClockPort` - Time abstraction for testability (src/shared/application/ports/clock.port.ts)
- `PriceRepositoryPort` - Price data access (src/modules/pricing/application/ports/price-repository.port.ts)
- `SkuRepositoryPort` - SKU data access (src/modules/catalog/application/ports/sku-repository.port.ts)

## Database Schema

- Schema defined in `prisma/schema.prisma`
- Key entities: User, Branch, SKU, PriceList, Quote, Sale, Scrap, Label
- Audit trail via shared `PrismaAuditRepository`

## Auth System

- Custom HMAC-SHA256 tokens (not JWT)
- Roles: `superadmin`, `admin`, `operador`
- Token payload: `{ sub, email, role, iat, exp }`

## Documentation Updates

After each session or relevant change, update:
- `/home/alfonso/Dev/projects/telita/FRONTEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/BACKEND_DOC.md`
- `/home/alfonso/Dev/projects/telita/DATABASE_DOC.md`

Specs in: `/home/alfonso/Dev/projects/telita/telita-docs/`
