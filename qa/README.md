# Local verification

Run from the repository root. No live credentials or private data are needed.

```powershell
node qa/ui-foundations.cjs
node qa/api-boundaries.cjs
node qa/correctness.cjs
python qa/check-builds.py
```

API tests require Node 22.13+ with `node:module.stripTypeScriptTypes`. They execute the actual edge source after stripping types, with stubbed Deno/fetch. They cover request shape, response cache policy, error disclosure and session expiry/access checks. This is not a Deno type check, database/RLS test or full action-level authorisation audit.

On this machine Node is not on shell PATH; the two JavaScript checks were executed with the available JavaScript runtime. Python used `C:\Users\Alex\AppData\Local\Programs\Python\Python311\python.exe`.

Existing browser suites additionally require Playwright and Chromium. CRM workbook checks use `PYTHON` if supplied, otherwise `python` on Windows and `python3` elsewhere. Example:

```powershell
$env:PYTHON = 'C:\Users\Alex\AppData\Local\Programs\Python\Python311\python.exe'
node crm/src/qa/test.js
node catalogue/src/qa/test.js
```

Browser execution has not been verified in this environment. Local-file browser access was blocked by policy; do not route around that restriction with another automation API. Use an authorised preview/environment for visual and browser review.

## Results for second batch

- 21 UI foundation checks passed.
- 52 API boundary checks passed using synthetic sessions and stubbed upstream responses.
- Both generated HTML files match their source builds byte for byte.
- Modified browser test files parse; browser suites themselves remain unrun.
- `git diff --check` passed.

Supabase source edits are **not deployed**. Deployment requires separate review and a smoke check on the proper target. The real Board API, database definitions and deployed security configuration remain unavailable.

## Third-batch results

`qa/correctness.cjs` adds 19 checks covering out-of-order Catalogue model/list responses, stale success and failure, lock/session changes, cross-route scroll preservation, CRM pending-list responses and median calculation boundaries. It evaluates real source functions against controlled promise responses; it does not claim browser rendering or database validation.
