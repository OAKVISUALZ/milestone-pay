# Issue 02: Verified Testnet and Mainnet USDC Support

## 1. User Problem & Expected Benefit
- **User Problem**: Freelancers often prefer stable assets like USDC to avoid cryptocurrency market volatility during long development milestones. Currently, MilestonePay defaults exclusively to native XLM on testnet.
- **Expected Benefit**: Users can select verified USDC (Stellar Asset Contract) during project creation, seeing accurate decimal formatting (7 decimals) and asset warnings.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The system hardcodes `TESTNET_XLM_SAC_CONTRACT_ID`. Any arbitrary contract address could be supplied without verification.
- **Relevant Files**:
  - `packages/shared/src/index.ts`
  - `packages/sdk/src/client.ts`
  - `apps/web/src/components/CreateProjectModal.tsx`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add verified token whitelist mapping for Testnet USDC (`C...`) and Mainnet Circle USDC.
  - Display asset logo, decimals (7), and issuer account metadata in UI.
  - Disallow unverified custom tokens without explicit advanced user confirmation.
- **Non-Goals**:
  - Cross-asset path payments or automatic DEX swaps inside the escrow contract.

## 4. Dependencies
- Official Circle / SDF testnet USDC asset contract addresses.

## 5. Testable Acceptance Criteria
- [ ] UI displays asset dropdown containing XLM and Verified Testnet USDC.
- [ ] Selecting USDC automatically populates verified token contract ID.
- [ ] Amount conversions format 7 decimals correctly.
- [ ] Contract successfully escrows and releases SAC USDC tokens in test environment.

## 6. Required Tests
- Unit test in `packages/shared` verifying token whitelist definitions and decimals.
- Contract test using mock asset contract configured as USDC.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low (2/5).
- **Rationale**: The smart contract already supports generic SEP-41 token addresses; the primary work is token whitelisting, verification, and UI selection logic.
