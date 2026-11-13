"""Tests for tools/colibri_sales_parse.py. Fixtures are synthetic (invented values)."""
import datetime
import glob
import os
import sys

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import colibri_sales_parse as P  # noqa: E402

HEADER = ["№", "Дата", "Наимен", "Код товара", "Шт", "Разм", "Продавец", "Без скидки",
          "Текущая", "Скидка", None, "Со скидкой", "СК", "Оплата", "Карта", "VIP", "Нак",
          "Примечание", "Бренд", "Код цвета", "Серийный номер"]
DATE = "2026-10-05"


def item(no, article="A1 ", colour="", net=1000, qty=1, name="Item", note="", serial="",
         brand="Brand", seller="Seller", date=DATE):
    d = datetime.datetime.strptime(date, "%Y-%m-%d")
    return [no, d, name, article, qty, "", seller, net, net, None, None, net, "", None, None,
            None, None, note, brand, colour, serial]


def pay(no, text, note="", date=DATE):
    d = datetime.datetime.strptime(date, "%Y-%m-%d")
    return [no, d] + [None] * 11 + [text, None, None, None, note, None, None, None]


def make(path, rows, card=0, visa=0):
    wb = openpyxl.Workbook()
    wb.active.title = "Дневной отчет"
    ws = wb.create_sheet("Дневной отчет 2")
    for _ in range(5):
        ws.append([None] * 21)
    ws.append(HEADER)
    for r in rows:
        ws.append(r)
    ws.append([])
    ws.append(["И", "И", 0, "КАР", card, "VISA", visa])
    ws.append(["Brand", "Brand", 1, 2])
    wb.save(path)
    return str(path)


def one(tmp_path, rows, card=0, visa=0, name="Shop_Отчет_01-Oct-26-09-Nov-26.xlsx"):
    return P.parse_files([make(tmp_path / name, rows, card, visa)])


def test_ticket_with_two_lines_and_card_payment(tmp_path):
    out = one(tmp_path, [item(900, net=1000), item(900, net=2500), pay(900, "кар")], card=3500)
    assert len(out["tickets"]) == 1
    t = out["tickets"][0]
    assert t["ticket_no"] == "900"
    assert t["sold_at"] == DATE
    assert [l["line_no"] for l in t["lines"]] == [1, 2]
    assert t["payments"] == [{"method": "card", "amount": 3500, "raw": "кар"}]
    assert out["summary"]["tickets"] == 1 and out["summary"]["lines"] == 2
    assert out["summary"]["card"] == 3500


def test_split_payment_amount(tmp_path):
    out = one(tmp_path, [item(901, net=26450000), pay(901, "vis(26077607.00)")], visa=26077607)
    assert out["tickets"][0]["payments"] == [
        {"method": "visa", "amount": 26077607.0, "raw": "vis(26077607.00)"}]


def test_blank_payment_gives_no_payment_row(tmp_path):
    out = one(tmp_path, [item(902), pay(902, "")])
    assert out["tickets"][0]["payments"] == []


def test_refund_row(tmp_path):
    out = one(tmp_path, [item(903, qty=-1, net=-87500000), pay(903, "")])
    line = out["tickets"][0]["lines"][0]
    assert line["kind"] == "refund" and line["qty"] == 1 and line["net"] == 87500000
    assert out["summary"]["refunds"] == 1


@pytest.mark.parametrize("raw,colour,article,col_out", [
    ("345512 WG ", "WG", "345512", "WG"),
    ("OR057#..4.3ORLU PG", "PG", "OR057#..4.3ORLU", "PG"),
    ("GC2.0-A-02 ", "", "GC2.0-A-02", None),
    ("WR1013-B-WG-Inner, SBT WG", "WG", "WR1013-B-WG-Inner, SBT", "WG"),
])
def test_article_and_colour_split(tmp_path, raw, colour, article, col_out):
    out = one(tmp_path, [item(904, article=raw, colour=colour), pay(904, "")])
    line = out["tickets"][0]["lines"][0]
    assert line["article"] == article and line["colour"] == col_out


def test_article_not_split_when_suffix_differs(tmp_path):
    out = one(tmp_path, [item(904, article="AB 12 ", colour="WG"), pay(904, "")])
    assert out["tickets"][0]["lines"][0]["article"] == "AB 12"


@pytest.mark.parametrize("raw,client,note", [
    ("Иванов  И.  Примечание: оплата VISA", "Иванов  И.", "оплата VISA"),
    ("   Примечание: тест", None, "тест"),
    ("Петров П.  ", "Петров П.", None),
])
def test_note_split(tmp_path, raw, client, note):
    out = one(tmp_path, [item(905, note=raw), pay(905, "", note=raw)])
    t = out["tickets"][0]
    assert t["client_raw"] == client and t["note"] == note


def test_trailing_spaces_trimmed(tmp_path):
    out = one(tmp_path, [item(906, serial="ZZ.00.12345 ", brand=""), pay(906, "")])
    line = out["tickets"][0]["lines"][0]
    assert line["serial_raw"] == "ZZ.00.12345"
    assert line["brand_raw"] is None and line["sk"] is None and line["vip"] is None


def test_bare_vis_payment_gets_ticket_net(tmp_path):
    out = one(tmp_path, [item(910, net=700), item(910, net=300), pay(910, "vis")], visa=1000)
    assert out["tickets"][0]["payments"] == [{"method": "visa", "amount": 1000, "raw": "vis"}]


def test_line_seller_and_ticket_seller(tmp_path):
    out = one(tmp_path, [item(911, seller="Ann "), item(911, seller="Bob"), pay(911, "")])
    t = out["tickets"][0]
    assert [l["seller_raw"] for l in t["lines"]] == ["Ann", "Bob"]
    assert t["seller_raw"] == "Ann"


def test_footer_with_repeated_labels(tmp_path):
    f = make(tmp_path / "Shop_X_01-Oct-26-09-Nov-26.xlsx", [item(912, net=123), pay(912, "кар")])
    wb = openpyxl.load_workbook(f)
    ws = wb["Дневной отчет 2"]
    for row in ws.iter_rows():
        if "КАР" in [c.value for c in row]:
            for c in row:
                c.value = None
            for i, v in enumerate(["И", "И", 0, "КАР", "КАР", 123, "VISA", "VISA", 0], 1):
                row[0].parent.cell(row=row[0].row, column=i, value=v)
    wb.save(f)
    assert P.parse_files([f])["summary"]["card"] == 123


def test_footer_without_numbers_exits_cleanly(tmp_path):
    f = make(tmp_path / "Shop_X_01-Oct-26-09-Nov-26.xlsx", [item(913), pay(913, "")])
    wb = openpyxl.load_workbook(f)
    ws = wb["Дневной отчет 2"]
    for row in ws.iter_rows():
        if "КАР" in [c.value for c in row]:
            for c in row:
                if isinstance(c.value, (int, float)):
                    c.value = None
    wb.save(f)
    with pytest.raises(SystemExit):
        P.parse_files([f])


def test_overlapping_files_latest_wins(tmp_path):
    a = make(tmp_path / "Shop_X_01-Oct-26-09-Nov-26.xlsx",
             [item(907, net=1000), pay(907, "кар")], card=1000)
    b = make(tmp_path / "Shop_X_01-Nov-26-12-Nov-26.xlsx",
             [item(907, net=2000), pay(907, "кар")], card=2000)
    for order in ([a, b], [b, a]):
        out = P.parse_files(order)
        assert len(out["tickets"]) == 1
        t = out["tickets"][0]
        assert t["lines"][0]["net"] == 2000
        assert t["source_file"] == "Shop_X_01-Nov-26-12-Nov-26.xlsx"


def test_footer_mismatch_exits(tmp_path):
    f = make(tmp_path / "Shop_X_01-Oct-26-09-Nov-26.xlsx",
             [item(908, net=1000), pay(908, "кар")], card=500)
    with pytest.raises(SystemExit):
        P.main([f, "-o", str(tmp_path / "out.json")])


def test_cli_writes_payload(tmp_path, capsys):
    f = make(tmp_path / "Shop_X_01-Oct-26-09-Nov-26.xlsx",
             [item(909, net=1000), pay(909, "кар")], card=1000)
    out = tmp_path / "out.json"
    P.main([f, "-o", str(out)])
    assert out.exists() and "tickets" in capsys.readouterr().out


def with_date(row, value):
    """The row with its Дата cell replaced by value as written (text, date or datetime)."""
    return [row[0], value] + row[2:]


@pytest.mark.parametrize("cell", [
    datetime.datetime(2026, 10, 5, 14, 30), datetime.date(2026, 10, 5), "05.10.2026", " 2026-10-05 "])
def test_date_cells_become_iso(tmp_path, cell):
    out = one(tmp_path, [with_date(item(920), cell), with_date(pay(920, ""), cell)])
    assert out["tickets"][0]["sold_at"] == "2026-10-05"


@pytest.mark.parametrize("cell", ["10/05/2026", "5.10.26", "2026-13-01", "31.02.2026", "вчера"])
def test_unreadable_text_date_exits(tmp_path, cell):
    with pytest.raises(SystemExit, match="date"):
        one(tmp_path, [with_date(item(921), cell), pay(921, "")])


def test_one_ticket_number_on_two_dates_exits(tmp_path):
    rows = [item(922, date="2026-10-05"), item(922, date="2026-10-06"), pay(922, "", date="2026-10-06")]
    with pytest.raises(SystemExit, match="922"):
        one(tmp_path, rows)


@pytest.mark.parametrize("text, amount", [
    ("кар(1,500,000)", 1500000), ("кар(1 500 000)", 1500000), ("vis( 1 500 000.50 )", 1500000.5),
    ("vis(1,500,000.50)", 1500000.5), ("кар(1\u00a0500\u00a0000)", 1500000), ("vis(26077607.00)", 26077607)])
def test_payment_amount_with_thousands_separators(tmp_path, text, amount):
    card = amount if text.startswith("кар") else 0
    out = one(tmp_path, [item(923, net=2000000), pay(923, text)], card=card, visa=amount - card)
    assert out["tickets"][0]["payments"][0]["amount"] == amount


def test_payment_amount_unreadable_exits(tmp_path):
    with pytest.raises(SystemExit, match="payment"):
        one(tmp_path, [item(924), pay(924, "кар(1,50,0)")])


REAL = sorted(glob.glob("/home/claude/s3data/*.xlsx"))


@pytest.mark.skipif(len(REAL) != 4, reason="real exports not available")
def test_real_exports_summary():
    s = P.parse_files(REAL)["summary"]
    assert s["tickets"] == 606 and s["lines"] == 746 and s["refunds"] == 3
    assert s["first_date"] == "2023-01-05" and s["last_date"] == "2026-11-11"
