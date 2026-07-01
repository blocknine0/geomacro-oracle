# Contributing

Thanks for taking the time to look at Geomacro. 

## Ground rules

- Run `bun run lint` and `bunx vitest run` before opening a PR.
- Keep `src/**.server.ts` files out of client imports. Server logic is
  reached via `createServerFn` + `useServerFn`, never via direct import.
- Never store private keys or API secrets in `VITE_*` env vars — those
  ship to the browser.
- New onchain interactions must be signed by the user's wallet; the
  server never holds a signing key.
- New client-facing data must go through `src/lib/live-feed.sanitize.ts`
  (or an equivalent allowlist) so internal identifiers do not leak. The
  test `src/__tests__/live-feed-no-ids.test.ts` enforces this.

## Reporting a security issue

Please do not open public issues for security reports. Use a private
GitHub security advisory instead.
