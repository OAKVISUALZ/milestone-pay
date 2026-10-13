# MilestonePay Product Specification

## 1. Problem Statement
Freelancers and clients often face transactional uncertainty:
- Clients hesitate to pay upfront before deliverables are verified.
- Freelancers worry about working on deliverables without guaranteed funds deposited.
- Traditional escrow services charge heavy fees (up to 20%), require slow banking rails, and rely on centralized black-box dispute intermediaries.

## 2. Solution: MilestonePay
MilestonePay provides trust-minimized, milestone-based escrow on Stellar Soroban:
1. **Agreement Formulation**: Client creates a project agreement naming the freelancer address and an allowed payment asset (e.g., native XLM on testnet).
2. **Escrow Funding**: Client locks the exact milestone amount in the Soroban escrow contract.
3. **Off-Chain Deliverable Proof**: Freelancer submits a deliverable reference (URL, Git commit/PR hash, IPFS CID, and notes) to the off-chain application. This reference is purely informational and cannot trigger fund release independently.
4. **Client Approval & Settlement**: The client reviews the deliverable and signs an on-chain `release_milestone` transaction.
5. **Direct Settlement**: The Soroban escrow contract transfers the escrowed tokens directly to the immutable freelancer address.
6. **Mutual Refund Guard**: Disputed funds cannot be unilaterally withdrawn by either party. A refund requires explicit authorization from **both** client and freelancer (`refund_milestone`). If agreement is not reached, funds remain safely locked until mutual accord.

## 3. Explicit Boundaries & Limitations
- **No Unilateral Administrator Withdrawal**: There is no back-door admin key that can seize or redirect funds.
- **No Automatic Deadline Release in MVP**: Deadlines do not trigger automated transfers; explicit cryptographic authorization is required.
- **Dispute Boundary**: The smart contract does not make subjective arbitrations. In a dispute, funds remain in escrow unless both parties sign a mutual refund. The UI prominently displays this rule.

## 4. Canonical Network & Asset Configuration
- **Network**: Stellar Testnet (`Test SDF Network ; September 2015`)
- **Soroban RPC URL**: `https://soroban-testnet.stellar.org`
- **Horizon URL**: `https://horizon-testnet.stellar.org`
- **Native Testnet XLM Contract ID**: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Base Unit Representation**: All token amounts are represented in base units (stroops: 1 XLM = 10,000,000 stroops = $10^7$ base units). Floats are forbidden across API and contract boundaries.

## 5. Reference Documentation
- Stellar Developer Docs: https://developers.stellar.org/docs
- Soroban SDK: https://docs.rs/soroban-sdk/latest/soroban_sdk/
- State Archival & TTL: https://developers.stellar.org/docs/smart-contracts/storing-data/state-archival
- Authorization Guide: https://developers.stellar.org/docs/smart-contracts/security-best-practices/authorization
- Token Transfers (SEP-41): https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Soroban RPC `getEvents`: https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents
- Stellar Wallets Kit: https://developers.stellar.org/docs/smart-contracts/wallets/connecting-wallets
- SEP-0010 Stellar Web Auth: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
