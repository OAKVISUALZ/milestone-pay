# Issue 11: Database Indexing & Pagination Performance Benchmarks

## 1. User Problem & Expected Benefit
- **User Problem**: As the number of agreements and events grows into the tens of thousands, un-indexed queries on `ProcessedEvent` and `Project` could degrade API response times.
- **Expected Benefit**: Measured database indexing, composite index optimization, and benchmarked pagination ensuring API response times remain under 25ms at 100,000 rows.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: Basic single-column indexes exist in `schema.prisma`. No stress testing has been run.
- **Relevant Files**:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/src/routes/projects.ts`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Add composite indexes: `@@index([clientAddress, createdAt])`, `@@index([freelancerAddress, createdAt])`.
  - Benchmark script generating 50,000 synthetic projects and milestones.
  - Query execution plan analysis (`EXPLAIN ANALYZE`).
- **Non-Goals**:
  - Database sharding or multi-region replication.

## 4. Dependencies
- PostgreSQL 16 `EXPLAIN ANALYZE`.

## 5. Testable Acceptance Criteria
- [ ] Benchmark demonstrates `GET /api/projects?address=...` executes under 25ms with 100k rows.
- [ ] Query plans verify index scans instead of sequential scans.

## 6. Required Tests
- Benchmark test script in `apps/api/benchmarks/query.bench.ts`.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Medium (3/5).
- **Rationale**: Standard SQL optimization requiring data generation tooling.
