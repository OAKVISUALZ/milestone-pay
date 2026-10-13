# Issue 03: Mutual Refund Multi-Signature Signing UX

## 1. User Problem & Expected Benefit
- **User Problem**: Refunding a funded milestone requires dual authorization (`client.require_auth()` AND `freelancer.require_auth()`). Currently, submitting a mutual refund requires building and signing an envelope across two separate wallet sessions manually.
- **Expected Benefit**: A streamlined off-chain counter-signing workflow where the client initiates a refund request, the transaction envelope is stored pending in the API, the freelancer reviews and signs it, and the fully-signed envelope is automatically submitted to Soroban RPC.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The contract enforces dual authorization, but the web UI triggers an informational prompt rather than a multi-party signature coordination flow.
- **Relevant Files**:
  - `contracts/escrow/src/lib.rs`
  - `apps/api/src/routes/projects.ts`
  - `apps/web/src/components/MilestoneCard.tsx`
  - `packages/sdk/src/client.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - API endpoint `POST /api/milestones/:id/refund-request` storing partially signed transaction XDR from party 1.
  - Notification or UI badge alert informing party 2 that a mutual refund is awaiting their signature.
  - Party 2 counter-signs the XDR; API or frontend broadcasts the fully signed envelope.
- **Non-Goals**:
  - Unilateral refunds without party 2's signature.

## 4. Dependencies
- Stellar SDK Transaction Envelope XDR parsing and signature accumulation.

## 5. Testable Acceptance Criteria
- [ ] Client initiates mutual refund; API stores pending partial envelope.
- [ ] Freelancer sees pending refund alert in dashboard.
- [ ] Freelancer signs envelope with Freighter; transaction submits and confirms on testnet.
- [ ] Milestone transitions to `REFUNDED` and tokens return to client.

## 6. Required Tests
- API integration tests for storing and retrieving partial envelope XDR.
- SDK tests demonstrating multi-party signature assembly.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium-High (4/5).
- **Rationale**: Requires robust XDR validation on backend to ensure neither party modifies transfer destination or amounts between signing rounds.
