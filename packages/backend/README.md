# @polaris/backend

Convex schema, functions, and auth for Polaris.

## Commands

- `bunx convex dev` — dev loop against the dev deployment (`.env.local`)
- `bunx convex deploy` — deploy to production
- `bun run test` — convex-test suite (in-memory, no deployment)

## Deployment environment variables

Set with `bunx convex env set NAME value` (add `--prod` for production):

| Name | Purpose |
| --- | --- |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (callback: `https://<deployment>.convex.site/api/auth/callback/google`) |
| `SITE_URL` | Web app origin for post-auth redirects |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth token signing — `bun scripts/generate-auth-keys.ts` |
| `ALLOWED_EMAILS` | Comma-separated sign-in allowlist |
| `CRON_SECRET` | Service key for server-trusted writes (same value as the web env var) |
