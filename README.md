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

---

# QuickQuote CRM

Rate Calculate



all plus



raw material price

transportation 

production cost

profit margin



gst



e.g


we need to create a performa quoation invoice genrator, CRM 

mobile first, very simple clean and very fast to make

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dcced6c5-1268-4667-9c15-68851cac74d0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
