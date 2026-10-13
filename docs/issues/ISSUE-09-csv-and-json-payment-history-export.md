# Issue 09: Payment History & Accounting Export (CSV / JSON)

## 1. User Problem & Expected Benefit
- **User Problem**: Freelancers and clients need transaction records for tax compliance, accounting, and dispute documentation.
- **Expected Benefit**: A 1-click export button in the dashboard generating CSV and JSON reports containing project names, milestone indices, amounts (XLM & stroops), confirmed transaction hashes, ledger numbers, and timestamps.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: Transaction hashes are displayed as links on individual cards, with no bulk export capability.
- **Relevant Files**:
  - `apps/web/src/app/page.tsx`
  - `apps/api/src/routes/projects.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - API endpoint `GET /api/projects/export?format=csv&address=<G...>`
  - Client-side CSV/JSON download button with date filters.
  - Formatted columns: Date, Project Title, Milestone #, Role (Client/Freelancer), Amount XLM, Transaction Hash, Explorer Link.
- **Non-Goals**:
  - Invoicing or fiat currency valuation integration.

## 4. Dependencies
- `csv-stringify` or native format generator.

## 5. Testable Acceptance Criteria
- [ ] Export endpoint returns valid CSV file with correct headers and data.
- [ ] Only transactions involving the authenticated address are exported.

## 6. Required Tests
- API test verifying CSV formatting and participant data isolation.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low (2/5).
- **Rationale**: Simple data aggregation and serialization feature.
