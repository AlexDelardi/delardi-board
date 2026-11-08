# UI implementation status — first batch

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

## Claude handoff

Review changed source plus generated HTML. Apply the patch to a proper feature branch in the actual repository, run existing suites and rendered checks, fix findings, and only push when instructed. No API, schema, permission or session changes are intended in this batch. Check phone header wrapping and long Russian labels before approval.
