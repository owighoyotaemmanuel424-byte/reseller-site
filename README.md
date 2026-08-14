# MultiKartX

MultiKartX is the production migration of the original reseller site into a TypeScript-first application designed for Vercel, Cloudflare Workers and Convex.

## Architecture

- Next.js App Router for the web application
- Convex for transactional application data
- Clerk for production authentication
- Vercel for the simplest deployment target
- Cloudflare Workers via OpenNext for edge deployment
- Server-only environment variables for reseller/payment provider credentials
- Integer kobo accounting to avoid floating-point money errors

## Reseller provider

The original PHP project stored a reseller API key and used a localhost API URL in `config.php`. Those credentials are **not copied into MultiKartX**. Configure them as Convex environment variables instead:

- `RESELLER_API_BASE_URL`
- `RESELLER_API_KEY`
- `MARKUP_PERCENT`

The migration supports the existing provider endpoints for product sync and order creation. Provider failures refund the reserved wallet amount automatically.

## Required setup

1. Create a Convex deployment and set `NEXT_PUBLIC_CONVEX_URL` for the web app.
2. Configure Clerk authentication and its JWT issuer domain for Convex.
3. Add the reseller provider URL/key to Convex environment variables.
4. Run the `syncProducts` Convex action to populate the catalog.
5. Connect a real payment provider webhook before treating funding requests as paid. A pending funding request must never increase a user's balance by itself.

## Vercel

Use the repository as a Next.js project.

Build command: `npm run build`

Set the Clerk and `NEXT_PUBLIC_CONVEX_URL` variables in Vercel. Provider secrets should remain server-side.

## Cloudflare Workers

This project uses OpenNext for Cloudflare.

Build command: `npm run cf:build`

Deploy command: `wrangler deploy`

Set runtime secrets with Wrangler rather than committing them to Git.

## Security

- No provider API key is stored in source control.
- Money is represented as integer kobo values.
- Wallet debits are performed transactionally before provider delivery.
- Failed provider calls automatically refund the reserved amount.
- Customer queries and mutations are scoped to the authenticated identity.
- Order reports are restricted to the original customer and the original two-hour reporting window.
