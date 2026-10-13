# Testnet Deployment & Contract Lifecycle Guide

## 1. Network Configuration

| Parameter | Value |
| :--- | :--- |
| **Network** | Stellar Testnet |
| **Network Passphrase** | `Test SDF Network ; September 2015` |
| **Soroban RPC URL** | `https://soroban-testnet.stellar.org` |
| **Horizon URL** | `https://horizon-testnet.stellar.org` |
| **Native Testnet XLM SAC ID** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

## 2. Deploying to Stellar Testnet

### Step 1: Fund Deployer Account
Generate or load a testnet keypair and fund it via Friendbot:
```bash
# Using Stellar CLI
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
```

Or via curl:
```bash
curl "https://friendbot.stellar.org?addr=YOUR_DEPLOYER_PUBLIC_KEY"
```

### Step 2: Build Contract WASM
```bash
cd contracts/escrow
cargo build --target wasm32-unknown-unknown --release
```
The optimized bytecode will be located at:
`contracts/escrow/target/wasm32-unknown-unknown/release/milestone_escrow.wasm`

### Step 3: Install & Deploy Contract
Install bytecode onto testnet:
```bash
stellar contract install \
  --network testnet \
  --source deployer \
  --wasm target/wasm32-unknown-unknown/release/milestone_escrow.wasm
```
*Note the returned WASM hash.*

Deploy contract instance:
```bash
stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm-hash <WASM_HASH>
```
*Note the returned Contract ID (C...).*

### Step 4: Configure Monorepo Environment
Add the deployed contract ID to your `.env`:
```env
MILESTONE_ESCROW_CONTRACT_ID="C..."
NEXT_PUBLIC_ESCROW_CONTRACT_ID="C..."
```

## 3. Interacting with the Deployed Contract via CLI

### Create Agreement
```bash
stellar contract invoke \
  --network testnet \
  --source client_identity \
  --id <CONTRACT_ID> \
  -- \
  create_agreement \
  --client <CLIENT_G_ADDRESS> \
  --freelancer <FREELANCER_G_ADDRESS> \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --milestone_amount 100000000
```

### Fund Milestone
```bash
stellar contract invoke \
  --network testnet \
  --source client_identity \
  --id <CONTRACT_ID> \
  -- \
  fund_milestone \
  --agreement_id 1 \
  --milestone_id 1
```

### Release Milestone
```bash
stellar contract invoke \
  --network testnet \
  --source client_identity \
  --id <CONTRACT_ID> \
  -- \
  release_milestone \
  --agreement_id 1 \
  --milestone_id 1
```

### Mutual Refund
*Note: Because mutual refund requires authorization from both parties, the transaction must be built, multi-signed, and submitted.*
```bash
# Build multi-auth refund envelope
stellar contract invoke \
  --network testnet \
  --source client_identity \
  --id <CONTRACT_ID> \
  -- \
  refund_milestone \
  --agreement_id 1 \
  --milestone_id 1
```

## 4. Contract Upgrade & Reset Strategy

### Immutable Contract Philosophy
In MilestonePay, **there is intentionally NO upgradeable proxy or admin key**.
If an administrative key could upgrade the contract bytecode, that key would hold ultimate control over all locked escrow funds, violating our core invariant of trust minimization.

### Protocol Migration / New Version Deployment
When launching an updated contract version (e.g. Protocol upgrade or multi-milestone v2):
1. **Deploy v2 Instance**: Deploy the new contract code to a new contract address.
2. **Deprecate v1 Creation**: Point the frontend and API project creation to v2.
3. **Graceful Settlement**: Existing v1 agreements continue operating normally until all active milestones are settled (`Released` or `Refunded`).
4. **State Archival Expiration**: Once settled, instance and persistent storage entries naturally lapse after their TTL or can be archived.
