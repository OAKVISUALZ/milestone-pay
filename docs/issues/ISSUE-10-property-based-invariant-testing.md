# Issue 10: Property-Based Invariant Testing for Contract Math & State

## 1. User Problem & Expected Benefit
- **User Problem**: Unit tests verify specific example values, but edge cases involving extreme amounts, rapid sequential operations, or arbitrary state transitions may go undetected.
- **Expected Benefit**: Formally rigorous testing using `proptest` or `quickcheck` generating thousands of randomized state sequences to prove contract balance preservation and invariant integrity under all conditions.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: Tests in `contracts/escrow/src/test.rs` are deterministic example-based tests.
- **Relevant Files**:
  - `contracts/escrow/Cargo.toml`
  - `contracts/escrow/src/test.rs`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Integrate `proptest` into `contracts/escrow` dev-dependencies.
  - Test invariants:
    1. Contract balance always equals sum of currently `Funded` milestones.
    2. Sum of client received + freelancer received + escrowed equals initial deposit.
    3. Terminal states are completely absorbing (cannot exit `Released`, `Refunded`, or `Cancelled`).
- **Non-Goals**:
  - Formal mathematical verification using TLA+ or Coq.

## 4. Dependencies
- `proptest` crate.

## 5. Testable Acceptance Criteria
- [ ] At least 1,000 randomized execution traces run and pass without assertion failures.
- [ ] Overflow and underflow conditions are verified impossible across all `i128` values.

## 6. Required Tests
- Property test module in `contracts/escrow/src/proptest.rs`.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium-High (4/5).
- **Rationale**: Requires crafting state generators and mock environments in Rust.
