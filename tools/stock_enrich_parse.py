"""Build the stock-enrichment payload for stk_load_enrichment (design 2026-11-17, slice 2).

Inputs (all Colibri / 1C exports, never committed):
  --stock   Colibri "Stock Report" (one row per piece, 42 columns)
  --sf      Colibri "Остатки товара по сф" (arrival document number -> arrival date)   [optional]
  --cost    1C "Расчет себестоимости партии" files, any number                         [optional]
Output: one JSON payload { source, pieces, receipts, costs, summary }.

Cost lines carry no serial column; the product name usually contains the serial and/or the reference.
A cost is 'exact' when the name contains the piece's serial, or when every cost line for the piece's
reference agrees; otherwise 'estimated' (the average of the lines for that reference). No match = no cost (TBD).
"""
import argparse, datetime, json, os, re, sys
from collections import defaultdict

PART_KEYS = [("ндс", "customs_vat_uzs"), ("оформлен", "clearance_uzs"), ("опробир", "assay_uzs"), ("сбор", "customs_fee_uzs")]


def norm(s):
    """Upper-case letters and digits only: how serials and references are compared."""
    return re.sub(r"[^0-9A-ZА-Я]", "", str(s or "").upper())


def brand_key(s):
    return norm(s).replace("BVLGARI", "BULGARI")


def cell_text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def read_sheet(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
    return [list(r) for r in ws.iter_rows(values_only=True)]


def table(rows, min_cells=5):
    """Rows of a report as dicts, from the first row with at least min_cells filled (the heading row)."""
    hi = next(i for i, r in enumerate(rows) if sum(v not in (None, "") for v in r) >= min_cells)
    head = [cell_text(h) for h in rows[hi]]
    return head, [dict(zip(head, r)) for r in rows[hi + 1:] if any(v not in (None, "") for v in r)]


# ------------------------------------------------------------------ Colibri
def parse_stock_report(rows, source_file):
    head, data = table(rows)
    pieces = []
    for r in data:
        serial, brand = cell_text(r.get("Серийный номер")), cell_text(r.get("Бренд"))
        if not serial or not brand:
            continue
        rec = {h: (v.isoformat() if isinstance(v, (datetime.date, datetime.datetime)) else v)
               for h, v in r.items() if h and v not in (None, "")}
        pieces.append({"brand": brand, "serial": serial, "article": cell_text(r.get("Артикул")),
                       "barcode": cell_text(r.get("Штрих Код")) or None,
                       "receipt_no": cell_text(r.get("Приход №")) or None, "data": rec})
    return pieces


def parse_sf(rows):
    """Arrival document number -> arrival date. A number seen with two dates is left out (ambiguous)."""
    _, data = table(rows)
    seen = defaultdict(set)
    for r in data:
        no, d = cell_text(r.get("Номер накладной прихода")), r.get("Дата прихода")
        if no and isinstance(d, (datetime.date, datetime.datetime)):
            seen[no].add(d.strftime("%Y-%m-%d"))
    return {no: next(iter(ds)) for no, ds in seen.items() if len(ds) == 1}


# ----------------------------------------------------------------------- 1C
def parse_cost_file(rows, source_file):
    def txt(r):
        return [cell_text(v) for v in r if v not in (None, "")]
    title = " ".join(txt(rows[0])) if rows else ""
    m = re.search(r"услуг\s+(\S+)\s+от\s+(\d\d)\.(\d\d)\.(\d{4})", title)
    doc = {"source_file": os.path.basename(source_file), "doc_no": m.group(1) if m else None,
           "doc_date": f"{m.group(4)}-{m.group(3)}-{m.group(2)}" if m else None,
           "supplier": None, "contract": None, "currency": None, "items": []}
    start = None
    for i, r in enumerate(rows):
        t = txt(r)
        if not t:
            continue
        if t[0].startswith("Поставщик") and len(t) > 1:
            doc["supplier"] = t[1].strip()
        if t[0].startswith("Договор") and len(t) > 1:
            doc["contract"] = t[1].strip()
        cur = re.search(r"Цена \((\w+)\)", " ".join(t))
        if cur and cur.group(1).lower() != "сум" and not doc["currency"]:
            doc["currency"] = cur.group(1)
        if t[0].startswith("3. "):
            start = i + 2
            break
    if start is None:
        return doc
    item = None
    for r in rows[start:]:
        if len(r) < 7 or not cell_text(r[1]):
            continue
        name = cell_text(r[1])
        if name.startswith("Всего"):
            break
        num = lambda v: float(v) if isinstance(v, (int, float)) else None
        if name.startswith("Фактурная стоимость") and item:
            q = item["qty"] or 1
            item["invoice_price"], item["invoice_uzs"] = num(r[3]), (num(r[6]) or 0) / q
        elif r[2] not in (None, "") and not name.startswith("Фактурная"):
            q = num(r[2]) or 1
            item = {"name": name, "qty": q, "invoice_price": None, "invoice_uzs": None, "customs_vat_uzs": 0.0,
                    "clearance_uzs": 0.0, "assay_uzs": 0.0, "customs_fee_uzs": 0.0, "other_uzs": 0.0,
                    "landed_uzs": (num(r[6]) or 0) / q}
            doc["items"].append(item)
        elif item and num(r[6]) is not None:
            key = next((k for word, k in PART_KEYS if word in name.lower()), "other_uzs")
            item[key] += num(r[6]) / (item["qty"] or 1)
    for it in doc["items"]:
        for k in ("invoice_uzs", "customs_vat_uzs", "clearance_uzs", "assay_uzs", "customs_fee_uzs", "other_uzs", "landed_uzs"):
            it[k] = None if it[k] is None else round(it[k], 2)
        it["fx_rate"] = round(it["invoice_uzs"] / it["invoice_price"], 2) if it["invoice_price"] and it["invoice_uzs"] else None
    return doc


def dedupe_docs(docs):
    """One document per 1C number: the file with the most lines wins (later re-exports are fuller)."""
    best = {}
    for d in docs:
        k = d["doc_no"] or d["source_file"]
        if k not in best or len(d["items"]) > len(best[k]["items"]):
            best[k] = d
    return sorted(best.values(), key=lambda d: (d["doc_date"] or "", d["source_file"]))


# ----------------------------------------------------------------- matching
def code_re(code):
    """A serial or reference as it may be written inside a product name: punctuation and spaces inside it are
    optional, and it must be the whole identifier — not the start or the end of a longer run of digits (or of
    letters). Names are often glued ("...208515dv08042602Dinh van"), so a change between digits, Latin letters
    and Russian letters counts as a boundary."""
    chars = [c for c in str(code or "").upper() if c.isalnum()]
    if not chars:
        return None
    cls = lambda c: "0-9" if c.isdigit() else ("A-Z" if c < "\u0400" else "А-ЯЁ")   # Russian text glued to a Latin code is a boundary
    body = r"[^0-9A-ZА-ЯЁ]*".join(re.escape(c) for c in chars)
    return re.compile(f"(?<![{cls(chars[0])}]){body}(?![{cls(chars[-1])}])")


def has_code(code, name):
    rx = code_re(code)
    return bool(rx and rx.search(str(name or "").upper()))


# A reference match is trusted as exact only when the cost document and the arrival fit in time: the piece
# may not have arrived more than 60 days after the document (a later shipment), and the document may not be
# dated more than a year after the arrival (Colibri is often loaded months before 1C posts the receipt).
LATE_ARRIVAL_DAYS, LATE_DOCUMENT_DAYS = 60, 365

COST_FIELDS = ("invoice_price", "fx_rate", "invoice_uzs", "customs_vat_uzs", "clearance_uzs", "assay_uzs",
               "customs_fee_uzs", "other_uzs", "landed_uzs")


def days_between(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def match_costs(pieces, docs, arrival=None):
    """-> {(brand, serial): cost dict}. See the module docstring for what exact / estimated mean.
    arrival: {receipt_no: 'YYYY-MM-DD'}. A reference match whose document and arrival do not fit in time
    (see LATE_ARRIVAL_DAYS, LATE_DOCUMENT_DAYS) is another shipment's cost, so it is only an estimate."""
    arrival = arrival or {}
    lines = [(d, it) for d in docs for it in d["items"]]
    out = {}
    used = set()
    def cost(d, vals, quality):
        c = {k: vals.get(k) for k in COST_FIELDS}
        ref = d["source_file"] + (f' (1C {d["doc_no"]}, {d["doc_date"]})' if d["doc_no"] else "")
        c.update(currency=d["currency"], match_quality=quality, source_file=ref, supplier=d["supplier"],
                 contract=d["contract"], doc_no=d["doc_no"], doc_date=d["doc_date"])
        return c
    # 1. the serial is in the product name
    for p in pieces:
        s = norm(p["serial"])
        if len(s) < 5:
            continue
        # the serial alone, or glued straight onto its reference ("...828712Udv08042679...")
        hits = [(d, it) for d, it in lines if has_code(p["serial"], it["name"])
                or (len(norm(p["article"])) >= 5 and has_code(p["article"] + p["serial"], it["name"]))]
        art = norm(p["article"])
        if len(hits) > 1 and len(art) >= 4:
            hits = [h for h in hits if has_code(p["article"], h[1]["name"])] or hits
        if len(hits) == 1 or (hits and len({h[1]["landed_uzs"] for h in hits}) == 1):
            out[(p["brand"], p["serial"])] = cost(hits[-1][0], hits[-1][1], "exact")
            used.add(id(hits[-1][1]))
    # 2. the reference is in the product name
    by_art = defaultdict(list)
    for p in pieces:
        if (p["brand"], p["serial"]) not in out and len(norm(p["article"])) >= 5:
            by_art[p["article"].strip().upper()].append(p)
    for art, group in by_art.items():
        hits = [(d, it) for d, it in lines if has_code(art, it["name"]) and id(it) not in used]
        if not hits:
            continue
        d = hits[-1][0]                       # the latest document
        same_doc = [it for dd, it in hits if dd is d]
        landed = [it["landed_uzs"] for it in same_doc if it["landed_uzs"]]
        if not landed:
            continue
        agree = max(landed) - min(landed) <= 0.005 * max(landed) and len({dd["doc_no"] for dd, _ in hits}) == 1
        if agree:
            vals = same_doc[0]
        else:
            vals = {k: (round(sum(it[k] for it in same_doc if it[k] is not None) / max(1, sum(1 for it in same_doc if it[k] is not None)), 2)
                        if any(it[k] is not None for it in same_doc) else None) for k in COST_FIELDS}
        for p in group:
            came = arrival.get(p.get("receipt_no"))
            gap = days_between(d["doc_date"], came) if came and d["doc_date"] else 0
            later = gap > LATE_ARRIVAL_DAYS or -gap > LATE_DOCUMENT_DAYS
            out[(p["brand"], p["serial"])] = cost(d, vals, "exact" if agree and not later else "estimated")
    return out


def receipt_origin(no, pieces, costs):
    """Supplier, contract and currency of an arrival document: what most of its exactly-costed pieces say."""
    from collections import Counter
    c = Counter((x["supplier"], x["contract"], x["currency"]) for p in pieces if p["receipt_no"] == no
                for x in [costs.get((p["brand"], p["serial"]))] if x and x["match_quality"] == "exact")
    if not c:
        return {"supplier": None, "contract": None, "currency": None}
    sup, con, cur = c.most_common(1)[0][0]
    return {"supplier": sup, "contract": con, "currency": cur}


def build(stock_path, sf_path=None, cost_paths=()):
    pieces = parse_stock_report(read_sheet(stock_path), stock_path)
    dates = parse_sf(read_sheet(sf_path)) if sf_path else {}
    docs = dedupe_docs([parse_cost_file(read_sheet(p), p) for p in cost_paths])
    costs = match_costs(pieces, docs, dates)
    receipts = sorted({p["receipt_no"] for p in pieces if p["receipt_no"]}, key=lambda x: (len(x), x))
    payload = {
        "source": os.path.basename(stock_path),
        "pieces": [{k: p[k] for k in ("brand", "serial", "barcode", "receipt_no", "data")} for p in pieces],
        "receipts": [dict({"colibri_no": no, "arrival_date": dates.get(no)}, **receipt_origin(no, pieces, costs)) for no in receipts],
        "costs": [dict(brand=b, serial=s, **c) for (b, s), c in costs.items()],
        # with cost files given, these costs are the whole truth for the pieces: a cost no longer matched is withdrawn
        "costs_complete": bool(cost_paths),
    }
    by_brand = defaultdict(lambda: {"pieces": 0, "barcode": 0, "arrival": 0, "exact": 0, "estimated": 0, "tbd": 0})
    for p in pieces:
        b = by_brand[brand_key(p["brand"])]
        b["pieces"] += 1
        b["barcode"] += bool(p["barcode"])
        b["arrival"] += bool(dates.get(p["receipt_no"]))
        c = costs.get((p["brand"], p["serial"]))
        b[c["match_quality"] if c else "tbd"] += 1
    payload["summary"] = {"pieces": len(pieces), "cost_documents": len(docs),
                          "cost_lines": sum(len(d["items"]) for d in docs), "by_brand": dict(sorted(by_brand.items()))}
    return payload


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stock", required=True)
    ap.add_argument("--sf")
    ap.add_argument("--cost", nargs="*", default=[])
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    pl = build(a.stock, a.sf, a.cost)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(pl, f, ensure_ascii=False, default=str)
    print(json.dumps(pl["summary"], ensure_ascii=False, indent=1))
