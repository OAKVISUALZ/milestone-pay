# MilestonePay Threat Model & Security Analysis

## 1. STRIDE Analysis

| Threat Category | Potential Attack Vector | Mitigation in MilestonePay |
| :--- | :--- | :--- |
| **Spoofing** | Attacker calls `release_milestone` or `refund_milestone` posing as client or freelancer. | Soroban cryptographically checks caller identity with `require_auth()` and `require_auth_for_args()`. Off-chain API uses ed25519 challenge signatures bound to domain, nonce, and network passphrase. |
| **Tampering** | Off-chain API receives a spoofed deliverable or fabricated transaction hash. | Backend treats on-chain state as authoritative. Off-chain deliverable cannot move funds. Transaction hashes are never trusted without RPC verification or confirmed event indexing. |
| **Repudiation** | Client claims they never released payment, or freelancer claims they never agreed to a mutual refund. | Stellar transactions are irrevocably signed by account keypairs and permanently included in the blockchain ledger with cryptographic receipts and structured events. |
| **Information Disclosure** | Leakage of private user keys or sensitive contract variables. | The backend never holds, generates, or requests user signing keys. All transaction signing occurs client-side in the user's wallet. Smart contract data is public by design. |
| **Denial of Service** | State archival due to expired TTL, or gas exhaustion. | State TTLs are explicitly renewed on every invocation with generous ledger horizons (50,000 threshold, 100,000 extend). Contract logic is $O(1)$ without unbounded loops. |
| **Elevation of Privilege** | Reentrancy or unauthorized admin draining. | There is NO admin withdrawal or upgrade backdoor. Token transfers occur via verified SAC / SEP-41 standard interface. State mutations occur before external calls where applicable, preventing reentrancy. |

## 2. Invariant & Vulnerability Matrix

### 2.1 Double Release / Double Refund Attack
- **Risk**: An attacker submits concurrent or subsequent `release_milestone` calls to extract double the escrowed funds.
- **Defense**: State transition checks verify `milestone.status == MilestoneStatus::Funded`. As part of the release transaction, `milestone.status` is set to `MilestoneStatus::Released` before or atomically during the state commitment. Subsequent calls fail with `Error::AlreadyReleased` or `Error::InvalidState`.

### 2.2 Unilateral Fund Theft (Dispute Trap)
- **Risk**: A client requests a refund without freelancer consent, or a freelancer attempts to force release.
- **Defense**: `refund_milestone` enforces dual authorization:
  ```rust
  agreement.client.require_auth();
  agreement.freelancer.require_auth();
  ```
  Neither party can unilaterally pull funds once locked. The funds remain locked in contract until either:
  1. The client authorizes release (`release_milestone`), or
  2. Both parties authorize a mutual refund (`refund_milestone`).

### 2.3 Wrong Token / Cross-Contract Contamination
- **Risk**: Client funds with a worthless mock token or alters token contract between funding and release.
- **Defense**: The token contract address is immutable inside the `Agreement` struct stored at agreement creation. All transfers (`fund`, `release`, `refund`) exclusively invoke the token address recorded in the agreement.

### 2.4 Replay Attacks (On-chain & Off-chain)
- **On-chain**: Soroban sequence numbers and contract auth trees prevent replay of signed transactions.
- **Off-chain**: API challenge nonces are cryptographically random, expire in 300 seconds, and are deleted immediately upon first use (single-use).
