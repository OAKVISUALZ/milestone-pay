# MilestonePay Technical Walkthrough & Mentor Guide

This guide is designed for you as the open-source maintainer and lead architect of MilestonePay. It equips you to confidently present and explain the system architecture, smart contract mechanics, security guarantees, indexing pipeline, test suite, and deployment steps to contributors, reviewers, and evaluators.

---

## 1. How to Explain the Problem & Philosophy

**The Pitch**:
> "Traditional freelance platforms charge high fees and use centralized black-box dispute intermediaries. MilestonePay eliminates that by executing milestone escrow natively on Stellar Soroban. The smart contract acts as the neutral escrow vault: clients lock funds, freelancers complete deliverables, and clients release payment directly on-chain. There is no middleman administrator key who can seize or redirect the funds."

**Key Point to Emphasize**:
- "Stellar is not merely used as a login or decorative wallet connector. Soroban performs the actual custody and settlement. Tokens only move when authorized by cryptographic signatures."

---

## 2. Explaining the Authorization Model

### Why `require_auth()`?
In Soroban, when a smart contract method calls:
```rust
agreement.client.require_auth();
```
The Soroban host verifies that the transaction invocation tree includes a valid cryptographic signature from `agreement.client` authorizing this specific contract invocation.

### The Mutual Refund Dual-Authorization Invariant
In `contracts/escrow/src/lib.rs`:
```rust
pub fn refund_milestone(
    env: Env,
    agreement_id: u64,
    milestone_id: u32,
) -> Result<(), ContractError> {
    let agreement = Self::get_agreement(env.clone(), agreement_id)?;
    let mut milestone = Self::get_milestone(env.clone(), agreement_id, milestone_id)?;

    if milestone.status != MilestoneStatus::Funded {
        return Err(ContractError::InvalidState);
    }

    // Dual authorization: BOTH parties must cryptographically sign
    agreement.client.require_auth();
    agreement.freelancer.require_auth();
    ...
```
**How to explain this design decision**:
> "If a client could unilaterally refund escrowed funds, a malicious client could wait until a freelancer finishes work and then claw the funds back without paying. Conversely, if a freelancer could force release, they could take the money without delivering. Therefore, once funds are locked in `Funded` state:
> 1. Release requires client authorization (`release_milestone`).
> 2. Refund requires authorization from **both** client and freelancer (`refund_milestone`).
> In an unresolvable dispute, the funds remain safely locked until mutual accord is reached. There is no backdoor admin key."

---

## 3. Explaining Contract Storage & State Lifetime (TTL)

### Storage Tiers in Soroban
Soroban introduces state archival to keep ledger bloat manageable. In our contract:
1. **Instance Storage**: Stores global configuration and the monotonically increasing `agreement_id` sequence.
2. **Persistent Storage**: Stores long-lived domain records:
   - `DataKey::Agreement(agreement_id)`
   - `DataKey::Milestone(agreement_id, milestone_id)`

### TTL Bumping Strategy
Every time a user reads or mutates an agreement or milestone, the contract calls:
```rust
env.storage().persistent().extend_ttl(
    &key,
    PERSISTENT_BUMP_THRESHOLD, // 50,000 ledgers (~3.5 days)
    PERSISTENT_EXTEND_TO,      // 100,000 ledgers (~7 days)
);
```
**How to explain this**:
> "If an entry's remaining Time-To-Live drops below 50,000 ledgers, Soroban extends it to 100,000 ledgers. This guarantees that active agreements never get archived while parties are interacting with them."

---

## 4. Explaining Token Movement & Base Units

### The Integer Invariant
- We represent token amounts strictly as signed 128-bit integers (`i128`) in base units (stroops).
- 1 XLM = $10,000,000$ stroops ($10^7$).
- Floating point numbers (`f32`, `f64`, JavaScript `number`) are strictly forbidden across contract and API boundaries.
- The SDK and API use `BigInt` and decimal strings to prevent rounding errors or fractional token loss.

### Token Transfers via SEP-41
When funding:
```rust
token_client.transfer(
    &agreement.client,
    &env.current_contract_address(),
    &milestone.amount,
);
```
When releasing:
```rust
token_client.transfer(
    &env.current_contract_address(),
    &agreement.freelancer,
    &milestone.amount,
);
```

---

## 5. Explaining Event Indexing & Deduplication

### Why not trust browser transaction hashes?
> "A browser could submit a fabricated transaction hash or a transaction that failed on-chain. Our backend treats on-chain ledger state as the only authoritative source of financial truth."

### How the Indexer Works (`apps/api/src/indexer/service.ts`)
1. **Polling**: The service polls `getEvents` from Soroban RPC with a contract filter.
2. **Resumable Cursor**: The latest RPC paging token is saved transactionally in `IndexerState.lastCursor`. If the indexer restarts, it resumes from the exact last ledger without re-scanning history.
3. **Deduplication**: Every event is assigned a stable ID (`${txHash}_${eventType}_${agreementId}_${milestoneId}`) and recorded in `ProcessedEvent`. Duplicate events are skipped idempotently.
4. **State Transition**: Upon confirmed event receipt, local milestone records transition to `FUNDED`, `RELEASED`, `REFUNDED`, or `CANCELLED`.

---

## 6. Explaining the Test Suite

MilestonePay features 31 verified automated tests across all tiers:

1. **Contract Tests (`contracts/escrow/src/test.rs` - 13 tests)**:
   - Happy paths: create $\to$ fund $\to$ release, create $\to$ fund $\to$ mutual refund.
   - Attack vectors: double release, double refund, releasing unfunded, refunding unfunded, cancelling funded.
   - Access control: unauthorized actions, non-client fund, invalid party identities (client == freelancer).
   - Multi-agreement isolation: verifying that actions on agreement 1 never affect agreement 2.
2. **SDK Tests (`packages/sdk/tests/sdk.test.ts` - 10 tests)**:
   - Operation builders for all 5 contract invocations.
   - Checksummed Stellar strkey address validation.
   - Base unit `BigInt` arithmetic without precision loss.
3. **API & Integration Tests (`apps/api/tests/api.test.ts` - 8 tests)**:
   - Challenge generation and ed25519 signature verification.
   - Replay attack prevention (re-using the same nonce is rejected with 401).
   - Corrupted signature rejection.
   - Role-based deliverable submission access control (strangers rejected with 403).
   - OpenAPI schema validity and health status.

---

## 7. Explaining the Local Setup & Verification

When showing the project to an evaluator or contributor, run these commands:

```bash
# 1. Run all smart contract tests
cd contracts/escrow
cargo test

# 2. Build contract WASM
cargo build --target wasm32-unknown-unknown --release

# 3. In monorepo root: run TypeScript checks and test suite
cd ../..
npm run typecheck
npm run test
npm run build
```
All commands pass with zero errors and zero compiler warnings!
