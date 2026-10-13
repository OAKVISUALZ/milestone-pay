## Description
Briefly describe the change and motivation. Reference any related issue (e.g. `Fixes #12`).

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Smart Contract update (Soroban escrow logic or event schema)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Verification Checklist
- [ ] `cargo test` in `contracts/escrow` passes cleanly with zero warnings
- [ ] `cargo build --target wasm32-unknown-unknown --release` succeeds
- [ ] `npm run typecheck` passes across all monorepo workspaces
- [ ] `npm run test` passes across all monorepo workspaces
- [ ] Contract invariants are preserved (no unilateral admin withdrawal, mutual refund guard intact)
- [ ] New unit or integration tests added covering modified paths
