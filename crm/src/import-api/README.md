# crm-import

Bulk loads into the database, guarded by a one-time key. The key is created by
the controller only (digest in `crm_import_tokens`, purpose `crm_load`, valid two
hours, single use). It is claimed before anything runs. A missing key, or one shorter than 32 or
longer than 200 characters, gets 401 "A load needs its one-time key."; a wrong, used or expired key gets 401 "That key
is not valid, has been used, or has expired." The function returns only each loader's
own result summary.

`POST` JSON, at most 20 MB. Always `import_key` and (optionally) `source`; at
least one load must be non-empty, else 400.

## Chats
`{ "import_key": "...", "source": "...", "actor": "Claude", "chats": [ {...}, ... ] }`
Up to 20 000 rows. Calls `crm_telegram_load`; chats already on file are skipped.
Result under `chats`.

## Missed requests
`{ "import_key": "...", "source": "...", "missed": [ {...}, ... ] }`
Up to 20 000 rows. Calls `crm_missed_load`; deduped on telegram_id + asked_at + kind.
Result under `missed`.

## Sales tickets
`{ "import_key": "...", "source": "...", "tickets": { "source_files": [...], "tickets": [...], "summary": {...} } }`
`tickets` is the whole payload produced by `tools/colibri_sales_parse.py`;
`tickets.tickets` must be a list of at most 5 000 entries (else 400 / 413).
Calls `ops_load_tickets(p, "import:" + source)`. Result under `tickets`.

## Stock enrichment
`{ "import_key": "...", "source": "...", "stock": { "pieces": [...], "receipts": [...], "costs": [...] } }`
`stock` is the payload produced by `tools/stock_enrich_parse.py` from the Colibri Stock Report, the Colibri
arrival-date report and the 1C batch cost files; each list at most 5 000 entries (else 400 / 413).
Calls `stk_load_enrichment(p, source)`. Result under `stock`.

A request may carry several loads; all are idempotent, so a half-finished
request can be retried (with a new key).
