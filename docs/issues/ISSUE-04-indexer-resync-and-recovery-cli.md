# Issue 04: Indexer Re-sync & Disaster Recovery Tooling

## 1. User Problem & Expected Benefit
- **User Problem**: If the indexer service experiences an unrecoverable database loss or ledger sequence gap during extended RPC node downtime, maintainers need a reliable way to replay contract events from any target ledger sequence.
- **Expected Benefit**: A dedicated CLI script (`npm run indexer:resync`) allowing maintainers to reset the cursor, purge orphan events, and rebuild the off-chain state directly from authoritative Soroban events.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The indexer relies exclusively on the persisted `IndexerState.lastCursor` in PostgreSQL without manual override or rewind flags.
- **Relevant Files**:
  - `apps/api/src/indexer/service.ts`
  - `apps/api/src/db/client.ts`
  - `apps/api/package.json`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add CLI arguments: `--from-ledger <number>`, `--reset-cursor`, `--dry-run`.
  - Validate that replayed events are processed idempotently without duplicating financial state.
  - Provide a sanity check reporting database agreement counts versus on-chain contract `get_agreement_count`.
- **Non-Goals**:
  - Modifying on-chain state or re-submitting transactions.

## 4. Dependencies
- `@milestone-pay/sdk`, `commander` or native `process.argv` parsing.

## 5. Testable Acceptance Criteria
- [ ] Running `npm run indexer:resync -- --from-ledger 1000` replays all events starting from ledger 1000.
- [ ] Orphan or duplicate events do not create conflicting records in `ProcessedEvent`.
- [ ] Verification script prints summary of reconciled agreements and milestones.

## 6. Required Tests
- Integration tests in `apps/api` validating indexer rewind and replay against mock events.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium (3/5).
- **Rationale**: Straightforward CLI scripting, but requires strict validation of state transitions during historical event replay.
