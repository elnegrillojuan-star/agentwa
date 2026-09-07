# AgentWA

A SaaS dashboard for WhatsApp, built with [Next.js](https://nextjs.org) and [Tailwind CSS](https://tailwindcss.com), using [Supabase](https://supabase.com) for authentication and backend, deployed on [Vercel](https://vercel.com).

## Getting Started

1. Copy the env file and fill in your Supabase project credentials (Supabase dashboard → Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase MCP

`.mcp.json` connects Claude Code to your Supabase project via MCP. It reads two environment variables from your shell (do not commit them):

```bash
export SUPABASE_ACCESS_TOKEN=your_personal_access_token
export SUPABASE_PROJECT_REF=your_project_ref
```

Generate a personal access token from your [Supabase account settings](https://supabase.com/dashboard/account/tokens); the project ref is in the project URL/dashboard settings.

## Stack notes

- This project pins a Next.js version with breaking changes from the version most tooling/training data expects — see `AGENTS.md` before writing Next.js-specific code (routing, config, request handling).
- Supabase client helpers live in `src/lib/supabase/` (browser, server, and session-refresh for `src/proxy.ts`).

## Deploy on Vercel

Push the repository to Git and [import it into Vercel](https://vercel.com/new). Add the same environment variables from `.env.example` in the Vercel project settings before deploying.
