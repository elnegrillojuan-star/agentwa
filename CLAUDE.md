# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Project 01 — a multi-tenant WhatsApp inbox platform: inbox + light CRM + AI agent runtime (OpenRouter) +
human handoff + tool/connector layer, YCloud-only for WhatsApp, HighLevel as the only v1 integration, strict
Meta 24h-window/template compliance. Full product spec: `BRIEF.md`. Target architecture and the day-1 build
checklist this repo followed: `ARQUITECTURA-OBJETIVO.md`. Everything here is **day-1 happy path** — no
message buffer, no handoff automation, no template/window enforcement yet; see "What's deliberately not
built yet" below before assuming a gap is a bug.

## Commands

- `npm run dev` — start the dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config via `eslint.config.mjs`, extends `eslint-config-next`)
- `npx tsc --noEmit` — type-check without emitting
- `npx shadcn@latest add <component>` — add a shadcn/ui component (see the gotcha below before touching one)

There is no test runner configured yet.

## Reading package docs before writing code

Several dependencies here are pinned to versions with real breaking changes from what training data
assumes — this isn't hypothetical, it broke code while building this repo. Before touching an area, check
that package's own bundled docs first:

- **Next.js** (`node_modules/next/dist/docs/`): `middleware.ts` is deprecated and renamed to `proxy.ts`,
  exported function named `proxy` not `middleware` (see `src/proxy.ts`). `LayoutProps<"/">` route-typed
  props are used in `src/app/layout.tsx`.
- **`@supabase/supabase-js`, `@supabase/realtime-js`, etc.** ship their own `AGENTS.md` pointing at
  `migrations/*.md` files in the package for caller-facing breaking changes — read those before assuming
  how a Supabase JS API behaves. This version requires the `Database` type to include an
  `__InternalSupabase: { PostgrestVersion: "13" }` marker (see the gotcha in `src/lib/supabase/types.ts`);
  omitting it doesn't error, it silently makes every query resolve to `never`.
- **zod is v4** (not v3) — use its native `z.toJSONSchema()` (see `src/lib/tools/registry.ts`) instead of
  the third-party `zod-to-json-schema` package, whose types target zod v3's shape.
- **shadcn/ui here is built on `@base-ui/react`, not Radix** — prop names mostly match Radix conventions
  (`checked`/`onCheckedChange`, etc.) but don't assume it; check the generated component in
  `src/components/ui/` for the actual primitive import and prop types before wiring one up.

## Architecture

App Router lives under `src/app`; the `@/*` path alias resolves to `src/*` (`tsconfig.json`). Tailwind CSS
v4 is wired through `@tailwindcss/postcss`, imported via `@import "tailwindcss"` in `src/app/globals.css`.
shadcn/ui components live in `src/components/ui/` (see the base-ui gotcha above).

### Runtime pipeline (day-1 happy path)

```
YCloud webhook → src/app/api/webhooks/ycloud/route.ts
  → verify YCloud-Signature (src/lib/ycloud/verify-webhook.ts)
  → resolve workspace by inbound "to" number, upsert contact, upsert conversation, insert message
  → src/lib/agent/respond.ts (system prompt from `prompts` table, history from `messages`,
    tool-calling loop via src/lib/tools/registry.ts, OpenRouter via src/lib/openrouter/client.ts)
  → src/lib/ycloud/client.ts sendText() → insert outbound message
```

No buffer/debounce yet (BRIEF §2), no automatic handoff (§3), no 24h-window/template enforcement (§10) —
those are the next layers per `ARQUITECTURA-OBJETIVO.md` §2. The inbox composer and the webhook path both
send free-text unconditionally today.

### Supabase

- `src/lib/supabase/client.ts` — browser client, for Client Components.
- `src/lib/supabase/server.ts` — server client (cookie-backed), for Server Components/Actions.
- `src/lib/supabase/service.ts` — service-role client (bypasses RLS). Only for trusted server contexts with
  no user session: the inbound webhook, the agent runtime. Never expose to a code path driven by
  unauthenticated request input without its own check.
- `src/lib/supabase/session.ts` + `src/proxy.ts` — refresh the auth session cookie on every request. The
  proxy **fails open** (skips refresh, doesn't throw) when Supabase env vars are unset, because it runs on
  every route including ones that don't need Supabase — don't remove that guard.
- `src/lib/supabase/types.ts` — hand-written `Database` type matching `supabase/migrations/0001_init.sql`.
  Replace with `supabase gen types typescript` once a project is linked, but if you hand-edit it: use plain
  object literals for `Row`/`Insert`/`Update`, not `Partial<Row> & Pick<Row, K>` — see the comment at the
  top of the file for why the mapped-type version silently breaks.
- Required env vars (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. YCloud/OpenRouter credentials are **not** env vars — they're per-workspace
  columns on `workspaces` (multi-tenant by design; see `.env.example`'s note).

### Schema (`supabase/migrations/0001_init.sql`)

Day-1 minimal set from `ARQUITECTURA-OBJETIVO.md`: `workspaces`, `contacts`, `conversations`, `messages`,
`prompts`, `tool_configs`, `templates` — plus `workspace_members` (workspace↔`auth.users` with a role),
which isn't in that list but is required plumbing: without it there's no way to know which user belongs to
which workspace, and multi-tenancy is a fixed decision from day one. RLS is enabled on every table, scoped
through `is_workspace_member()`/`is_workspace_admin()`; the webhook and agent runtime use the service-role
client and bypass it entirely. Later layers (`message_batches`, `business_info`, `kb_documents`,
`setter_configs`, `schedules`, `integrations`, `logs`) get their own migrations when those features are
built — don't add them speculatively.

### Tool contract (`src/lib/tools/`)

One `Tool` interface (`types.ts`) for every agent capability — KB search, HighLevel, scheduling, or a
workspace's own `custom_webhook` — so the agent runtime never special-cases which kind it's calling.
`registry.ts` filters tools by `enabledFor()` + each workspace's `tool_configs` row, converts their zod
schemas to OpenRouter's function-calling format, and runs a tool by name with validated args.
`obtener-info-cliente.ts` is the reference implementation; copy its shape for new tools rather than
reinventing the contract.

### YCloud integration (`src/lib/ycloud/`)

Confirmed against `docs.ycloud.com` and `github.com/YCloud-Developers/ycloud-whatsapp-mcp-server` (the docs
site 403s direct `WebFetch`; use `WebSearch` or the GitHub OpenAPI yaml instead). Known gotchas baked into
the client: auth header is `X-API-Key` (not Bearer), inbound phone numbers sometimes arrive without a
leading `+` (`normalizePhone()` in `client.ts`), and template language must be the bare code (`es`), not a
country variant (`es_PA`). Webhook signature verification (`verify-webhook.ts`) follows the documented
`YCloud-Signature: t=<ts>,s=<hmac>` scheme, `HMAC-SHA256("${t}.${rawBody}")` — verify against the raw body
string before `JSON.parse`.

### Inbox (`src/app/inbox/`, `src/components/inbox/`)

Server component (`page.tsx`) resolves the signed-in user's first workspace via `workspace_members` and
loads initial conversations/contacts; `InboxShell` (client) subscribes to `postgres_changes` on
`conversations` for live updates, `ConversationThread` does the same per-conversation on `messages`.
`actions.ts` has the two server actions: `setAiActive` (toggles `ai_active` ↔ `human_active`) and
`sendHumanMessage` (sends via YCloud + inserts the outbound row). Not implemented yet: window/template
enforcement in the composer (it shows the 24h window state but doesn't block sending), and the full 6-state
state machine (only the AI/human binary is wired to the UI toggle).

### What's deliberately not built yet

No login/onboarding UI, no route-gating in `proxy.ts` (add once auth pages exist), no buffer/debounce, no
automatic handoff, no HighLevel integration, no KB/setter/scheduling. These are later layers per
`ARQUITECTURA-OBJETIVO.md` §2 — check there before assuming something is missing by accident.

### Supabase MCP

`.mcp.json` expands `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` from the environment (not
committed) — export both in your shell before connecting so Claude Code can query the linked Supabase
project directly.
