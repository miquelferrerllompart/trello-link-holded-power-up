# AGENTS.md — Trello Link Holded Power-Up

> Guidance for **any** AI coding agent working in this repo (Claude, GPT, Gemini, Llama, etc.).
> This is the canonical agent guide; `CLAUDE.md` is a symlink to this file. These instructions
> override default behavior — follow them.

## Project overview

Trello Power-Up that links Trello cards with Eléctrica Ferrer's Holded CRM data (contacts, projects,
sales orders, purchase orders, waybills, invoices, estimates). Internal tool; UI strings are in **Spanish**.

## Development practices (read first)

- **TDD, always.** Develop every feature or bug fix test-first: name the public behavior under test,
  write the **failing test first** when practical, then the smallest change to make it pass, then
  refactor. Use the **`/tdd`** skill when available. Keep `npm test` green.
- **UI/UX via `/frontend-design`.** For any new or reshaped interface — layout, typography, visual
  direction, empty/loading/error states — use the **`/frontend-design`** skill. Vanilla CSS, dark-mode
  aware, distinctive but disciplined.
- **Micro-interactions via `/emil-design-eng`.** For animation, transitions, hover/press feedback and
  motion polish, use the **`/emil-design-eng`** skill. Custom easing, keep UI animations < 300ms,
  respect `prefers-reduced-motion`, and do **not** animate frequently-repeated actions (tab switches,
  pagination) — only entrances/loads.
- **Cloudflare/Wrangler via the wrangler/cloudflare skill** for any Workers, Pages, secrets, or deploy
  work. Never pass secrets on the CLI or via `echo` when a file/stdin path exists.
- **Gate before done:** `npm test` and `npm run build` (`tsc && vite build`) must pass.

## Architecture

Two components:

- **Frontend** (Cloudflare Pages): Vite + TypeScript, no framework. Hosted at `trello-link-holded-power-up.pages.dev`.
- **Worker** (Cloudflare Workers): thin proxy at `holded-proxy.electricaferrer.workers.dev` for the
  Eléctrica Ferrer **internal API**. Holds the `EF_INTERNAL_API_KEY` secret — the frontend never sees it.

The Power-Up runs **entirely on the internal API** (`api.app.electricaferrer.es/internal/v1`). There is
no direct Holded API call and no Cloudflare KV store anywhere.

## Key conventions

- **No frameworks** — vanilla TypeScript, vanilla CSS. Keep it lightweight.
- **Trello Power-Up SDK** loaded via CDN script tag (`https://p.trellocdn.com/power-up.min.js`).
- **Icons**: `card-badges` / `card-back-section` accept a **string URL only**; `board-buttons` accepts a
  `{ dark, light }` object.
- **`public/card-back.html`** has **inline JS** (no Vite processing) to avoid CSP issues in Trello's
  iframe sandbox. Pure logic it mirrors (pills, tag regex) is unit-tested via the `src/` modules; the
  inline copy is covered by the JSDOM DOM tests in `src/card-back-documents.test.ts`.
- **Dark mode**: `@media (prefers-color-scheme: dark)` + Trello design tokens.

## Build & deploy

```bash
# Frontend (Pages)
npm run build          # tsc && vite build → dist/
npx wrangler pages deploy dist --project-name trello-link-holded-power-up --branch main

# Worker
cd worker && npx wrangler deploy
```

Note: Cloudflare edge propagation can lag a few seconds after deploy — cache-bust with `?cb=…` when
verifying, and prefer the deployment-specific URL to bypass the root-domain cache.

## Worker secret

One secret — the internal API key:

```bash
echo "efk_..." | npx wrangler secret put EF_INTERNAL_API_KEY --name holded-proxy
```

Must pipe via `echo` — non-interactive `wrangler secret put` otherwise sends an empty string. The key
also lives in `.env` as `INTERNAL_APP` (gitignored) for local reference. No KV binding; the old
`HOLDED_API_V2` / `HOLDED_API_KEY` secrets have been deleted.

## Trello Power-Up capabilities

Registered in `src/connector.ts`:

| Capability | File | Purpose |
|---|---|---|
| `card-badges` | `src/capabilities/card-badges.ts` | Shows linked contact/project on the card front |
| `card-back-section` | `src/capabilities/card-back-section.ts` | Iframe section in the card detail (always rendered) |

Linking is done from the **always-visible "Vincula un cliente/proyecto" placeholders** inside the
card-back section (they open the same search popups). There is intentionally **no `card-buttons`
capability** — the placeholders replaced it.

## Description tags

When linking a contact/project, a tag is appended to the card description: `{{ contact: Name }}` /
`{{ project: Name }}` (regex tolerates braces in the value). On **unlink**, the tag is removed.

- Adding happens in the search popup via `src/trello-api.ts` `updateCardDescription` (`ensureAuthorized`
  → REST PUT).
- **Unlinking runs in a popup** (`src/popups/unlink.html` → `src/unlink.ts` `unlinkField`), NOT inline
  in the card-back. The card-back-section iframe cannot reliably obtain a REST write token, so the
  card-back's ✕ opens the unlink popup (which has a reliable REST context, like the link flow). Opening
  a popup from inside an iframe **requires passing the mouse event** (`t.popup({ …, mouseEvent: e })`).
- `appKey` must be passed to both `TrelloPowerUp.initialize()` and `TrelloPowerUp.iframe()` for REST to work.
- Key files: `src/description-tags.ts` (tag add/remove), `src/unlink.ts` (orchestration), `src/trello-api.ts`.

## Card storage

Card data via `t.set('card', 'shared', 'holdedData', data)`:

```typescript
interface CardHoldedData {
  contactId?: string;
  contactName?: string;
  projectId?: string;
  projectName?: string;
}
```

## Worker endpoints

Thin proxy to the internal API. Auth: `EF_INTERNAL_API_KEY`. Client: `worker/internal-api.ts`. Every
route is internal-only — no Holded pass-through, no KV cache. Unknown routes → 404.

| Worker route | Internal API call | Use |
|---|---|---|
| `GET /contacts/search?q=` | `GET /contacts?query=` | Contact search (summaries) for the search popup |
| `GET /projects/search?q=` | `GET /projects?query=` | Project search → `{ id, name, contactName, key }` |
| `GET /v2/documents/search?contactId=&projectId=&type=&scope=&page=&cursor=` | `/sales-orders` \| `/waybills` \| `/invoices` \| `/estimates` (+ `/purchase-orders`) | One page of docs for the active card-back tab |
| `GET /v2/contacts/:id` | `GET /contacts/:id` | Contact detail (camelCase `customFields`) for the "Importante" box + address picker |
| `POST /v2/contacts?idempotencyKey=` | `POST /contacts` | Create contact (camelCase payload incl. `defaults`) |
| `POST /v2/contacts/:id/shipping-addresses?idempotencyKey=` | `POST /contacts/:id/shipping-addresses` | Append a shipping address |

- The bearer key is **never** returned in any error. Writes forward a per-submit `Idempotency-Key`.
- `type` ∈ `sales-orders` \| `waybills` \| `invoices` \| `estimates`. `scope` ∈ `matched` (sends `projectId`) \| `all`
  (drops it → all of the customer's docs).
- Sales orders, waybills, and invoices page by `page` (`pageSize` fixed 10); estimates page by `cursor`
  (`hasMore` + `nextCursor`). No totals — the UI shows `‹ Página N ›`. Sorted newest-first by issue date.
- Status pills come from server-derived enums — `internalStatus` (sales/purchase orders),
  `workflowStatus` (waybills), `displayStatus` (invoices/estimates) — mapped to canonical Spanish labels in
  `src/sales-order-display.ts` (mirrored inline in `card-back.html`).
- **Purchase orders and waybills** are fetched alongside sales orders (independent bounded loops over
  `/purchase-orders` and `/waybills`) and nested under each order by `sourceOrder.id`; orphan/off-page
  relations are dropped. Only `material` and `refund` waybill kinds render beneath sales orders;
  every waybill kind remains available with a Spanish kind subtitle in the main Albaranes tab.
  Degraded relation fetches add
  `purchaseOrdersError: true` or `waybillsError: true` independently. No extra nested tabs — both
  relation types render as tree children.
- `worker/holded-v2.ts` only builds `app.holded.com` deep-link URLs for document rows (no API client left).
- The internal-API contract is saved under `.context/api-docs/` (`openapi.yaml`, `llms-full.txt`);
  refresh from `https://api.app.electricaferrer.es/internal/v1/openapi.yaml` when it changes.

## Card-back document view

`public/card-back.html` (inline JS). Auto-loads the first tab (Pedidos de venta) when a **customer** is
linked; other tabs (Albaranes, Facturas, Presupuestos) lazy-load on click. Scope toggle is
`Proyecto vinculado | Todos`. Related material/devolución waybills (blue/red kind subtitles beneath
the document number, with status grouped beside the identity) and purchase orders (purple) nest under
their sales order on a shared relation rail. States: skeleton load,
`DATA_NOT_READY` ("Sincronizando…") + retry, quiet relation-degraded notes.

## Common issues / gotchas

- **Unlink/description tag not removed** → must run in the unlink **popup** and pass `mouseEvent` to
  `t.popup`; the card-back iframe can't get a REST write token.
- **`DATA_NOT_READY` (503)** from the worker → internal API still syncing; the UI shows "Sincronizando…"
  with a retry. Not an error to fix.
- **Edge cache lag after deploy** → cache-bust (`?cb=…`) or use the deployment-specific `*.pages.dev` URL.
- **"Missing valid icon"** in card-back-section → icon must be a plain string URL, not `{ dark, light }`.
- **"Invalid return_url"** on OAuth → Trello Power-Up admin allowed origins must include
  `https://trello-link-holded-power-up.pages.dev`.
- **Card-back not refreshing** → register a re-render callback with `t.render(function () { render(); })`.
