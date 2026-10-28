# Reservation lookup implementation plan

Goal: Search the customer-facing five-character group code and present authorized appointments in a modal; redesign operational cards from the approved screenshot.

Approved design: Group reference shared by participants; independent appointment states/actions; historical appointments included; collisions remain separate groups; no financial writes or deployment.

- [x] Backend: parameterized, scope-restricted code lookup; validate five alphanumeric characters; preserve existing operational queries and state transitions. HTTP tests for malformed input, authorization, collisions and history. Verify the SQL hash matches the existing JS group code.
- [x] Frontend: reuse buildBookingShortCode for group labels, shared card rendering, code in table/detail, separate modal search with loading/error/empty states and cancellation. Tests for group identity, missing group, collisions, and existing actions.
- [x] Verify focused suites, full suites, lint/build, responsive themes. Commit and push feature branches only. No merge/deployment.

Ruling: Native execution in this session; preserve dirty backend via isolated worktree. No schema migration or QA writes. Search ignores board date/state filters but always enforces branch and barber authorization. Limit oversized results explicitly rather than silently omitting members.

Evidence: backend 2631 passed, 0 failed, 7 opt-in skipped; focused HTTP/service 10 passed. PostgreSQL 17 isolated: 100 groups matched public JS algorithm, actual code collision retained both groups, branch/barber isolation passed. Frontend complete run: 1488 Vitest + 65 Node tests passed with 2 workers and explicit payment-test flags; additional modal error/abort checks passed separately. Lint/build/diff-check passed.

Ruling: two original frontend failures are test configuration issues (simulator env and custom lock message), reproduced in untouched origin/dev. Later catalog timeouts passed focused and with reduced worker concurrency. No membership/payment files or environment files were changed.

Visual evidence: actual page rendered through a temporary, local-only Vite fixture adapter, write operations disabled. Screenshots desktop/mobile in dark/light; no horizontal overflow at 320/375/430/768/1024/1440. Fixture adapter removed after verification. QA not used or deployed.

Release order for later authorized integration: backend feature branch first, then frontend feature branch. No migration needed. Query computes short codes over authorized groups; production-volume query timing remains to be measured before broader rollout. Short codes are references, never unique database keys or consumable tokens.
