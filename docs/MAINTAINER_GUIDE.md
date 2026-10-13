# MilestonePay Maintainer Guide

## 1. Role & Purpose
As a maintainer of MilestonePay, your responsibility is to ensure the software remains secure, maintainable, reproducible, and faithful to its open-source mission in the Stellar ecosystem.

## 2. Issue Triage Workflow
- **Labeling**: Every issue must receive at least one component label (`contract`, `sdk`, `api`, `web`, `docs`) and one type label (`bug`, `enhancement`, `security`, `question`).
- **Good First Issue**: Mark isolated, well-scoped tasks (e.g., UI accessibility enhancements, documentation expansions, test fixtures) with `good-first-issue` to onboard new contributors.
- **Reproducibility Requirement**: Reject or request clarification on bug reports that do not include steps to reproduce or Stellar testnet transaction hashes.

## 3. Pull Request Review Checklist
Before approving any pull request:
1. **Automated Verification**:
   - `cargo test` in `contracts/escrow` passes with 0 warnings.
   - `npm run typecheck` and `npm run test` pass with 0 errors across all workspaces.
   - `npm run build` succeeds.
2. **Contract Invariant Verification**:
   - Verify that NO unauthorized withdrawal mechanism is added.
   - Verify that token amounts remain represented strictly in base unit integers (`i128`).
   - Check that `extend_ttl` is maintained on modified storage entries.
   - Verify that mutual refund requires BOTH parties' auth.
3. **Backend & Security Verification**:
   - Verify that the backend NEVER accepts, generates, or transmits private keys.
   - Ensure off-chain state transitions do not pretend to settle payments before on-chain confirmation.
   - Ensure all API inputs are validated through Zod schemas.

## 4. Release Process
1. **Versioning**: Follow Semantic Versioning (`MAJOR.MINOR.PATCH`).
2. **Tagging**:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v0.1.0 -m "Release v0.1.0: MilestonePay MVP"
   git push origin v0.1.0
   ```
3. **Changelog**: Compile release notes detailing contract changes, SDK updates, breaking API changes, and contributor acknowledgments.

## 5. Incident Response Runbooks

### Runbook A: Soroban RPC Outage / Rate Limiting
- **Symptom**: Indexer logs show `RPC error fetching events: 429 Too Many Requests` or connection timeouts.
- **Action**:
  1. The IndexerService maintains durable state in `IndexerState`. It will automatically resume from `lastCursor` when connectivity returns.
  2. Increase `INDEXER_POLL_INTERVAL_MS` from 5000ms to 15000ms in `.env` if rate limits persist.
  3. Switch to a fallback RPC provider or self-hosted RPC instance via `STELLAR_RPC_URL`.

### Runbook B: State Discrepancy (Database vs Blockchain)
- **Symptom**: Database shows milestone as `FUNDED` while contract has already been `RELEASED` due to indexer lag.
- **Action**:
  1. Inspect the contract directly using Soroban CLI: `stellar contract invoke --id <CONTRACT_ID> -- get_milestone --agreement_id <ID> --milestone_id <ID>`.
  2. The smart contract state is ALWAYS authoritative.
  3. Replay indexer from specific ledger or trigger reconciliation query.
