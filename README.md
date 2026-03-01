<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/12KufRUK6L1wyfEan2h_UqcYEitKuU_OS

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase DB context + schema/types

We keep a single copy‑pasteable “database context” file, generated from the live Supabase DB:
- `supabase/DB_CONTEXT.md`

And we keep the working TypeScript DB schema used by the app (frontend + backend) here:
- `src/types/database.ts`

To refresh `DB_CONTEXT.md` from your Supabase project (uses `.env`):

```bash
bun --env-file .env scripts/supabase/pull-schema.ts
```

Or:

```bash
bun run supabase:schema
```

To refresh `DB_CONTEXT.md` from a full SQL schema dump via Supabase CLI (`supabase db dump`):

```bash
bun run supabase:context:cli
```

Notes:
- This command derives the project ref from `NEXT_PUBLIC_SUPABASE_URL`.
- If `SUPABASE_DB_PASSWORD` is set, the script builds the DB URL automatically.
- If password is not set, it falls back to the linked/authenticated Supabase CLI project (`supabase login` + `supabase link`).
- If CLI dump fails (for example Docker/auth issues), it automatically falls back to REST OpenAPI introspection when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set.
- For CI/non-interactive environments, you can still set `SUPABASE_DB_URL` explicitly.

Then validate that `src/types/database.ts` still matches the live schema resource set:

```bash
bun run supabase:schema:check
```

## Realtime Collector (Railway/Bun)

This repo now includes a market data collector worker:

```bash
bun run collector:polymarket
```

It performs:
- snapshot reconciliation from Polymarket REST,
- websocket ingestion from RTDS,
- batched upserts to `polymarket_market_live` and `polymarket_candles_1m`,
- mirror cache sync safety updates.
