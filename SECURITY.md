# Security Policy

## Supported versions

Only the `main` branch is supported. 

## Reporting a vulnerability

Please report security issues privately via GitHub's "Report a
vulnerability" advisory flow. Do not open a public issue. We aim to
acknowledge within 72 hours.

## In scope

- Leakage of server-side secrets to the client bundle
- Bypass of the news-feed sanitizer (`src/lib/live-feed.sanitize.ts`)
- Forged attestations or unauthorized onchain writes
- XSS / CSRF in the live preview

## Out of scope

- Vulnerabilities in third-party service like Cloudflare,
  Arc RPC = please report those upstream.
- Wallet-level phishing that does not originate from this codebase.
