# DELARDI product, design, engineering and security plan

Prepared: 8 November 2026  
Project: `C:\Users\Alex\delardi-board`  
Status: implementation in progress in an isolated local snapshot on `ux/tool-consistency`. Original repository unchanged; no push. This revision expands the original UI/UX plan to the complete product and engineering scope.

## 1. Objective and evidence

Make the Landing page, Weekly Board, Client Instrument (CRM) and Catalogue behave like one product family. Preserve their specialised workflows while making repeated actions predictable on desktop, phone and iPad.

This plan is based on inspection of local HTML, CSS, JavaScript, build scripts and documentation. Browser policy prevented rendering local files. Findings below are code observations or proposed improvements, not results of a visual or usability test. Existing test suites were inspected but not executed. Revalidate against the actual branch baseline before implementation.

Priority definitions:

- P1: navigation, readability or behaviour likely to cause mistakes or block normal use.
- P2: improvements to efficiency, consistency and comprehension.
- P3: optional polish after the main flows pass review.

Scope: product design, UX, frontend architecture, API security and correctness, data integrity review, performance, build reproducibility, testing and operational handoff. Preserve existing business rules and independent tool sessions. Backend code changes must be reviewed and deployed separately from GitHub Pages. Live database and configuration claims require evidence; single sign-on is not an implicit requirement.

## 2. Current system and intended connections

| Tool | Role | Intended relationship |
|---|---|---|
| Landing | Tools hub | Predictable entry and switching point |
| Board | Leadership topics and weekly meeting | Independently useful; accessible from the hub and shared switcher |
| CRM | Client search, clienteling and data maintenance | Purchase lines link to the corresponding Catalogue model and variant |
| Catalogue | Product discovery and advisor/client presentation | Opens independently or from CRM; provides predictable return/switch controls |

Keep the CRM-to-Catalogue link in a new tab: this preserves the open client card. Add a clear accessible indication that a new tab opens. Do not invent reverse client links on products or connect Board topics to private client records without a concrete business requirement.

## 3. Shared interaction rules to implement

| Element/action | Target convention |
|---|---|
| Delardi logo | Always opens the tools hub |
| Tool Home | Separate, labelled action returning to the current tool start screen |
| Tool switching | Same labelled Tools entry on desktop and in the mobile menu |
| Mobile menu | Predictable access to views, Tools, language where supported, theme and Lock |
| Primary action | Filled button; one clearly dominant action per form or panel |
| Secondary action | Outlined/quiet button for Cancel, Close or Back |
| Destructive action | Explicit verb and destructive styling; consequence explained before confirmation |
| Simple filters | Apply immediately; reflect active state and update results |
| Advanced filter panel | Edit a draft; Apply filters commits, Cancel/Close discards unapplied changes |
| Clear filters | Clears filter restrictions; does not silently change sort or erase text unless explicitly labelled |
| Sort | Separate concept from filtering; selected value remains visible |
| Detail navigation | Back closes the current layer or returns to the preceding list with its state preserved |
| Feedback | Immediate pending state, short success confirmation, actionable persistent errors |
| Privacy control | Same eye icon family with a label explaining precisely what is hidden |

Differences in information layout remain intentional: Board topics and CRM clients may use drawers; Catalogue models may use full pages. Consistency means the controls behave predictably, not that every screen has the same layout.

## 4. Work packages

### A. Baseline and reproducible checks — P1, first

1. Confirm the real Git worktree and repository root. Previous Git operations returned errors; do not assume this folder is ready for a branch.
2. Read applicable repository instructions. Record branch, commit SHA and working-tree changes; preserve unrelated edits.
3. Establish Node, Python and Playwright/Chromium availability. The earlier shell did not resolve Node; Python resolved to a Windows app alias, so interpreter usability remains unverified.
4. Run existing CRM and Catalogue tests before edits and record actual results, dependency versions and any pre-existing failures.
5. Rebuild in an isolated, writable checkout/copy and compare generated HTML with committed HTML. Explain any pre-existing drift before changing it.
6. Obtain baseline screenshots with synthetic data through an authorised preview surface. If preview access remains blocked, explicitly mark visual verification incomplete; do not work around the browser restriction.

Acceptance: a known baseline and runnable, documented commands; no claim of passing tests without captured output.

### B. Navigation and tool switching — P1

Observed: Board and CRM logos point to the tools hub; Catalogue logo points to its own start route. Catalogue's desktop All tools link is hidden at phone widths. CRM has a direct Board shortcut that the other tools do not reciprocate.

Changes:

- Make every logo point to the hub. Introduce a distinct Catalogue Home link and preserve its internal breadcrumbs.
- Add a shared Tools control listing Board, CRM and Catalogue with the current tool marked. It navigates to existing pages and does not reuse or transfer session tokens.
- Replace the special CRM-to-Board shortcut with this common pattern.
- Use a consistent mobile menu entry point. Keep frequent floor actions, such as eye and client-view controls, directly available when space allows.
- Retain routes and model/variant deep links through unlock. On access refusal, explain the missing access and offer a return to the hub.
- Keep tool availability wording permission-neutral unless rights are actually known. Cached unlocked state must not be presented as proof of current access.

Files: `index.html`, `board/index.html`, `crm/src/app.js`, `crm/src/floor.js`, `catalogue/src/app.js`, `catalogue/src/template.html`.

Acceptance: from any unlocked tool on a phone, users can reach the hub or another tool without manually editing the URL. Logos have identical meaning. A CRM purchase link still opens the correct model and colour in a new tab.

### C. Filter, search and sorting behaviour — P1

Observed: Board and CRM filters apply immediately. Catalogue's sheet uses a draft and commits with Done. CRM uses Reset and Clear all in different places.

Changes:

- Keep quick controls immediate, including search, status/stock shortcuts and removal of active-filter pills.
- Standardise advanced panels on draft editing and Apply filters / Cancel. Adapt CRM and Board advanced panels without delaying their quick controls.
- In Catalogue rename Done to Apply filters. Close, scrim click, Escape and Back must discard the draft consistently.
- Label clearing scope explicitly: Clear filters preserves search and sort; Clear search removes search text. If a full reset is needed, label it Reset search and filters and document its defaults.
- Show active filter count and removable pills consistently. Include search scope in the result summary. Do not count sort as a filter.
- Make sorting discoverable independently of column-heading shortcuts. Keep column sorting as an optional efficient path in CRM.
- Preserve filters, sort and scroll position when returning from details. Keep a clear no-results state with recovery actions.
- Test dependent Catalogue choices: changing category/brand must remove incompatible draft selections and show the resulting state before application.

Files: Board toolbar/mobile menu in `board/index.html`; CRM `app.js`, `listx.js`, `floor.js`, `template.html`; Catalogue `app.js`, `template.html`.

Acceptance: closing a draft panel never silently applies it; Apply commits once; reopening reflects applied values. Quick changes remain immediate. Clear filters has the same scope across tools.

### D. Mobile Back, drawers and unsaved work — P1

Observed: CRM and Catalogue explicitly manage browser-history layers. Board drawers currently open and close through UI state without equivalent history integration.

Changes:

- Add Board layer history for topic drawers, navigation and modals, following the existing CRM/Catalogue principle.
- Back and Escape close only the topmost layer. Nested editor → detail → list must unwind predictably.
- Closing via X, Cancel, scrim and Back must synchronise history; avoid phantom entries and double navigation.
- Track dirty forms. If an action would discard edits, offer Keep editing / Discard changes. Do not add a prompt for untouched forms or committed changes.
- Restore focus to the opening control when it still exists; otherwise use a sensible list/page fallback.
- Preserve body scroll and prevent background interaction behind modal layers. Trap focus in modal dialogs and restore it on close.

Files: `board/index.html`, CRM `floor.js` and `mobile.js`, Catalogue `floor.js` and `app.js`.

Acceptance: repeated open/close cycles do not corrupt Back/Forward; closing the deepest layer does not leave the tool; dirty forms are not silently discarded. Check CRM merge and Catalogue report forms as well as ordinary editors.

### E. Text, colour and control foundations — P1/P2

Observed: small text uses muted `#8892A6` (about 3.13:1 against white). Catalogue uses gold `#A8894F` for some small labels (about 3.30:1). Evolventa is declared but not supplied as a web font. CRM has broad 44px control rules; Catalogue has several 36–40px controls.

Changes:

- Separate readable secondary text from decorative muted colour. Meet at least 4.5:1 for normal text against its actual background; test both themes and state variations.
- Darken gold used as text or reserve the existing gold for decorative elements. Preserve navy brand identity.
- Use a restrained type scale: approximately 14–16px body/interactive text and 12–13px supporting text where appropriate. Avoid tiny uppercase instructions; retain compact but readable desktop tables.
- Default to an explicit, tested system-font stack for body text. Document that this is intentional; embedding Evolventa is a separate option only if a licensed web font is supplied.
- Set a shared touch target of at least 44×44 CSS px for routine touch actions, including icon buttons, chip removal and close controls. Keep clear spacing between adjacent actions.
- Standardise button heights, radii, borders, icons, selected/hover/focus/disabled/busy states and danger treatment.
- Reuse the Board/CRM half-disc theme icon in Catalogue. Give eye and theme controls action-oriented accessible labels.
- Honour reduced-motion preference for transitions and animated placeholders.

Implementation: align semantic CSS tokens in the existing pages/templates. Avoid introducing a framework or external asset dependency. A shared specification can precede shared runtime code; preserve self-contained production HTML.

Acceptance: measured colour pairs pass; controls are usable by keyboard and touch; EN/RU text does not clip; no dependency on Evolventa being installed locally.

### F. Preferences, language and privacy cues — P2

- Preserve the shared `board_theme` and `delardi_lang` preferences used by the supported pages. Verify changes when moving between tools and when returning to an already-open tab.
- The inspected Board has no equivalent EN/RU switch. Treat full Board localisation as a separately estimated follow-up, not a small label change. In the initial release, identify Board as English in the tools menu and preserve the user's language choice for CRM/Catalogue.
- Use clear labels: Hide amounts in CRM, Hide prices in Catalogue. Explain whether CRM phone numbers are also hidden and ensure the wording matches implementation.
- Keep presentation hiding distinct from permissions and locking. A hidden price is not an access restriction.
- Catalogue client view must have a visible state indication and a clear exit. Verify hidden staff information across every model section; locking ends client view as currently intended.
- Keep independent locks and sessions. Document that Lock applies to the current tool; do not imply it locks every open tab.

Acceptance: preference continuity works across navigation; unsupported language is clear; privacy labels describe actual behaviour; no accidental session sharing.

### G. Tool-specific information hierarchy — P2

Board:

- Emphasise topic title, next action, owner and due date; leave background and history inside details.
- Use a text label for urgency/status alongside colour. Make the floating add button accessible as Add topic and consider a visible short label where space permits.
- Preserve a useful meeting/projector layout rather than forcing dashboard density into meeting mode.

CRM:

- Put name and relationship context ahead of technical references and cleanup metadata.
- Retain dense desktop rows, search, active filter pills and mobile Overview/Purchases/Clean-up/History tabs.
- Keep Add note reachable and distinguish it from editing the client's details.
- Provide a visible sort/filter route on mobile, even when desktop offers column shortcuts.

Catalogue:

- Keep images, product identity, price and availability prominent; maintain details and advisor content below.
- Replace compounded sold-out fading with a single gentle treatment and explicit Sold out label. Keep sold-out photos and references legible.
- Distinguish Sold out, In transit, TBC and unconfirmed information using words as well as colour.
- Retain correct model/variant selection and Back-to-results state.

Landing:

- Review the three-card two-plus-one layout at intermediate widths using an actual preview. Keep three columns where labels comfortably fit; collapse earlier if necessary. Do not force three columns on narrow screens.
- Keep this page a concise hub, not a second dashboard.

### H. Feedback, loading and errors — P2

- Use consistent Saving… / Saved and Applying… states; prevent duplicate submission while pending.
- Use toasts for short confirmations. Keep form errors beside the relevant field and blocking/network errors visible until resolved.
- Add appropriate live status announcements without repeatedly interrupting screen-reader users.
- Preserve drafts on recoverable failures. Distinguish expired session, refused action and lost connection.
- Never show success before the API confirms the operation. Test failures with mocks rather than production records.

## 5. Implementation and commit sequence

Suggested future branch: `ux/tool-consistency`.

| Order | Commit scope | Dependencies |
|---|---|---|
| 1 | Baseline instructions, UI conventions and test setup | Valid worktree and baseline |
| 2 | Shared text/control tokens, contrast and touch sizing | 1 |
| 3 | Hub/logo semantics and desktop/mobile tool switching | 2 |
| 4 | Filter drafts, labels, pills and sorting | 3 |
| 5 | Board history and shared dismissal/dirty-form behaviour | 3; verify interaction with 4 |
| 6 | Privacy/preferences cues and tool-specific hierarchy | 2–5 |
| 7 | Regression coverage, screenshots and final documentation | All implemented changes |

The isolated snapshot branch now exists; do not push it or its synthetic baseline into the original repository. At implementation time, use a clean branch/worktree and avoid rewriting history or overwriting unrelated edits. Rebuild CRM/Catalogue from source and include generated HTML alongside source in each relevant commit. Board and landing remain directly edited HTML.

## 6. Validation matrix

Use synthetic records and authorised preview access. The sizes below are representative CSS viewports, not substitutes for at least one real iPhone/Android and iPad pass.

| Surface | Viewports | Required scenarios |
|---|---|---|
| Desktop | 1440×900, 1024×768 | Hub, navigation, filters, details, keyboard, long tables |
| Phone | 390×844, 360×800; landscape | Menu, search, filters, Back, keyboard-open forms, pinned footer |
| iPad | 820×1180 and 1180×820 | Portrait/landscape, split layout, touch, client presentation |
| Accessibility | 200% zoom, keyboard, reduced motion | Focus, dialog trap, text reflow, announcements, contrast |
| State variants | Light/dark; EN/RU where supported | Long labels, no data, no results, loading, offline, denied and expired session |

Focused automated regression cases:

1. Correct hub destination from every logo and correct tool Home destination.
2. Mobile tool switch remains reachable; current tool is marked.
3. Draft filters cancel/commit correctly; Clear filters preserves documented search/sort scope.
4. Back closes the topmost layer; repeated cycles and Forward remain valid.
5. Unsaved edit discard protection; no prompt on untouched forms.
6. CRM purchase → Catalogue retains exact model/variant and opens a new tab.
7. Privacy controls, client view and independent session expiry retain their scope.
8. Real content-length fixtures expose EN/RU wrapping, long references and large UZS prices.
9. Touch targets, overflow and keyboard focus are checked on rendered screens.
10. Existing permission-sensitive CRM add/export/merge and Catalogue report flows still pass.

Extend existing `crm/src/qa/` and `catalogue/src/qa/` tests. Add a small, targeted Board/landing suite for navigation and history; avoid duplicating the entire application in tests. Review file-URL construction and the CRM suite's `python3` invocation for Windows portability before relying on them.

## 7. Claude review and publishing handoff

Provide Claude with the plan, baseline SHA, final branch SHA, commit summary, changed-file list, test commands/results and synthetic-data screenshots. Clearly identify any skipped visual/device checks and pre-existing failures.

Review checklist:

- Do repeated actions use the agreed controls and terminology?
- Are all routes, model variants, browser history and unsaved drafts preserved?
- Are tools switchable on phones and iPads?
- Are auth, permissions, independent locks, exports and API contracts unchanged?
- Do compiled CRM/Catalogue pages match their sources?
- Are contrast, touch, keyboard, EN/RU and dark-mode checks evidenced?
- Are any session tokens, client records or secrets present in the diff or screenshots?
- Is every planned item marked complete, deferred with reason, or blocked?

Claude should report findings by severity with file references. Resolve blocking findings and rerun affected checks. When pushing is explicitly requested in the later implementation task, push the feature branch for review; do not push directly to `main`. Confirm the repository's actual Pages publishing configuration first: a feature-branch push and a merge to the publishing branch have different consequences.

For release, merge through the repository's normal review process, verify the deployed pages and retain the prior known-good commit. Roll back with a normal revert through that same process if needed. Do not deploy APIs or database changes as part of this UI work.

## 8. Completion criteria

- P1 work complete and validated; P2 items either complete or explicitly deferred.
- A repeat user can navigate, filter, close and switch tools without learning a new convention in each one.
- Phone and iPad flows have rendered evidence; any unavailable real-device checks are explicitly documented.
- Existing business and permission-sensitive workflows continue to pass.
- Sources and generated pages agree, and the branch contains no unrelated work or sensitive data.
- Claude's blocking review findings are resolved before release.

Optional later work: full Board localisation, licensed embedded fonts, deeper cross-tool business integration and consolidation of duplicated frontend code. These are not prerequisites for the first consistency release.


## 9. Expanded engineering programme — governs overall priorities

Sections 2–8 remain the detailed design/interaction workstream. This section adds the omitted engineering and security work and supersedes the earlier frontend-only scope. The initial UI batch is useful, but is not completion of this broader programme.

### Priority and evidence rules

- P0: verified exposure of secrets, unauthorised access or destructive data-integrity failure. Contain first if encountered; no P0 is claimed from the current inspection.
- P1: verified security/correctness issue or serious workflow obstacle. Fix with a regression test before aesthetic polish.
- P2: maintainability, speed, diagnostics and design consistency.
- P3: optional refactors and product extensions with measurable justification.
- Separate confirmed source findings from hypotheses and unavailable deployment evidence. Never treat CORS, a hidden button or the eye toggle as authorisation.

### E1. Security and API boundaries — P1

Confirmed source findings:

1. CRM's top-level catch returns raw error messages, including database response text, for server failures. Catalogue already masks server errors. Standardise public 5xx messages while retaining expected 4xx validation/conflict messages.
2. Both APIs parse arbitrary JSON without requiring an object. Null can fail as an internal error; arrays/primitives should be rejected before dispatch.
3. Both APIs' response helper lacks an explicit no-store policy for sessions and sensitive responses. Add `Cache-Control: no-store` to JSON responses.
4. Both session checks compare a parsed expiry against now without rejecting non-finite dates. Reject missing/malformed expiry and the exact expiry boundary.
5. Catalogue's size guard trusts Content-Length; CRM has no equivalent body-size guard. Investigate platform limits, then implement bounded stream reads with separate import/photo/interactive limits and tests. Avoid choosing limits without checking actual export/import payload sizes.

Next audit:

- Enumerate every action, required role and returned fields in CRM/Catalogue. Test viewer/editor/exporter/importer/manager isolation and revoked rights.
- Review passcode hashing, session generation/storage/lifetime, cross-tool rejection, failed-attempt recording and rate-limit atomicity. Validate forwarded-IP trust against the actual hosting platform.
- Examine query-value encoding, URL construction, DOM insertion, spreadsheet formula handling and untrusted links/images. Fix demonstrated issues, not speculative patterns.
- Review errors/logging for personal-data leakage. Use redacted structured events; never log passcodes/tokens or whole client payloads.
- Review request timeouts, malformed upstream responses and retry safety. Do not automatically retry non-idempotent writes.
- Audit CSP and CORS against actual deployment. Do not casually remove inline-script support from the current self-contained build or treat wildcard CORS alone as an exploit.

Acceptance: regression tests exercise denied/expired/malformed requests and safe errors; no private database detail is returned in 5xx responses. Backend edits are labelled **source only, deployment pending** until separately deployed and checked.

### E2. Database and business integrity — P1, evidence-dependent

Missing locally: Board API source, SQL schema/migrations, database function definitions, grants/RLS policies and deployed configuration. Request/export the minimum required definitions when reaching this gate; production client rows and secrets are unnecessary.

- Inspect security-definer functions, fixed search paths, execute grants and public/anon access.
- Verify atomic writes and audit logs for CRM merge/delete/import/undo; transaction rollback must preserve both records and history on failure.
- Verify catalogue loads, one-time import key consumption and photo-write recovery; avoid leaving partial state or losing an import token on validation failure without a documented retry route.
- Check source imports for duplicate/normalised phone handling, ownership, do-not-contact, catalogue joins and deletion semantics.
- Validate segmentation, totals and rounding with synthetic boundary fixtures; separately confirm business definitions with existing documentation.
- Version schema changes and rehearse on a disposable database before deployment. No production data modification is authorised merely by this plan.

Acceptance: supplied schema/functions match deployed versions; role tests and rollback/idempotency cases pass on a test instance. Until then mark database security **not verified**, not passed.

### E3. Code structure and maintainability — P2

- Map responsibilities and data flow for each frontend and API, including state, routing, rendering, permissions and writes.
- Extract Board source/build structure only after baseline coverage exists; preserve its generated/self-contained delivery model and URLs.
- Consolidate repeated design tokens and small pure helpers where this reduces drift. Keep shared runtime changes small; do not introduce a frontend framework as a prerequisite.
- Establish lightweight formatting/lint/type checks and a clear dependency manifest. Separate runtime dependencies from QA tooling; pin reproducible tooling and lock it after installation.
- Remove dead code only after checking callers, translations and generated bundles.
- Add explicit frontend/API contract fixtures for list/detail/actions so changes cannot silently diverge.

Acceptance: source ownership and build commands documented; generated files reproducible; touched TypeScript passes Deno checks; refactors retain tested behaviour.

### E4. Performance and reliability — P2

- Measure initial HTML size, main-thread work, API latency, query count and request fan-out before optimisation. Current file sizes alone do not prove a user-visible performance problem.
- Test stale-search responses, overlapping requests, duplicate submissions and expensive rerenders. Add cancellation or request identity guards where a reproduced race warrants them.
- Review pagination and aggregate queries against expected data growth; avoid fetching all rows accidentally or silently losing rows to platform caps.
- Verify image dimensions/lazy loading and reasonable thumbnail use; preserve product legibility and client-view behaviour.
- Reconcile reconnect/session-expiry/idle-lock behaviour across tools; preserve unsaved work without retaining unauthorised data after lock.

Acceptance: baseline and after measurements captured under the same fixtures; demonstrated races regressions tested; agreed performance budget recorded after measurement.

### E5. QA, CI and operations — P1/P2

- Make CRM tests portable: proper file URL generation and a configurable Python executable, with Windows and Linux defaults. Apply the file-URL correction to Catalogue too.
- Add a dependency-free build-drift and syntax/security-boundary check, then establish a reproducible Playwright toolchain and install browser binaries through the normal package setup.
- Run existing suites with synthetic data. Policy-blocked local previews cannot be bypassed through another automation route; use an authorised preview when available and retain this limitation until then.
- Add CI build reproduction, focused unit/API checks and browser QA. Limit workflow token permissions and ensure tests never need live credentials.
- Add useful keepalive timeouts and least-privilege workflow permissions; document what health proves and does not prove.
- Capture release versions, frontend/API compatibility, rollback steps and post-release smoke checks. GitHub Pages push does not deploy Supabase functions.

Acceptance: documented single-entry checks work on supported environments; CI results are attached to the actual repository PR; no credentials or production data needed.

### E6. Visual design and accessibility — P1/P2

Retain the detailed work in sections 3–6, and add a rendered visual inventory: page grid/spacing, type hierarchy, iconography, logo treatment, borders/shadows, density, states and photography. Establish representative desktop/phone/iPad reference screens before further polish.

Evaluate the CRM's operational density separately from Catalogue's client-facing presentation. Align the shared controls while allowing these different purposes. Validate light/dark, EN/RU, keyboard, 200% zoom, long content and empty/error states. Use screenshots with synthetic records only. Source-level checks are not a substitute for visual sign-off.

### Overall execution order and review gates

| Stage | Work | Exit evidence |
|---|---|---|
| 0 | Baseline/source provenance | Isolated snapshot, matching builds; original Git access still unresolved |
| 1 | Confirmed API correctness/security fixes and QA portability | Unit/boundary checks; no deployment claim |
| 2 | Shared navigation, filter semantics, Back/dirty forms | Functional regression and authorised preview |
| 3 | Visual design system and mobile hierarchy | Rendered state matrix and review |
| 4 | Architecture/performance work based on findings | Type/lint/build results and measured improvements |
| 5 | Supplied database/Board API review | Role, transaction and integrity evidence; blocked until supplied |
| 6 | Claude review and release handoff | Actual-repository branch, resolved findings, separate deployment checklist |

### Current progress and handoff requirements

- Completed first batch: light-mode text foundations, touch sizing, reduced motion, Catalogue navigation and filter label, sold-out presentation. Twenty-one dependency-free checks passed; visual review remains pending.
- Current batch: CRM error redaction, JSON object validation, response cache policy, fail-closed expiry checks, QA portability and build verification.
- Do not describe current snapshots as fully reviewed or production-ready. Remaining UI work, browser testing, complete API role coverage and unavailable backend evidence remain explicit backlog items.
- Claude receives the complete patch series after synthetic baseline `7de5666`, the plan, test outputs and file-by-file deployment impact. Apply patches to a branch based on the real repository; do not merge unrelated snapshot history.


## 10. Existing-functionality audit — no new product features

This programme repairs and improves existing capabilities. New dashboards, sales workflows, reservations, reminders, AI assistants and other feature additions are excluded unless separately requested. The items below are investigation targets, not claims that every item contains a defect.

| Area | Required checks and remediation | Evidence for completion |
|---|---|---|
| Calculation correctness | Reconcile totals, averages, medians, segments, birthday windows and counts with synthetic records and existing business definitions | Boundary fixtures and list-to-dashboard reconciliation |
| State consistency | Keep selected rows, detail cards, filters, counts and import/merge outcomes synchronised | Edit/refresh/navigation regressions |
| Request races | Prevent slow searches/details from overwriting newer selections; ignore responses from superseded sessions | Controlled out-of-order promise tests |
| Incomplete operations | Preserve recoverable drafts and state on save/import/upload failure; show success only after confirmation | Injected failure and retry cases |
| Presentation semantics | Distinguish zero, missing, unknown, loading, unavailable and load failure | Rendered fixture matrix |
| Search and sorting | Test RU/EN, phone punctuation, mixed case, nulls, numeric sort and ties | Expected ordered result fixtures |
| Forms and validation | Validate actual dates/numbers, required fields and cancellation behaviour | Invalid/boundary input tests and dirty-form checks |
| Dates and money | Check Tashkent timezone boundaries, birthdays, UZS grouping, rounding and precision | Time-frozen and numeric fixtures |
| Permissions and locks | Align visible actions with rights; pending responses must not repopulate locked/session-switched state | Revocation/lock tests with in-flight reads |
| Navigation | Test reload, deep links, multiple tabs, Back/Forward and expiry recovery | State-restoration regression cases |
| Mobile/browser behaviour | Keyboard, rotation, safe areas, scrolling, fixed controls, iPad split views | Authorised rendered and real-device checks |
| Language and wording | Remove ambiguous labels, missing translations and obsolete help | EN/RU copy inventory and long-label screens |
| Source/deployment drift | Verify builds, stale comments, dead code and deployed API equivalence | Byte comparisons, caller checks and deployment hashes |
| Realistic performance | Measure searches, request count, rendering and response sizes under representative volume | Reproducible baseline and after measurements |

Execution rule: reproduce a problem, identify its cause, implement a focused fix, run a meaningful regression, and record the result. Avoid speculative changes and tests that merely restate implementation. Preserve current business meanings unless the existing result is demonstrably wrong.

Current correctness batch: investigate Catalogue out-of-order model/list responses, CRM pending-list responses after locking, and even-sized CRM median calculations. Capture specific results in `UI_REVIEW_STATUS.md`; the rest of this matrix remains open until inspected and verified.

Third-batch result: Catalogue model/list races, CRM lock/list responses and the even-count median were fixed. All 92 local checks passed (52 API boundaries, 21 UI foundations, 19 correctness); both HTML builds reproduce. Browser/device verification and API deployment remain pending.
