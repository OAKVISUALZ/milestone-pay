# Security Policy

## 1. Supported Versions

MilestonePay security updates are released for the active development branch.

| Component | Supported Versions | Notes |
| :--- | :--- | :--- |
| Soroban Contracts (`contracts/escrow`) | `0.1.x` | Tested on Soroban SDK 21 |
| SDK (`packages/sdk`) | `0.1.x` | Current |
| API Gateway (`apps/api`) | `0.1.x` | Current |
| Web Application (`apps/web`) | `0.1.x` | Current |

## 2. Reporting a Vulnerability

We prioritize responsible security vulnerability disclosure:
- **Do NOT file a public GitHub issue** for undisclosed security vulnerabilities.
- Please email the core maintainers at: `security@milestonepay.org` (or open a Private Vulnerability Advisory on GitHub).
- Include detailed reproduction steps, network assumptions, Soroban contract addresses, and a minimal proof-of-concept (POC) where applicable.

### Response SLA
- **Initial Acknowledgment**: Within 48 hours.
- **Triage & Assessment**: Within 5 business days.
- **Remediation & Patch Release**: Dependent on severity, typically within 14 business days.

## 3. Threat Model & Security Posture
- **No Custodial Keys**: MilestonePay servers never accept, store, or transmit client or freelancer private keys.
- **Cryptographic Challenges**: All off-chain metadata modifications require ed25519 wallet challenge signatures bound to domain, nonce, and network passphrase.
- **Immutable On-Chain Contracts**: The escrow contract contains no backdoor administrator key or unilateral drain functions. Disputed funds remain locked in escrow until mutual agreement is reached.
