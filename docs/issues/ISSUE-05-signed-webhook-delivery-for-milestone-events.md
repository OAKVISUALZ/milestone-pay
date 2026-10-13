# Issue 05: Signed Webhook Delivery for Milestone Events

## 1. User Problem & Expected Benefit
- **User Problem**: Agencies and development shops want automated notifications in their internal systems (Slack, Discord, ERP, GitHub Actions) when a milestone is funded or released on-chain.
- **Expected Benefit**: Users can configure project webhook URLs that receive signed JSON payloads (with HMAC SHA-256 signatures) on each confirmed on-chain event.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: On-chain events update the local database, but do not push outbound webhook notifications to external services.
- **Relevant Files**:
  - `apps/api/src/indexer/service.ts`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/src/routes/projects.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add `WebhookEndpoint` model in Prisma schema (`url`, `secret`, `projectId`, `isActive`).
  - Outbound dispatch worker sending webhook payloads with header `X-MilestonePay-Signature: sha256=...`.
  - Exponential backoff retry queue (3 attempts).
- **Non-Goals**:
  - Inbound webhook processing from third parties.

## 4. Dependencies
- Node `crypto` for HMAC generation, native `fetch`.

## 5. Testable Acceptance Criteria
- [ ] User registers webhook URL with secret key.
- [ ] When `milestone_funded` or `milestone_released` is indexed, webhook endpoint receives JSON event.
- [ ] Request header contains valid HMAC SHA-256 signature matching payload.
- [ ] Failed webhook endpoints are retried up to 3 times with exponential backoff.

## 6. Required Tests
- Integration tests in `apps/api` validating webhook signature generation and delivery with mock HTTP server.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium (3/5).
- **Rationale**: Well-defined integration feature requiring clean error handling and background task management.
