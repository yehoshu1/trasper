# Pull request

## What changed

<!-- A short summary of the problem and the approach. Link the issue. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Dependency or build change
- [ ] Security fix

## How it was tested

<!-- Commands you ran, and any manual steps. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (when the end-to-end flow changed)

## Checklist

- [ ] Money remains `BigInt` in minor units; no floating point was introduced.
- [ ] Pricing changes keep the sum of line prices equal to the total.
- [ ] Any write checks permissions, validates with Zod and writes an audit row.
- [ ] Issued documents and payments remain frozen/append-only.
- [ ] New domain rules have tests; new PNR failures have fixtures.
- [ ] No secrets, real customer data or passport data are included.
- [ ] README/CHANGELOG updated where behaviour or configuration changed.
- [ ] User-facing copy is English (UK).
