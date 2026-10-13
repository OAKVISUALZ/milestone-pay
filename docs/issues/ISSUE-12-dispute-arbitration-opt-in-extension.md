# Issue 12: Opt-In Third-Party Arbitrator Extension Architecture

## 1. User Problem & Expected Benefit
- **User Problem**: In high-value contracts where parties do not know each other, mutual refund deadlocks may cause funds to remain locked indefinitely if neither party agrees.
- **Expected Benefit**: An architectural design and contract prototype where parties can optionally designate a mutually trusted third-party arbitrator address (`Option<Address>`) at agreement creation, who can be invoked to arbitrate disputed refunds.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The contract has no arbitrator or administrator key. Mutual refund strictly requires authorization from both client and freelancer.
- **Relevant Files**:
  - `contracts/escrow/src/lib.rs`
  - `contracts/escrow/src/types.rs`
  - `docs/THREAT_MODEL.md`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Architectural RFC documenting security implications and game theory.
  - Experimental branch with contract function `arbitrate_milestone(agreement_id, milestone_id, release_to_freelancer: bool)` callable ONLY by designated arbitrator.
  - Strict opt-in: If no arbitrator is specified at creation (`None`), default mutual-refund behavior remains completely unchanged.
- **Non-Goals**:
  - Centralized default platform arbitration.

## 4. Dependencies
- Soroban SDK 21 `Option<Address>`.

## 5. Testable Acceptance Criteria
- [ ] Agreement without arbitrator cannot be arbitrated by any third party.
- [ ] Agreement with arbitrator allows arbitrator authorization to resolve locked milestone.
- [ ] Arbitrator cannot divert funds to any address other than client or freelancer.

## 6. Required Tests
- Contract tests covering both None and Some(arbitrator) configurations.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: High (4/5).
- **Rationale**: Involves critical security and game theory design to ensure the arbitrator cannot steal or misdirect funds.
