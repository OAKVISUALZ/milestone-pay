# MilestonePay Release-Readiness Review & Testnet Audit Report

## Executive Summary
This report documents the verification results of the **MilestonePay** freelance escrow system on Stellar Soroban. Every claim in this report is grounded in executable source code, passing automated test suites, or confirmed on-chain transactions on Stellar Testnet.

No claims of formal third-party audit, mainnet deployment, or compliance certification are made. MilestonePay is ready for **public Stellar Testnet** deployment. Mainnet deployment remains strictly blocked pending a formal external security audit.

---

## 1. Grounding & Claims Rectification

| Previous Claim / Term | Verified Reality | Code / Doc Location |
| :--- | :--- | :--- |
| **"Production-Grade Security"** | **Experimental Pre-Audit Escrow**: Trust-minimized Soroban smart contract with testnet validation. Not audited by third-party security firms. | [`README.md`](./README.md), [`SECURITY.md`](./SECURITY.md) |
| **"SEP-10 Compliant Authentication"** | **Custom Signed-Message Challenge**: Ed25519 challenge message signed via `signMessage()`. SEP-10 requires server signing keys and `ManageData` ops on Horizon; MilestonePay uses a domain-bound client challenge without requiring a backend signer. | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`apps/api/src/routes/auth.ts`](./apps/api/src/routes/auth.ts) |
| **"prisma generate migrations"** | **Committed SQL Migration Required**: `prisma generate` merely generates the JS client. Real migrations require `prisma migrate deploy` using committed SQL migration files. | [`apps/api/prisma/migrations/20261012000000_init/migration.sql`](./apps/api/prisma/migrations/20261012000000_init/migration.sql) |
| **"DDoS & Brute Force Protection"** | **Application-Layer Rate Limiting**: In-memory sliding-window limiter (10 req/min/IP) and 50 KB body cap. Mitigates accidental abuse; does not defend against distributed Layer 7 DDoS attacks without CDN/WAF. | [`apps/api/src/middleware/rateLimit.ts`](./apps/api/src/middleware/rateLimit.ts) |

---

## 2. On-Chain Authoritative State Architecture

1. **State Ownership**:
   - Escrow financial transitions (`CREATED` $\to$ `FUNDED` $\to$ `RELEASED` / `REFUNDED` / `CANCELLED`) are **never** updated via client REST submissions.
   - The API server rejects any client attempts to update milestone financial status.
2. **Indexer Authority**:
   - `IndexerService` polls Soroban RPC `getEvents` filtered by contract ID and topic.
   - Transitions occur only after the contract emits structured events (`ag_create`, `ms_fund`, `ms_rel`, `ms_ref`, `ms_canc`).
   - Event IDs are persisted in `IndexedEvent` for deduplication across restarts.
3. **Off-Chain Deliverable Decoupling**:
   - Deliverables submitted via the API (`POST /projects/:id/milestones/:mId/deliverable`) only attach metadata (`deliverableUrl`, `deliverableHash`, notes). They do not alter escrow state and cannot release funds.

---

## 3. Storage Archival, TTL Extension & Inactivity Recovery

Soroban state archiving archives persistent contract storage entries whose Time-To-Live (TTL) reaches zero.
- **Contract Design**:
  - `AgreementCount`, `Agreement`, and `Milestone` records reside in **persistent storage**.
  - Every contract interaction (`create_agreement`, `fund_milestone`, `release_milestone`, `refund_milestone`, `cancel_milestone`, `get_agreement`, `get_milestone`) automatically calls `extend_ttl(&key, 50_000, 100_000)`, extending remaining life to 100,000 ledgers (~5.8 days) whenever it drops below 50,000 ledgers.
- **Tested Behavior (`test_storage_ttl_extension_across_ledger_advancement`)**:
  - Tested advancing ledger sequence numbers by 60,000 ledgers.
  - Verified that persistent storage TTL decayed from 100,000 to 40,000 ledgers.
  - Verified that calling read access (`get_agreement`, `get_milestone`) renewed the TTL back to 100,000 ledgers.
- **Inactive Entry Restoration**:
  - If a project sits abandoned past 100,000 ledgers without any reads or writes, its persistent entries become archived.
  - Recovery requires submitting a Stellar `RestoreFootprintOp` specifying the archived persistent storage keys, restoring the ledger entry prior to invocation.

---

## 4. Multi-Party Mutual Refund Coordination (API & Frontend)

Mutual refunds require the cryptographic authorization of **both** the client and the freelancer.
- **In-Browser Coordination Protocol**:
  - The API coordinate mutual refunds without requiring participants to manually exchange XDR out-of-band:
    - `POST /api/projects/:projectId/milestones/:milestoneId/refund/propose`: Proposer signs the envelope and submits it to the API.
    - `GET /api/projects/:projectId/milestones/:milestoneId/refund`: Counter-party inspects proposal terms, amount, and recipient.
    - `POST /api/projects/:projectId/milestones/:milestoneId/refund/sign`: Counter-party counter-signs the envelope. Rejects any alteration where transaction hash differs from original proposal.
    - `POST /api/projects/:projectId/milestones/:milestoneId/refund/submit`: Submits the co-signed envelope to Soroban RPC while preserving original transaction hash.
    - `POST /api/projects/:projectId/milestones/:milestoneId/refund/recheck`: Handles confirmation timeouts as unknown outcomes, allowing safe status rechecks.
- **Runnable SDK Demonstration**: `npm run example:mutual-refund --workspace=@milestone-pay/sdk`
  - Both client and freelancer Ed25519 signatures cryptographically verified on the envelope hash.
- **Live Testnet Flow**: Confirmed on-chain using Soroban authorization entries signed by both keypairs.

---

## 5. Live Stellar Testnet Validation Evidence

Executed via `scripts/testnet-validate.ts` on live Stellar Testnet:
- **Network Passphrase**: `Test SDF Network ; September 2015`
- **Soroban RPC**: `https://soroban-testnet.stellar.org`
- **Native XLM SAC ID**: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Contract Bytecode Hash**: `b785318ed7309e3d802ffb7bb656610ccd87250884da965bf0937caf54b6b281`
- **WASM Upload TX**: `95ef00a2606d79bcce546f704344c11639456e1a6fedb0143214dc1db87460fa`
- **Contract Instance Deploy TX**: `a0e7e80e4efe80d539638dd0099b590cd8e36ea4446916c8f9b87e0de2cc783a`
- **Confirmed Contract ID**: `CB2PHGNBGYOCX2ELVI2PH2YMGIXN4JA2ORMTKZ63VGFCXS5DCL2BEZXH`

### Flow 1: Create $\to$ Fund $\to$ Release (25 XLM / 250,000,000 stroops)
- **Client**: `GDIK5CLWH7UZULU4DAEZZDVWK656NUHTW3ONYTNHDOYXPRB5UOB3SJYE`
- **Freelancer**: `GCQ7QUXQGQRKXXINFUEYXGB4QDBGOP2BSKDKGCKFRIBFJ3JHKWYWJ3E4`
- **Balances Before**: Client = 99,999.813785 XLM, Freelancer = 100,000.000000 XLM, Escrow = 0 XLM
- **Transactions**:
  - `create_agreement(#1)`: `58bd433c907c074e74d79754707a4c3fdd9937da8ef6577d1f04b507343d01d3`
  - `fund_milestone(#1)`: `16521085fb81c53b682973d30672ea72a03fc46a27d5be06b6dc1ad01da065de` (Escrow held 250,000,000 stroops)
  - `release_milestone(#1)`: `3edd60c30ddeab7a36e44f8d8154c1f2a98012096c52ff3ce372ae26271f469a`
- **Balances After**: Freelancer = 100,250.000000 XLM (**+25.000000 XLM**), Escrow = 0 XLM

### Flow 2: Create $\to$ Fund $\to$ Mutual Refund (15 XLM / 150,000,000 stroops)
- **Transactions**:
  - `create_agreement(#2)`: `b1bacb403b3f7d2c7a99c5751505a0a630bac4836cd9dd3f3e4670319944b2f5`
  - `fund_milestone(#2)`: `558ec432e8192b31b37c08d026adb70ebf9c670173e6444389d34c5b54660c8e`
  - `refund_milestone(#2)`: `a0136e10b2917a880b14cb6204eab31f203430de7bd3548cdeaa78432aa0b2e5` (Co-signed with client and freelancer credentials)
- **Balances After**: Escrow balance returned to 0 XLM, Client balance restored.

### Flow 3: Unfunded Cancellation
- **Transactions**:
  - `create_agreement(#3)`: `137e00b912463db1cca510262ea856b82e5ef243b8fff89251429499a53b287d`
  - `cancel_milestone(#3)`: `24909b27b48f7db1930ac84ad38847e37d96721ccb3109bc9fa8c4fae0195230`

### Flow 4: Terminal-State and Unauthorized Rejections
- **4a. Double Release (#1)**: Rejected with `HostError: Error(Contract, #1)` (`InvalidState`).
- **4b. Double Refund (#2)**: Rejected with `HostError: Error(Contract, #1)` (`InvalidState`).
- **4c. Fund Cancelled Milestone (#3)**: Rejected with `HostError: Error(Contract, #1)` (`InvalidState`).
- **4d. Unauthorized Release by Attacker**:
  - Created & funded Agreement #4: `fbf608056ab1f920c9a941b9b60764160e7787914b1ea32750bc4e5eb532eea1`, `3c737d8f62abed3a08db3c193296d1329bf93b5216334cc9cad98596f4d57c5f`.
  - Attacker `GCBODAKPJVGMZHTFEIA42QSU6DFYW2LX7SP272NRXAN2ARCNBFAV3HRE` attempted release.
  - Rejected: Soroban Host required authorization from `GDIK5CLWH7UZULU4DAEZZDVWK656NUHTW3ONYTNHDOYXPRB5UOB3SJYE` (Client); attacker signature was rejected by host auth validation.

---

## 6. Monorepo Verification Summary

| Suite / Check | Command | Result |
| :--- | :--- | :--- |
| **Escrow Contract Tests** | `cargo test --locked` | **15 passed, 0 failed** (includes TTL extension & state machine invariant tests) |
| **WASM Build** | `cargo build --target wasm32v1-none --release --locked` | **Zero warnings**, 21,236 bytes |
| **Typecheck** | `npm run typecheck` | **4/4 workspaces passed** (`sdk`, `shared`, `api`, `web`) |
| **SDK Unit Tests** | `npm test --workspace=@milestone-pay/sdk` | **10 passed, 0 failed** |
| **API Unit & Coordination Tests** | `npm test --workspace=@milestone-pay/api` | **16 passed, 0 failed** (atomic replays, rate limits, size caps, refund coordination) |
| **PostgreSQL Integration Tests** | `npm run test:db --workspace=@milestone-pay/api` | **3 passed, 0 failed** (concurrent row lock replay, foreign keys, indexer recovery) |
| **Web Browser Tests** | `npm test --workspace=@milestone-pay/web` | **12 passed, 0 failed** (wallet switch, network check, refresh recovery, mutual refund modal) |
| **SDK Runnable Example**| `npm run example:mutual-refund --workspace=@milestone-pay/sdk` | **Passed**, dual Ed25519 signature verification |
| **Next.js & Monorepo Build** | `npm run build` | **4/4 workspaces built successfully** |

---

## 7. Known Blockers & Production Readiness Checklist

### Current Blockers for Live Production Deploy
- [ ] **Mainnet Security Audit**: The Soroban smart contract is pre-audit software. Mainnet deployment is strictly blocked until an external security audit is completed.
- [ ] **Edge Network DDoS Protection**: Current rate limiting operates at the Node.js application layer. Production requires an external reverse proxy (Cloudflare/Cloud Armor) for Layer 7 volumetric mitigation.

### Testnet Launch Checklist
- [x] Lockfile integrity verified with `npm ci` and `cargo --locked`.
- [x] Compilation verified against `wasm32v1-none` target (no `reference-types` incompatibility).
- [x] Expiring ed25519 challenge auth with atomic single-use nonce consumption.
- [x] Rate limiting (10 req/min/IP) and body size caps (50 KB).
- [x] Resumable cursor-based indexer with event deduplication.
- [x] Live Testnet deployment and validation with verified transaction hashes.
- [x] Storage TTL decay and renewal tested across ledger advancement.
- [x] Real PostgreSQL integration tests running with committed SQL migrations.
- [x] In-browser mutual refund coordination workflow implemented and tested.
- [x] CI workflow configured with PostgreSQL database service and automated checks.
- [x] All documentation updated with verified claims and clear boundary notices.
