# MultiKartX

Digital products and reseller services platform.

## Production Environment Variables

Configure these variables in your deployment platform. Never commit real secrets.

### Convex

```env
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOYMENT=
```

### Reseller Provider (server-side only)

```env
RESELLER_API_BASE_URL=
RESELLER_API_KEY=
MARKUP_PERCENT=10
```

### Paystack (server-side only)

```env
PAYSTACK_SECRET_KEY=
```

Paystack webhook requests must be validated using the server-side secret key. Never expose `PAYSTACK_SECRET_KEY` in client-side variables.

### Application URL

```env
NEXT_PUBLIC_SITE_URL=
```

### Optional webhook configuration

```env
PAYMENT_WEBHOOK_SECRET=
```

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Run checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

The application supports Next.js deployment and Cloudflare OpenNext deployment using the included configuration files.

Before deployment:

1. Configure all production environment variables.
2. Deploy Convex:

```bash
npx convex deploy
```

3. Configure the Paystack webhook endpoint.
4. Confirm runtime logs after deployment.

## Security Notes

- Do not commit `.env` files.
- Keep Paystack and reseller provider keys server-side only.
- Wallet balance changes are processed through ledger records.
- Webhook processing is protected against duplicate events.
