# Getränke Elias

Next.js 16 / React 19 / TypeScript application with Supabase Postgres/Auth and Vercel hosting. Public website, searchable 108-position delivery catalog, non-binding customer inquiries and authenticated operations workspace.

## Local development
1. `npm ci`
2. Populate `.env.local` from `.env.example` with this project's credentials. Never commit credentials. `SETTINGS_ENCRYPTION_KEY` is 32 random bytes as hexadecimal; keep it safely backed up before storing SMTP credentials.
3. `npm run dev`
4. `npm test`, `npm run lint`, `npm run build`

## Data and security
- SQL migration order: files in `supabase/migrations/` by filename.
- `data/catalog.json` preserves all 108 rows of the original February 2026 delivery list; regenerate with `scripts/import_catalog.py` after extracting `data/source-catalog.txt`.
- Unknown deposits and stock remain `null`. Prices are not automatically verified for checkout.
- Supabase RLS is enabled on every business table. Public keys have no business write access. Server routes validate input, authenticate staff and check roles before using the service client.
- Owner membership exists only in `staff`, never derived from editable auth metadata. Signup does not grant a role.
- SMTP credentials use AES-256-GCM with a deployment secret. Public API masks supplier/inventory fields and never exposes settings secrets.
- The outbox never sends to a demo supplier. Supplier auto-send and SMTP must both be explicitly enabled. Ambiguous delivery outcomes require human review instead of blind retries.
- Immutable test receipts and closing records; amount fields are integer cents. Repeat calls are idempotent. Test receipts do not reduce real stock.

## Routes
Public: `/`, `/sortiment`, `/lieferservice`, `/kontakt`, `/impressum`, `/datenschutz`.
Staff: `/login`, `/crm`, `/crm/finanzen`, `/crm/kasse`, `/crm/artikel`, `/crm/bestellungen`, `/crm/einkauf`, `/crm/lieferanten`, `/crm/einstellungen`, `/passwort`.

## Scheduled jobs
Vercel cron: reorder every hour and mail every five minutes. Endpoints require `CRON_SECRET`. Default configuration disables both automatic reorder and mail. Reorder drafts can also be generated manually after enabling the policy.

## Verification
- `npm test`: money, VAT, deposit returns, catalog import, validation and reorder boundaries.
- `tests/database.sql`: transactional database integration test ending in ROLLBACK. No persistent business data is created.
- `scripts/browser-check.mjs`: desktop/mobile/tablet, auth, catalog/cart, article write and PDF download. Uses locally provisioned owner credentials, without printing them.

## Important boundaries
The POS is a TEST system, not a production fiscal cash register. No TSE provider has been connected. Card selection does not charge a card. CSV/PDF financial exports are not DSFinV-K/DATEV. Native apps and direct printer SDK integration are later project phases after web acceptance. See [TSE and operation](docs/TSE-UND-BETRIEB.md) and [implementation plan](docs/UMSETZUNGSPLAN.md).

The original logo is stored in `public/images/elias-logo.png`. Hero photography was generated with the built-in image generation tool, then stored in `public/images/drinks-hero.jpg`. It is illustrative, not a representation of the actual shop. Prompt: editorial beverage still life with reusable mineral-water, beer, lemonade and wine bottles, lime, warm stone counter, olive background and natural sunlight; no product-brand claims.
