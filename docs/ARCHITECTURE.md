# Tyson architecture

## Goals and boundaries

Tyson is split into a static, untrusted browser client and a Cloudflare-hosted API. All authorization, ownership checks, validation, moderation decisions and persistence happen in the Worker. The frontend never receives server secrets and never decides whether a user is an administrator.

```text
GitHub Pages (React/Vite)
        |
        | HTTPS + HttpOnly session cookie
        v
Cloudflare Worker API
  |        |          |
  v        v          v
 D1       KV     Durable Objects
 data    media    realtime/WebSocket
  |
  +--> Gemini API for moderation and summaries
```

The static site and API should use sibling custom domains such as `tyson.example` and `api.tyson.example`. Cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, a narrow path and opaque random session tokens. D1 stores only a SHA-256 digest of each session token.

## Repository structure

```text
frontend/
  public/              static assets and GitHub Pages fallback
  src/
    components/        reusable product UI
    pages/             route-level screens
    lib/               API client and browser utilities
backend/
  src/
    routes/            REST route composition
    middleware/        CORS, request IDs, auth and rate limits
    repositories/      D1 access and ownership-scoped queries
    services/          use cases
    schemas/           Zod request/response schemas
    ai/                provider interfaces and dev implementations
    recommendations/   replaceable scoring module
    security/          sessions, password hashing and abuse controls
    durable-objects/   realtime coordination
database/migrations/   D1 SQL migrations
docs/                  architecture and security decisions
```

## Data and API

D1 stores normalized product data and opaque media keys, never media bytes. For the card-free MVP, media bytes live in Workers KV behind the `MediaStorage` interface. Keys are server-generated UUID-based paths; the Worker checks ownership, MIME type, decoded content and a 5 MiB limit before accepting uploads. Original client filenames are never used as storage keys.

Workers KV is an intentional MVP compromise: it has eventual consistency, a 1 GB free storage allowance and daily operation limits. It is suitable for early avatars and post images but not the long-term high-volume media layer. The abstraction keeps REST routes and D1 records storage-agnostic so KV can later be replaced with R2 without changing public API contracts.

Success responses use `{ "data": ..., "meta"?: ... }`. Errors use `{ "error": { "code", "message", "requestId", "details"? } }`. Unknown fields are rejected for writes. IDs are server-generated UUIDs. Feed pagination uses opaque cursors.

Route groups are `/api/auth`, `/api/users`, `/api/posts`, `/api/comments`, `/api/reactions`, `/api/feed`, `/api/ai`, `/api/company`, `/api/messages` and `/api/admin`.

## Authentication and security

Passwords will be hashed behind a `PasswordHasher` interface with a reviewed Worker-compatible implementation. The baseline uses PBKDF2-HMAC-SHA-256 through native Web Crypto, a unique random salt and versioned, benchmarked parameters. This avoids custom cryptography and leaves room for a future vetted memory-hard provider.

Registration, login, password recovery and email verification use one-time random tokens whose digests—not plaintext—are stored in D1. Login rotates the session, password changes revoke other sessions, and sensitive endpoints use per-IP plus per-account rate limits. State-changing cookie-authenticated requests require an allowed `Origin`; CORS never uses `*` with credentials.

Telegram account linking and login use Telegram's OIDC Authorization Code flow with PKCE. Short-lived hashed state values prevent CSRF, a nonce prevents ID-token replay, and `jose` verifies the RS256 signature through Telegram JWKS together with issuer, audience and expiry claims. The Worker keeps the Telegram client secret; the static frontend receives only an authorization URL and later exchanges a two-minute single-use login ticket. Linking Telegram activates a pending account without falsely marking its email address as verified.

User content is rendered as text, not raw HTML. The API applies request size limits, schema validation, authorization and ownership checks. Admin routes load the current user from the session and verify the persisted role and account status on every request.

## Recommendations

The recommender is hybrid. A deterministic scoring module combines freshness, normalized popularity, author affinity, explicit events and up to six user-selected topic preferences, then the provider-agnostic `RecommendationProvider` may rerank the bounded candidate set. The separate Fresh view remains strictly chronological. Production uses Gemini while a deterministic provider is available for local development and as a fallback. Gemini receives only public post excerpts, selected topic labels and anonymous interaction types—never email, username, message contents or other sensitive attributes. Results are cached in D1 for 15 minutes to control latency and free-tier usage. A hidden dislike is a strong negative signal and is never included in public or author-facing projections. A bounded exploration term preserves discovery. Events are limited to `impression`, `open`, `like`, `dislike` and `comment`.

## AI and abuse prevention

Public posts and comments pass through rule-based checks and a `ModerationProvider` interface whose production implementation is Gemini. The Cloudflare Worker calls Gemini over HTTPS using `GEMINI_API_KEY` from a Cloudflare secret; the browser has no provider access. Moderation, summary, recommendation and AI chat models are selected independently through `GEMINI_MODERATION_MODEL`, `GEMINI_SUMMARY_MODEL`, `GEMINI_RECOMMENDATION_MODEL` and `GEMINI_CHAT_MODEL`. Structured JSON output is validated again with Zod before it can influence application state. Decisions are `allow`, `review` or `block`, with risk, categories, reason, provider and model version persisted. A Gemini safety-filter response becomes `review`, and one model decision never creates an irreversible account ban.

Tyson AI conversations and their text messages are private per-user D1 resources with ownership checks on every route. The daily UTC quota is enforced atomically in D1: 10 requests normally or 20 with a server-verified Telegram identity. Optional prompt images are signature-validated, limited to 5 MiB and passed to Gemini inline. Their KV objects expire after 24 hours, while a scheduled Worker removes stale object keys from D1 without deleting the surrounding messages or conversation.

Anti-abuse combines rate limits, repeated-content fingerprints, account age, activity velocity and suspicious-link rules with Gemini moderation. Images are loaded from KV by the Worker, size-checked, converted to supported multimodal parts and sent with the public post text; storage bindings and Gemini keys remain server-side. Long-post summaries use the Gemini-backed `SummaryProvider`, are labeled AI-generated, keyed by a content hash, cached in D1 and invalidated when a post changes. Development uses deterministic local providers when no Gemini key is present.

Prompts treat user content strictly as untrusted data to reduce prompt-injection risk. Gemini output remains untrusted input: schema validation, rule-based checks and human review still apply. Before production launch, the team must document retention, regional processing and provider terms for public content sent to Gemini.

## E2EE messaging boundary

Messaging is deliberately scheduled after public-content safety features. Tyson will use an audited protocol/library rather than custom cryptography. Each device owns its private identity material; the server stores device public keys, ciphertext and delivery metadata only. Before implementation, Tyson will document the threat model, key verification, multi-device enrollment, backup/recovery and lost-device behavior. Server-side AI moderation cannot inspect E2EE message content; abuse reporting must be an explicit client action with clearly disclosed plaintext sharing.

## Delivery plan

1. Foundation: monorepo, schema, frontend shell, Worker health API, CI and deployment.
2. Authentication and session lifecycle.
3. Profiles and company applications.
4. Posts, KV-backed uploads and ownership controls.
5. Exclusive like/hidden-dislike reactions and comments.
6. Feed events and baseline recommendation scoring.
7. Moderation providers, review queue and abuse detection.
8. Cached AI summaries.
9. Admin panel and operational hardening.
10. E2EE design review, then one-to-one messaging.
