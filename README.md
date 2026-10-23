# Tarko CRM

Quick quotes for Sakhi Industries (Tarko, Kartex): HDPE pipe, sprinkler pipe and fittings.
Runs on Cloudflare Workers + D1, login via Cloudflare Access.

## Run locally

```bash
npm install
npm run local
```

Applies migrations to a local D1 (`.wrangler/state`) and starts the dev server at http://localhost:5173.

## Deploy

One-time setup:

1. `npx wrangler login`
2. `npx wrangler d1 create tarko-crm` and paste the `database_id` into `wrangler.jsonc`
3. Cloudflare Zero Trust → Access → Applications: protect the app's hostname, then put the team domain and AUD tag in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`)

Then every release:

```bash
npm run deploy
```

Applies pending D1 migrations, builds, and deploys the Worker.
