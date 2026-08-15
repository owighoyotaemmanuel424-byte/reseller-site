# MultiKartX

Digital products and reseller services platform.

## Environment Variables

Required production variables:

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `RESELLER_API_BASE_URL`
- `RESELLER_API_KEY`
- `PAYSTACK_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL`

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

## Deployment

The application supports Next.js deployment and Cloudflare OpenNext deployment using the included configuration files.

Ensure all production environment variables are configured in the deployment platform before building.
