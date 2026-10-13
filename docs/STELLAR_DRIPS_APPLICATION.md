# Draft Application: Stellar Drips Wave Program

> **Notice**: This document is a candidate project application draft prepared by the MilestonePay open-source maintainer. It represents current development status, working features, and roadmap goals. It does not claim approval, pre-selection, eligibility, audits, or guaranteed grant acceptance.

---

## 1. Project Overview & Mission

- **Project Name**: MilestonePay
- **Repository**: `https://github.com/oaks-labs/milestone-pay`
- **Primary Category**: Developer Tools, Real-World Payments, Smart Contract Infrastructure
- **Target Audience**: Independent developers, creative freelancers, open-source maintainers, and small agencies conducting milestone-based contracting on Stellar.

MilestonePay provides a trust-minimized milestone escrow solution running natively on Stellar Soroban. Rather than using blockchain purely as an off-chain authentication layer or decorative payment receipt, MilestonePay uses Soroban smart contracts as the authoritative custody and settlement engine. Funds are locked in contract escrow, tied to immutable agreement parameters, and released strictly upon explicit cryptographic approval or refunded through mutual agreement.

---

## 2. Stellar Relevance & Native Soroban Design

MilestonePay relies directly on core capabilities of the Stellar network:
1. **Soroban Smart Contract Escrow**: Escrow logic is executed on-chain through a custom Rust contract utilizing Soroban SDK 21, enforcing immutable client/freelancer addresses and state-machine transitions.
2. **Stellar Asset Contract (SAC / SEP-41)**: Escrow custody integrates directly with Stellar Asset Contracts, supporting native XLM stroops without synthetic wrapped tokens.
3. **Decentralized Authorization**: Protected contract methods call `require_auth()` and `require_auth_for_args()`, guaranteeing that payments can never be diverted by intermediaries or unauthorized callers.
4. **Mutual Refund Guard**: To prevent unilateral fund seizure or ransom attacks during contract disputes, refunds require explicit dual authorization from both client and freelancer.
5. **Durable RPC Event Indexing**: Off-chain services index structured contract events (`ag_create`, `ms_fund`, `ms_rel`, `ms_ref`, `ms_canc`) via Soroban RPC `getEvents`, ensuring the local database mirrors confirmed on-chain ledger state.

---

## 3. Current Working Implementation (Verified MVP)

The codebase has completed an end-to-end working single-milestone vertical slice:

- **Smart Contract (`contracts/escrow`)**:
  - Implemented in Rust with Soroban SDK 21.
  - Passes 13 automated unit and integration tests covering:
    - Successful agreement creation, funding, and release.
    - Mutual refund requiring dual cryptographic signatures.
    - Double-release and double-refund prevention.
    - Zero/negative amount and invalid party checks.
    - Cross-agreement isolation and milestone cancellation.
  - Successfully compiles to optimized bytecode (`milestone_escrow.wasm`, ~20 KB) targeting `wasm32-unknown-unknown`.
- **SDK (`packages/sdk`)**:
  - Typed TypeScript client generating transaction operations (`create_agreement`, `fund_milestone`, `release_milestone`, `refund_milestone`, `cancel_milestone`).
  - RPC event parsing and pagination helper.
  - Passes 10 unit tests for operation generation, address validation, and BigInt base unit conversions.
- **Backend & Indexer (`apps/api`)**:
  - Express TypeScript API with OpenAPI 3.0 specification.
  - ed25519 cryptographic challenge generation and verification (single-use, expiring nonces).
  - Durable event indexing service tracking RPC cursors and deduplicating events.
  - Passes 8 integration tests.
- **Frontend (`apps/web`)**:
  - Next.js 15 application with Tailwind CSS.
  - Stellar Testnet warning banners, wallet connection handling, project creation modal, interactive milestone status cards, and transaction receipt explorer links.

---

## 4. Contributor Opportunities & Ecosystem Value

To foster active community involvement, MilestonePay provides a structured backlog of 14 genuine contributor issues covering:
- Expanding the single-milestone contract into multi-milestone workflows.
- Integration of verified testnet and mainnet USDC SAC configurations.
- Multi-signature mutual-refund signing user interfaces.
- Indexer recovery and RPC re-sync CLI tooling.
- Property-based testing with `proptest` for contract invariants.
- Payment export tools and enhanced WCAG 2.1 accessibility auditing.

---

## 5. Maintenance & Sustainability Plan

As project maintainer, I commit to:
1. **Transparent Maintenance**: Regularly triaging issues, reviewing community pull requests according to our `MAINTAINER_GUIDE.md`, and enforcing contract invariants.
2. **Continuous Integration**: Maintaining strict CI pipelines in GitHub Actions covering contract tests, TypeScript typechecks, linting, and unit/integration tests on every commit.
3. **Security First**: Maintaining an explicit vulnerability disclosure process (`SECURITY.md`) and keeping zero administrator backdoors.
4. **Documentation & Education**: Providing architectural diagrams, state-machine specifications, and setup instructions so newcomers can inspect, run, and contribute to MilestonePay with zero friction.
