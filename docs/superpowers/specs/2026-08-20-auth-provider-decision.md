# Auth provider decision — Convex Auth adopted

**Status:** decided 2026-08-21 · **Context:** phase 1 of the replatform
(`docs/replatform.md` §05, §08) required settling Convex Auth vs Clerk with two
timeboxed spikes before committing everywhere — "decide here, not in phase 7."

**Decision: Convex Auth.** Both gates passed on the real dev deployment
(`exciting-wolf-282`) with the exact pinned versions the phase ships:
`@convex-dev/auth 0.0.95`, `@auth/core 0.41.1`, `convex 1.44.0`,
`next 16.2.4`, `react 19.2.4`. Clerk remains the named fallback on the record
but is not being pursued.

## Gate 1 — web under Next 16.2.4 (PASS, 2026-08-21)

The full swap was wired for real, not thrown away: `ConvexAuthNextjsServerProvider`
wrapping the root layout, a client `ConvexAuthNextjsProvider`, and
`convexAuthNextjsMiddleware` running in **`src/proxy.ts`** — Next 16's
convention, which Convex Auth does not officially document. The build
recognizes it (`ƒ Proxy` in output) and the browser run verified the flow
end to end: signed-out redirect to `/auth/signin` (design unchanged), Google
consent, return to the app signed in, and — the known-risk check — the session
**persists across reload**, ruling out convex-auth issue #271's
"isAuthenticated always false under proxy" failure mode. The deprecated
`middleware.ts` fallback was never needed.

One self-inflicted incident during the first attempt, kept here as the
lesson: the Expo spike's temporary `redirect` callback returned a relative
`redirectTo` (`"/"`) verbatim, where the default callback resolves it against
`SITE_URL` (`@convex-dev/auth/dist/server/implementation/redirects.js`). The
OAuth callback then emitted a relative `Location: /?code=…` against the
`.convex.site` origin — a Convex HTTP 404 ("No matching routes found").
**Rule for phase 7: a custom Convex Auth `redirect` callback must return
absolute URLs or replicate the default's `SITE_URL` resolution.** Reverting
the shim fixed the web flow with no other change.

## Gate 2 — Expo throwaway screen (PASS, 2026-08-20)

A blank-TypeScript Expo SDK 57 app (scheme `polarisspike`, scratch dir
`.superpowers/spike/expo-auth-spike`, never committed) against the same dev
deployment: `ConvexAuthProvider` with `expo-secure-store` storage,
`signIn("google")` → `openAuthSessionAsync` through the `.convex.site`
callback → code exchange. The screen showed the signed-in allowlisted account
(raymart.villos@gmail.com). The official `get-convex/expo-convex-auth` example
is ~2 SDKs stale but adapted without forking anything; the spike fit its
4-hour timebox.

## Residual risks accepted

- Convex Auth is beta (0.0.x, "may change in backward-incompatible ways");
  versions are exact-pinned and upgrades are deliberate acts.
- Proxy-convention support is community-confirmed, not maintainer-documented
  (issue #271 open). Mitigation if it regresses: rename `src/proxy.ts` to
  `src/middleware.ts` — deprecated in Next 16 but functional, same code.
- The allowlist is enforced in `createOrUpdateUser`
  (`packages/backend/convex/lib/users.ts`), which owns the whole user upsert;
  its behavior is covered by convex-test.
