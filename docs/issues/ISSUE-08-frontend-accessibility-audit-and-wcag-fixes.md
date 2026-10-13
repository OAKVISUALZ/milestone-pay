# Issue 08: Frontend WCAG 2.1 AA Accessibility Audit & Remediation

## 1. User Problem & Expected Benefit
- **User Problem**: Users relying on screen readers or keyboard navigation may encounter focus traps in modals or insufficient color contrast in status badges.
- **Expected Benefit**: Full WCAG 2.1 AA compliance across all web views, ensuring keyboard traps, aria-live regions for transaction state changes, and high-contrast color schemes.

## 2. Current Behavior & Relevant Files
- **Current Behavior**: The UI has basic semantic tags and labels, but lacks modal focus traps and dynamic aria-live transaction feedback.
- **Relevant Files**:
  - `apps/web/src/components/CreateProjectModal.tsx`
  - `apps/web/src/components/MilestoneCard.tsx`
  - `apps/web/src/components/Header.tsx`

## 3. Proposed Scope & Non-Goals
- **In Scope**:
  - Implement focus trapping and escape-key dismissal for `CreateProjectModal`.
  - Add `aria-live="polite"` on transaction status banners.
  - Audit color contrast for badge text (ensuring $\ge 4.5:1$ ratio).
  - Add skip-to-content links.
- **Non-Goals**:
  - Redesigning overall visual theme or component layout.

## 4. Dependencies
- `@axe-core/playwright` or `axe-core` for automated auditing.

## 5. Testable Acceptance Criteria
- [ ] Tabbing through modal cycles exclusively inside modal elements until dismissed.
- [ ] Screen readers announce transaction status updates dynamically.
- [ ] Automated accessibility audit passes with 0 violations.

## 6. Required Tests
- Playwright/axe automated accessibility test suite.

## 7. Estimated Difficulty & Rationale
- **Difficulty**: Low (2/5).
- **Rationale**: Straightforward frontend improvements with substantial usability benefits.
