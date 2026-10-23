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

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs typecheck, lint, tests and a build on every pull request, and on
every push to `main` runs `npm run deploy` (D1 migrations → build → `wrangler deploy`).
It can also be run by hand from the Actions tab ("Run workflow").

One-time setup:

1. Cloudflare → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, then
   add the permission **Account · D1 · Edit**. Limit it to your account.
2. GitHub → repo Settings → Secrets and variables → Actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN` – the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` – shown in the Cloudflare dashboard (Workers & Pages, right sidebar)
3. Optional: Settings → Environments → `production` → add required reviewers to approve each deploy.
