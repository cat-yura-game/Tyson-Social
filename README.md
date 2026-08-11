# Tyson

Tyson is a modern social network built as a static React application backed by Cloudflare Workers, D1, Workers KV and Durable Objects.

## Current status

The first MVP foundation includes an adaptive frontend shell, a modular Worker API, the initial D1 schema, shared API conventions, Cloudflare configuration and GitHub Pages deployment automation. Authentication, profiles and post workflows are the next vertical slices.

## Local setup

Requirements: Node.js 22+, pnpm 10+, and a Cloudflare account for backend deployment.

```bash
pnpm install
copy .env.example frontend/.env.local
pnpm dev:backend
pnpm dev:frontend
```

The frontend runs at `http://localhost:5173`; the Worker runs at `http://localhost:8787`. Run the full quality gate with `pnpm check`.

The deployed development API is `https://tyson-api.clickerscatom.workers.dev`. Its public readiness endpoint is `/api/health`. Production remains intentionally undeployed until the real frontend origin and required secrets are configured.

## Cloudflare setup

1. Authenticate with `npx wrangler login`.
2. Create D1 with `npx wrangler d1 create tyson-db`.
3. Create two KV namespaces with `pnpm exec wrangler kv namespace create tyson-media` and `pnpm exec wrangler kv namespace create tyson-media-production`.
4. Put the returned D1 database and KV namespace IDs in `backend/wrangler.jsonc`.
5. Apply migrations locally: `pnpm --filter @tyson/backend db:migrate:local`.
6. Apply them in production: `pnpm --filter @tyson/backend db:migrate:remote`.
7. Add secrets: `pnpm exec wrangler secret put SESSION_SECRET --config backend/wrangler.jsonc` and `pnpm exec wrangler secret put GEMINI_API_KEY --config backend/wrangler.jsonc`.
8. Deploy with `pnpm --filter @tyson/backend deploy`.

Set `GEMINI_MODERATION_MODEL`, `GEMINI_SUMMARY_MODEL` and `GEMINI_RECOMMENDATION_MODEL` as non-secret Wrangler variables. The free-MVP default for all three tasks is `gemini-3.5-flash-lite`. The variables remain separate so each task can be migrated independently later. For local AI calls, copy `backend/.dev.vars.example` to `backend/.dev.vars`. Never commit `.dev.vars`, `.env.local`, API keys or credentials.

All Gemini calls originate in the Cloudflare Worker. The frontend never receives the key and cannot call Gemini directly. Without a Gemini key, non-production environments use deterministic development providers; production fails closed during provider construction.

## MVP cost policy

The initial environment must stay within free tiers and must not require a payment card. D1 holds relational data, Workers KV temporarily holds media, GitHub Pages hosts the static frontend, and the development Worker runs on `workers.dev`. Any provider that requires billing activation must be approved and documented before it is enabled.

## GitHub Pages and custom domain

Set the repository variable `VITE_API_URL` to the production Worker URL. Pushes to `main` trigger `.github/workflows/deploy-pages.yml`. The workflow publishes the static frontend and creates the SPA fallback required for direct route navigation.

The production frontend domain is `368240.lol`; `frontend/public/CNAME` is already configured for GitHub Pages. Add the domain in the repository's Pages settings, configure its DNS records, and set the production frontend build to use `VITE_API_URL=https://api.368240.lol`. The Worker accepts credentialed browser requests only from `https://368240.lol` and `https://www.368240.lol`.

## Project map

- `frontend/` — React, TypeScript and Vite static client.
- `backend/` — Cloudflare Worker REST API.
- `database/migrations/` — ordered D1 migrations.
- `docs/ARCHITECTURE.md` — architecture, security boundaries and delivery plan.
