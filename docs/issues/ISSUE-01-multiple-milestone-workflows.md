# Issue 01: Multi-Milestone Agreement Support

## 1. User Problem & Expected Benefit
- **User Problem**: Freelance projects frequently involve multiple sequential phases (e.g. Design, Frontend, Backend, Deployment). In the MVP, an agreement supports a single initial milestone.
- **Expected Benefit**: Clients and freelancers can define 2–10 milestones within a single agreement, specifying distinct amounts and deliverables for each phase without redeploying or creating separate agreements.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: `create_agreement` initializes `milestone_count = 1` and creates `Milestone(agreement_id, 1)` only.
- **Relevant Files**:
  - `contracts/escrow/src/lib.rs`
  - `contracts/escrow/src/types.rs`
  - `packages/shared/src/index.ts`
  - `packages/sdk/src/client.ts`
  - `apps/web/src/components/CreateProjectModal.tsx`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Contract function `add_milestone(agreement_id, amount)` callable by client before funding, or specifying an array of milestones during creation.
  - Tracking `milestone_count` dynamically.
  - Funding, releasing, and refunding individual milestone indices $1 \dots N$.
- **Non-Goals**:
  - Dynamically altering milestone amounts after a milestone has already reached `Funded` state.

## 4. Dependencies
- Soroban SDK 21 contract storage model.

## 5. Testable Acceptance Criteria
- [ ] Contract accepts multiple milestone definitions for an agreement.
- [ ] Each milestone index maintains independent state (`Created`, `Funded`, `Released`, `Refunded`, `Cancelled`).
- [ ] Releasing milestone $K$ only transfers milestone $K$'s amount and leaves other milestones untouched.
- [ ] Contract total balance equals the exact sum of all currently `Funded` milestones across the agreement.

## 6. Required Tests
- Unit test in `contracts/escrow/src/test.rs`: Agreement with 3 milestones, funding #1 and #2, releasing #1, refunding #2, leaving #3 unfunded.
- SDK tests for multi-milestone operation encoding.
- API and frontend validation for milestone array inputs.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium (3/5).
- **Rationale**: Requires updating contract data structures, storage keys, and frontend dynamic form arrays while maintaining strict balance invariants.
