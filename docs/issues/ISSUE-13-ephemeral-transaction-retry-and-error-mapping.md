# Issue 13: Transaction Error Mapping & Simulation Diagnostic UX

## 1. User Problem & Expected Benefit
- **User Problem**: When a wallet transaction fails (e.g. insufficient testnet XLM balance, expired TTL, or missing auth signature), the raw Soroban RPC error message is cryptic (e.g. `HostError: Error(Contract, #1)`).
- **Expected Benefit**: A user-friendly error mapper that intercepts contract simulation error codes (`ContractError` 1..8) and translates them into plain-English instructions with remediation links.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The frontend prints raw exception messages in the error banner.
- **Relevant Files**:
  - `packages/shared/src/index.ts`
  - `packages/sdk/src/client.ts`
  - `apps/web/src/components/MilestoneCard.tsx`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Create `ContractErrorMap` mapping contract error codes:
    - 1 (`InvalidState`): "This milestone is not in the expected state for this operation."
    - 2 (`Unauthorized`): "Your connected wallet is not authorized to perform this action."
    - 3 (`ZeroAmount`): "Milestone amount must be positive."
    - 4 (`InvalidParties`): "Client and freelancer cannot be the same address."
    - 8 (`CannotCancelFunded`): "Cannot cancel a milestone that is already funded in escrow."
  - Detect insufficient balance errors and provide a link to the Stellar Testnet Friendbot.
- **Non-Goals**:
  - Automatically funding accounts.

## 4. Dependencies
- `@milestone-pay/shared`, `@milestone-pay/sdk`.

## 5. Testable Acceptance Criteria
- [ ] Simulation failure with code 8 renders clear UI banner: "Cannot cancel a funded milestone."
- [ ] Insufficient balance renders friendly Friendbot link.

## 6. Required Tests
- Unit tests in SDK for error parser.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low (1/5).
- **Rationale**: Pure frontend/SDK diagnostic mapping with immediate user benefit.
