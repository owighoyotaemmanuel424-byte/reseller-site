# JejeLaye Reseller Platform

Production-oriented reseller layer for NewJejeLaye API v1. Resellers fund a wallet, buy wholesale services, apply their own pricing rules, and expose a namespaced REST API to downstream customers.

## Phase 1 foundation

The repository now contains the initial pnpm/Turborepo workspace, Neon/PostgreSQL Prisma schema, shared Zod validation, a typed JejeLaye provider adapter with retries/circuit breaking/provider logging hooks, and a NestJS 10 + Fastify authentication service with bcrypt-12 passwords and rotating hashed refresh tokens.

### Workspace

```text
apps/
  api/        NestJS + Fastify API
  web/        Next.js reseller dashboard (existing application; migration continues phase-by-phase)
  admin/      Next.js admin application
  worker/     BullMQ workers
packages/
  core/       shared Zod schemas
  db/         Prisma + Neon client/schema
  jejelaye/   typed provider adapter
  pricing/    pricing engine
  ledger/     double-entry ledger
  ui/         shared UI
  config/     shared configuration
```

## Environment

Copy `.env.example` to the environment used by the application. Production secrets must be stored in a secrets manager, not committed.

`DATABASE_URL` is the Neon pooled runtime URL; `DIRECT_URL` is the direct Neon URL used by Prisma migrations.

## Local database setup

```bash
pnpm install
pnpm --filter @jejelaye/db generate
pnpm --filter @jejelaye/db migrate
```

For a new environment, create a migration with Prisma against the direct database URL, review it, then deploy it through CI. Do not run destructive migration commands against production without review.

## API

```bash
pnpm --filter @jejelaye/api dev
```

Default API address: `http://localhost:4000/api`.

Phase 1 authentication endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

Access tokens expire after 15 minutes. Refresh tokens are random, SHA-256 hashed in PostgreSQL, rotate on use, and expire after 7 days.

## Provider

The JejeLaye adapter defaults to `https://jejelaegyct.com.ng/api/v1`. Provider credentials remain server-side. The adapter applies exponential retries for rate-limit/server/network failures and opens a circuit after repeated failures.

## Security baseline

- bcrypt cost 12
- JWT access 15m / refresh 7d
- refresh-token rotation with server-side hashes
- strict Zod request validation
- provider credentials never exposed to the browser
- Prisma Decimal for money fields
- database indexes for hot order/ledger queries

## Phase gates

Implementation is intentionally phase-gated. Phase 2 (Wallet & Ledger) begins only after confirmation following Phase 1 verification.
