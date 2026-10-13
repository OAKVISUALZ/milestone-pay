# Issue 06: SDK Runnable Code Examples & Developer Guides

## 1. User Problem & Expected Benefit
- **User Problem**: Developers integrating `@milestone-pay/sdk` into custom backend bots, DAOs, or CLI tools lack end-to-end runnable code examples.
- **Expected Benefit**: A dedicated `examples/` directory containing complete, standalone TypeScript scripts demonstrating:
  1. Creating and funding an agreement programmatically using Keypairs.
  2. Monitoring milestone events in real time.
  3. Releasing funds upon automated test verification.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The SDK contains unit tests, but no dedicated standalone example scripts.
- **Relevant Files**:
  - `packages/sdk/src/client.ts`
  - `packages/sdk/package.json`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add `examples/01-create-and-fund.ts`
  - Add `examples/02-listen-events.ts`
  - Add `examples/03-automated-release.ts`
  - Add comprehensive README in `examples/` explaining environment variable setup.
- **Non-Goals**:
  - Creating a separate npm package for examples.

## 4. Dependencies
- `@milestone-pay/sdk`, `tsx` for TypeScript execution.

## 5. Testable Acceptance Criteria
- [ ] Running `npx tsx examples/01-create-and-fund.ts` builds and prints simulated transaction XDR.
- [ ] Code examples are typed and pass `tsc --noEmit`.

## 6. Required Tests
- CI smoke test executing `tsx examples/*.ts` in dry-run simulation mode.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low (1/5).
- **Rationale**: Excellent onboarding task for new open-source contributors.
