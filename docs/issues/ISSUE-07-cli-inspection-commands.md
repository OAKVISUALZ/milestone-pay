# Issue 07: CLI Agreement & Escrow Inspection Command

## 1. User Problem & Expected Benefit
- **User Problem**: Operators and auditors frequently need to inspect on-chain escrow status directly from a terminal without loading the web interface.
- **Expected Benefit**: A lightweight CLI command (`npm run cli:inspect -- <agreement_id>`) that fetches and displays formatted agreement details, participant addresses, milestone statuses, and on-chain token balances.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: Inspection requires raw `stellar contract invoke` or querying the database.
- **Relevant Files**:
  - `packages/sdk/src/client.ts`
  - `packages/shared/src/index.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Implement `packages/sdk/src/cli.ts` executable via `milestonepay-cli`.
  - Commands: `inspect <agreementId>`, `list-events <contractId>`, `verify-balance <agreementId>`.
  - Formatted ASCII table output with colored status badges.
- **Non-Goals**:
  - Interactive transaction signing in CLI (leaves signing to wallets).

## 4. Dependencies
- `@stellar/stellar-sdk`, `commander`.

## 5. Testable Acceptance Criteria
- [ ] Running `npx milestonepay-cli inspect 1` prints agreement participants, token, and milestones.
- [ ] Non-existent agreement returns clear error message with exit code 1.

## 6. Required Tests
- CLI integration tests mocking RPC simulation responses.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low-Medium (2/5).
- **Rationale**: Clean command-line utility with direct SDK integration.
