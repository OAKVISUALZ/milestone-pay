# MilestonePay Contract State Machine

## 1. State Model

Every Milestone within an Agreement is tracked as an individual state machine.

### Milestone Lifecycle States
1. `Created` (0): The milestone exists with a specified amount, but funds have not yet been transferred into the contract.
2. `Funded` (1): The client has deposited the specified amount of the agreed token into the contract. Escrow holds the tokens.
3. `Released` (2): The client has approved deliverable release. The contract transferred `amount` tokens to the freelancer. This is a terminal state.
4. `Refunded` (3): Both client and freelancer authorized a refund. The contract transferred `amount` tokens back to the client. This is a terminal state.
5. `Cancelled` (4): The client cancelled an unfunded milestone. No tokens were moved. This is a terminal state.

## 2. State Transition Table

| Current State | Invocation | Required Authorization | Preconditions | Next State | Token Movement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| *(None)* | `create_agreement` | `client` | `client != freelancer`, `amount > 0` | `Created` (or `Funded` if funded on create) | Optional deposit |
| `Created` | `fund_milestone` | `client` | Caller balance $\ge$ `amount` | `Funded` | Client $\to$ Contract (`amount`) |
| `Created` | `cancel_milestone` | `client` | Milestone is unfunded | `Cancelled` | None |
| `Funded` | `release_milestone` | `client` | Contract balance $\ge$ `amount` | `Released` | Contract $\to$ Freelancer (`amount`) |
| `Funded` | `refund_milestone` | `client` **AND** `freelancer` | Contract balance $\ge$ `amount` | `Refunded` | Contract $\to$ Client (`amount`) |
| `Released` | *Any* | — | — | **REJECTED** | None |
| `Refunded` | *Any* | — | — | **REJECTED** | None |
| `Cancelled` | *Any* | — | — | **REJECTED** | None |

## 3. Invariants
1. **Immutable Parties**: Once created, an agreement's `client`, `freelancer`, and `token` can never be altered.
2. **Strict Destination**:
   - `release_milestone` MUST only transfer tokens to `agreement.freelancer`.
   - `refund_milestone` MUST only transfer tokens to `agreement.client`.
3. **No Terminal Mutation**: Once a milestone reaches `Released`, `Refunded`, or `Cancelled`, its state is immutable and can never transition back to `Funded` or `Created`.
4. **Mutual Refund Guard**: Disputed funds cannot be unilaterally refunded. Authorization from both `client` AND `freelancer` must be present in the transaction envelope.
5. **No Double Release or Refund**: A milestone cannot be released or refunded more than once.
6. **Balance Parity**: The total tokens held in contract escrow for an agreement equals the sum of amounts of all currently `Funded` milestones.
7. **Positive Quantities**: Milestone amounts must be strictly $> 0$ and fit within positive signed 128-bit integers (`i128`).
8. **Explicit TTL Extension**: Persistent data keys for agreement and milestones are refreshed on every interaction with explicit threshold and extension ledger limits.
9. **No Admin Privileges**: The contract has no backdoor admin key, pausable drain function, or upgrade proxy that can divert funds.

## 4. Emitted Events

1. `agreement_created`:
   - Topics: `(symbol_short!("ag_create"), agreement_id)`
   - Data: `(client, freelancer, token, milestone_count)`
2. `milestone_funded`:
   - Topics: `(symbol_short!("ms_fund"), agreement_id, milestone_id)`
   - Data: `amount`
3. `milestone_released`:
   - Topics: `(symbol_short!("ms_rel"), agreement_id, milestone_id)`
   - Data: `(freelancer, amount)`
4. `milestone_refunded`:
   - Topics: `(symbol_short!("ms_ref"), agreement_id, milestone_id)`
   - Data: `(client, amount)`
5. `milestone_cancelled`:
   - Topics: `(symbol_short!("ms_canc"), agreement_id, milestone_id)`
   - Data: `0i128`
