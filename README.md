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

## AI Quote (enquiry → draft quote)

`/ai-quote` reads a pasted email or an attached PDF/image, extracts the customer and product lines with an
LLM, matches them to the catalog and opens a draft in the quote form. Prices always come from the CRM's
pricing, never from the model.

- Set the key: `npx wrangler secret put GEMINI_API_KEY` (production) or add `GEMINI_API_KEY=...` to `.dev.vars` (local).
- Optional: `AI_MODEL` (default `gemini-3.5-flash-lite`) and `AI_PROVIDER` (default `gemini`).
- Another vendor: implement `AiProvider` in `src/data/ai.server.ts` and register it in `PROVIDERS`.
- Mailbox later: poll the inbox, build an `InboundMessage` (`src/lib/ai/inbound.ts`) and call the same pipeline.

### Gmail inbox for AI Quote (sales@tarko.in)

The **Gmail inbox** tab lists emails from one shared mailbox and sends the chosen one (body plus
PDF/Word/Excel/image attachments) through the same AI pipeline. Read-only (`gmail.readonly`); no DNS or
MX changes, so Workspace mail is untouched.

1. Google Cloud Console → new project → enable **Gmail API**.
2. **OAuth consent screen** → user type **Internal** (Workspace only, no Google review needed).
3. **Credentials → OAuth client ID → Web application**, authorised redirect URI
   `https://crm.tarko.in/gmail-callback`.
4. Cloudflare secrets: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (`wrangler secret put ...`).
5. Optional variables: `GMAIL_ACCOUNT` (default `sales@tarko.in`, the only mailbox that can be connected)
   and `GMAIL_LABEL` (default `Quotes`).
6. In the CRM, an admin opens AI Quote → Gmail inbox → **Connect**. Give the label `Quotes` to enquiry emails.

Non-admins only see emails carrying the label; admins can switch to the whole inbox. The refresh token is
stored AES-GCM encrypted in the `settings` table and is never sent to the browser.
