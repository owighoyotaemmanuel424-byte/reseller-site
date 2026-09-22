# MultiKartX

Production digital-services and VTU marketplace using **Neon PostgreSQL**, **Next.js**, **Paystack**, and **JejeLaye API v1**.

## Environment

```env
DATABASE_URL=
AUTH_SESSION_SECRET=
NEXT_PUBLIC_SITE_URL=
JEJELAYE_API_BASE_URL=https://jejelayegct.com.ng/api/v1
JEJELAYE_API_TOKEN=
MARKUP_PERCENT=10
PAYSTACK_SECRET_KEY=
```

Run `npm run db:init` once against the production Neon database before first use.

JejeLaye credentials and Paystack secrets are server-only. Do not expose them as `NEXT_PUBLIC_*` variables.

## Commands

```bash
npm install
npm run db:init
npm run typecheck
npm run build
npm run dev
```

## Provider

Admin users can sync the current JejeLaye service catalog from `/admin`. Customer purchases are reserved against the Neon wallet, submitted server-side to JejeLaye, and automatically refunded when the provider request fails.

Paystack funding is verified server-side and also supports the signed webhook endpoint:

`/api/paystack/webhook`

## Database

Neon PostgreSQL is now the system of record. The legacy Convex runtime has been removed from the application.
