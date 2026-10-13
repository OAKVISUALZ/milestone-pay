# Issue 14: Distributed Redis Rate Limiting & Edge WAF Integration

> **Baseline Status**: Single-instance sliding-window rate limiting (`10 req/min/IP` on `/api/auth/*`) and strict `50kb` request body size limits are **implemented and tested** in `apps/api/src/middleware/rateLimit.ts` and `apps/api/src/app.ts`.

## 1. User Problem & Expected Benefit
- **User Problem**: While the built-in in-memory sliding-window rate limiter protects a single API process against basic scripted floods, horizontally scaled multi-instance deployments do not share rate-limit state across processes. Furthermore, application-layer limits alone do not mitigate volumetric network DDoS attacks.
- **Expected Benefit**: Pluggable Redis store adapter for multi-replica synchronization and documented Cloudflare / reverse-proxy rate-limit rules.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: `createRateLimiter` in `apps/api/src/middleware/rateLimit.ts` tracks per-IP timestamps in a local `Map` and returns HTTP `429 Too Many Requests` with `Retry-After` headers.
- **Relevant Files**:
  - `apps/api/src/middleware/rateLimit.ts`
  - `apps/api/src/app.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add an optional Redis store backend (`REDIS_URL`) to `createRateLimiter` with automatic fallback to the in-memory store for local development.
  - Add periodic database pruning of expired `AuthChallenge` rows older than 24 hours.
- **Non-Goals**:
  - Replacing edge-level DDoS mitigation (must still be handled by reverse proxy / CDN).

## 4. Testable Acceptance Criteria
- [ ] Two separate `createApp()` instances sharing a Redis store enforce a combined 10-request/minute budget per IP.
- [ ] Expired `AuthChallenge` nonces are cleaned up automatically without blocking active requests.
