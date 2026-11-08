# Product and engineering implementation status

8 November 2026. This is an isolated source snapshot, not a checkout with the original repository's history. The original folder was readable, but Git access failed with Permission denied. No remote is configured and nothing has been pushed. Do not merge this snapshot's root commit into the real repository: apply the changes after the baseline commit as a patch to a branch based on the real repository.

## Implemented

- Readable light-theme muted text across all four pages; darker Catalogue gold text.
- Deliberate system body-font stack; preserve serif headings and dark theme tokens.
- Shared minimum touch-control heights and reduced-motion treatment.
- Catalogue logo links to the tools hub, with a separate Catalogue home action.
- Catalogue All tools action is available on phones; header can wrap.
- Catalogue staged filters use Apply filters, including Russian translation.
- Sold-out product photography is faded once, gently; product text stays readable.
- CRM/Catalogue generated HTML rebuilt from source.

## Verification

- Before edits, both build scripts reproduced their existing HTML byte for byte.
- `qa/ui-foundations.cjs`: dependency-free checks for generated-page JavaScript syntax, light-theme secondary-text contrast and Catalogue header navigation.
- Builds and reproducibility checked again after edits. Exact validation outcomes are supplied with the handoff.
- Existing Playwright suites and rendered mobile/device checks have not been run. Local-file browser preview was blocked by policy. Do not treat this batch as visually approved.

## Remaining plan work

- Common Tools switcher/mobile menu and theme controls.
- Shared advanced-filter drafts, clearing scope and sort conventions.
- Board browser-history integration, dirty-form protection and dialog focus.
- Preference/privacy wording and state verification.
- Remaining tool-specific information hierarchy and form/error feedback.
- Existing suite execution, rendered EN/RU and dark-mode screenshots, real-device review.

## Second batch: engineering and security

- Expanded `DELARDI_Implementation_Plan.md` covers design, frontend/backend code, API security, database integrity, performance, QA/CI and release operations.
- CRM server errors return a generic message; expected 4xx errors remain meaningful.
- CRM/Catalogue JSON responses use no-store; both reject non-object JSON before dispatch.
- Both APIs reject malformed or expired session dates, including the exact expiry boundary.
- Browser test URLs are Windows-safe; CRM test Python executable can be configured.
- Added actual-source API boundary tests and a reproducible build-drift check.
- Keepalive has explicit read permissions, a job timeout and curl deadlines.
- API changes are source only, not deployed. Full API action/role audit and browser checks remain outstanding.

See `qa/README.md` for test commands, results and limitations.

## Claude handoff

## Third batch: existing-functionality correctness

- Plan section 10 explicitly excludes new product features and adds the existing-functionality audit matrix.
- Catalogue model responses use request-object and session identity: a late success/error cannot overwrite a newer model, and responses cannot repopulate locked state.
- Catalogue list responses use object identity, preventing an A → B → A navigation race that equal filter keys alone cannot detect.
- Late Catalogue route completions cannot reset the scroll position of another route.
- CRM list reads are invalidated by locking and discarded after session replacement.
- CRM stats median now averages both middle values for an even number of clients; empty, single, odd and fractional cases are covered.
- `qa/correctness.cjs`: 19 deterministic checks using actual source functions and controlled promises. These are not rendered browser checks.
- Rebuilt CRM/Catalogue pages. API median fix is source only and requires separate deployment.

## Complete review handoff

Review changed source plus generated HTML and the API boundary fixes. Apply the complete patch series after synthetic baseline `7de5666` to a proper feature branch in the actual repository, run existing suites and rendered checks, fix findings, and only push when instructed. API source changes need a separate Supabase deployment; pushing the frontend does not apply them. No schema or role grants changed. Check phone header wrapping and long Russian labels before approval.
