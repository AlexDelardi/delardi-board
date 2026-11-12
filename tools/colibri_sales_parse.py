#!/usr/bin/env python3
"""Parse Colibri sales-report exports (.xlsx) into one tickets/lines/payments JSON payload.

Usage: python3 tools/colibri_sales_parse.py <file.xlsx>... -o payload.json
Spec: docs/specs/2026-11-12-s3-sales-register-design.md section 4.1.
"""
import argparse
import datetime
import json
import os
import re
import sys

import openpyxl

SHEET = "Дневной отчет 2"
TOLERANCE = 1.0  # UZS
NOTE_MARK = "Примечание:"
METHODS = {"кар": "card", "vis": "visa"}
PAY_RE = re.compile(r"^\s*([^\s(]+)\s*(?:\(\s*([0-9.,]+)\s*\))?\s*$")
NAME_RE = re.compile(r"_(\d{2}-[A-Za-z]{3}-\d{2})-(\d{2}-[A-Za-z]{3}-\d{2})\.xlsx$")

# column indexes
C_NO, C_DATE, C_NAME, C_ART, C_QTY, C_SIZE, C_SELLER = 0, 1, 2, 3, 4, 5, 6
C_LIST, C_CUR, C_PCT, C_AMT, C_NET, C_SK, C_PAY = 7, 8, 9, 10, 11, 12, 13
C_VIP, C_NOTE, C_BRAND, C_COLOUR, C_SERIAL = 15, 17, 18, 19, 20


def _txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _num(v):
    """Whole numbers become ints; blanks become None."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        v = float(v.replace(",", ".").replace(" ", ""))
    if isinstance(v, float) and v == int(v):
        return int(v)
    return v


def _abs(v):
    return abs(v) if v is not None else None


def _cell(row, i):
    return row[i] if i < len(row) else None


def _ticket_no(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return str(int(v)) if v == int(v) else None
    s = str(v).strip()
    return s if s.isdigit() else None


def _date(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return _txt(v)


def _file_end_date(path):
    m = NAME_RE.search(os.path.basename(path))
    if not m:
        raise SystemExit(f"cannot read end date from file name: {os.path.basename(path)}")
    return datetime.datetime.strptime(m.group(2), "%d-%b-%y").date()


def split_article(raw, colour):
    article, colour = _txt(raw), _txt(colour)
    if article and colour and article.endswith(" " + colour):
        article = article[: -len(colour)].strip()
    return article, colour


def split_note(raw):
    s = _txt(raw)
    if s is None:
        return None, None
    if NOTE_MARK in s:
        head, tail = s.split(NOTE_MARK, 1)
        return _txt(head), _txt(tail)
    return s, None


def parse_payment(raw, ticket_net):
    text = _txt(raw)
    if text is None:
        return None
    m = PAY_RE.match(text)
    method = METHODS.get(m.group(1).lower()) if m else None
    if method is None:
        raise SystemExit(f"unknown payment text: {text!r}")
    amount = _num(m.group(2)) if m.group(2) else ticket_net
    return {"method": method, "amount": amount, "raw": text}


def _footer_totals(rows):
    """Return (card, visa) totals from the footer row holding КАР / VISA."""
    for row in rows:
        cells = [c for c in row if c is not None]
        if "КАР" in cells and "VISA" in cells:
            card = cells[cells.index("КАР") + 1]
            visa = cells[cells.index("VISA") + 1]
            return float(card), float(visa)
    raise SystemExit("footer КАР/VISA row not found")


def parse_file(path):
    """Parse one export. Returns (tickets, card_total, visa_total, footer_card, footer_visa)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = [list(r) for r in wb[SHEET].iter_rows(values_only=True)]
    wb.close()
    start = next((i for i, r in enumerate(rows) if r and r[0] == "№"), None)
    if start is None:
        raise SystemExit(f"header row not found in {os.path.basename(path)}")
    base = os.path.basename(path)
    tickets, by_no, pay_raw = [], {}, {}
    for row in rows[start + 1:]:
        no = _ticket_no(_cell(row, C_NO))
        if no is None:
            continue
        t = by_no.get(no)
        if t is None:
            t = {"ticket_no": no, "sold_at": _date(_cell(row, C_DATE)), "seller_raw": None,
                 "client_raw": None, "note": None, "source_file": base, "lines": [],
                 "payments": []}
            by_no[no] = t
            tickets.append(t)
        if _cell(row, C_ART) is None and _cell(row, C_NAME) is None:
            pay_raw[no] = _cell(row, C_PAY)
            continue
        if not t["lines"]:
            t["seller_raw"] = _txt(_cell(row, C_SELLER))
            t["client_raw"], t["note"] = split_note(_cell(row, C_NOTE))
        qty = _num(_cell(row, C_QTY))
        refund = qty is not None and qty < 0
        article, colour = split_article(_cell(row, C_ART), _cell(row, C_COLOUR))
        f = _abs if refund else (lambda v: v)
        t["lines"].append({
            "line_no": len(t["lines"]) + 1,
            "kind": "refund" if refund else "sale",
            "article": article, "colour": colour,
            "item_name": _txt(_cell(row, C_NAME)), "size": _txt(_cell(row, C_SIZE)),
            "qty": f(qty),
            "price_list": f(_num(_cell(row, C_LIST))), "price_current": f(_num(_cell(row, C_CUR))),
            "discount_pct": _num(_cell(row, C_PCT)), "discount_amt": f(_num(_cell(row, C_AMT))),
            "net": f(_num(_cell(row, C_NET))),
            "brand_raw": _txt(_cell(row, C_BRAND)), "serial_raw": _txt(_cell(row, C_SERIAL)),
            "sk": _txt(_cell(row, C_SK)), "vip": _num(_cell(row, C_VIP)),
        })
        # signed net, used as the amount of a bare payment
        t["_signed_net"] = t.get("_signed_net", 0) + (_num(_cell(row, C_NET)) or 0)
    card = visa = 0.0
    for t in tickets:
        p = parse_payment(pay_raw.get(t["ticket_no"]), t.pop("_signed_net", 0))
        if p:
            t["payments"].append(p)
            if p["method"] == "card":
                card += p["amount"]
            else:
                visa += p["amount"]
    fcard, fvisa = _footer_totals(rows)
    return tickets, card, visa, fcard, fvisa


def parse_files(paths):
    """Parse and merge exports; the ticket from the file with the latest end date wins."""
    ordered = sorted(paths, key=lambda p: (_file_end_date(p), os.path.basename(p)))
    merged = {}
    for path in ordered:
        tickets, card, visa, fcard, fvisa = parse_file(path)
        name = os.path.basename(path)
        for label, got, want in (("КАР (card)", card, fcard), ("VISA", visa, fvisa)):
            if abs(got - want) > TOLERANCE:
                raise SystemExit(f"{name}: {label} total {got} differs from footer {want}")
        for t in tickets:
            merged[t["ticket_no"]] = t  # later files overwrite earlier
    tickets = sorted(merged.values(), key=lambda t: (t["sold_at"] or "", int(t["ticket_no"])))
    lines = [l for t in tickets for l in t["lines"]]
    dates = [t["sold_at"] for t in tickets if t["sold_at"]]

    def total(method):
        return sum(p["amount"] for t in tickets for p in t["payments"] if p["method"] == method)

    return {
        "source_files": [os.path.basename(p) for p in ordered],
        "tickets": tickets,
        "summary": {
            "tickets": len(tickets), "lines": len(lines),
            "refunds": sum(1 for l in lines if l["kind"] == "refund"),
            "first_date": min(dates) if dates else None, "last_date": max(dates) if dates else None,
            "net": sum((l["net"] or 0) * (-1 if l["kind"] == "refund" else 1) for l in lines),
            "card": total("card"), "visa": total("visa"),
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("-o", "--output", required=True)
    args = ap.parse_args(argv)
    payload = parse_files(args.files)
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(json.dumps(payload["summary"], ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
