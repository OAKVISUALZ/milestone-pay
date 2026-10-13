# Contributing to MilestonePay

Thank you for contributing to MilestonePay! We welcome pull requests, documentation improvements, issue reports, and architectural reviews.

## 1. Code of Conduct
All contributors and maintainers must abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## 2. Prerequisites
- **Node.js**: `v22.x` (or supported LTS version)
- **Rust**: `1.80+` with target `wasm32-unknown-unknown`
- **Docker & Docker Compose**: For local PostgreSQL database
- **Stellar Testnet Account**: For testnet contract interaction

To verify your environment:
```bash
node -v
npm -v
rustc --version
rustup target list --installed | grep wasm32-unknown-unknown
docker --version
```

## 3. Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/oaks-labs/milestone-pay.git
   cd milestone-pay
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Start local PostgreSQL database**:
   ```bash
   docker compose up -d
   ```

4. **Run database migrations**:
   ```bash
   npm run prisma:generate --workspace=@milestone-pay/api
   npm run prisma:migrate --workspace=@milestone-pay/api
   ```

5. **Start development services**:
   ```bash
   # In terminal 1: Start API and indexer
   npm run dev --workspace=@milestone-pay/api

   # In terminal 2: Start Next.js web application
   npm run dev --workspace=@milestone-pay/web
   ```

## 4. Testing & Verification Commands

All pull requests must pass the complete automated test suite before merging:

### 4.1 Soroban Contract Verification
```bash
cd contracts/escrow
cargo test
cargo build --target wasm32-unknown-unknown --release
```

### 4.2 Monorepo Packages and API Tests
```bash
# In repository root:
npm run test
npm run typecheck
npm run build
```

## 5. Smart Contract Design Rules
Any pull request that touches `contracts/escrow` must adhere to these invariants:
1. **No Admin Backdoors**: Never introduce unilateral withdrawal functions or admin overrides for escrowed funds.
2. **Explicit Authorization**: Always call `require_auth()` for protected actions.
3. **Mutual Refund Guard**: Any refund of funded milestone tokens must require dual authorization from **both** `client` and `freelancer`.
4. **Terminal States**: A milestone that reaches `Released`, `Refunded`, or `Cancelled` can never transition back to `Funded` or `Created`.
5. **Base Unit Integers**: Never use floating point calculations for asset quantities.
6. **TTL Management**: Always call `extend_ttl()` on persistent and instance storage keys to prevent state archival.

## 6. Pull Request Process
1. Fork the repo and create your branch from `main`: `git checkout -b feature/issue-name`.
2. Ensure all tests pass cleanly without compiler warnings.
3. Write new tests covering your changes.
4. Submit the pull request using our PR template.
