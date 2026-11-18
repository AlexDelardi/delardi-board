"""Invented data only. Run: python3 -m unittest tools.tests.test_stock_enrich_parse"""
import datetime, unittest
from tools import stock_enrich_parse as m

def cost_rows(doc="ZZ0001", date="01.10.2026", items=()):
    rows = [[None, f"Расчет себестоимости партии по документу:\nПоступление товаров и услуг {doc} от {date} 12:00:00"], [],
            [None, "Поставщик:", "ZZ SUPPLIER SPA "], [None, "Договор:", "№ ZZ-1 от 01.09.2026"], [],
            ["1. Фактурная стоимость:"], ["№", "Наименование товара (работ, услуг)", "Количество", "Цена (EUR)", "Сумма (EUR)", "Цена (сум)", "Сумма (сум)"],
            ["2. Дополнительные расходы на приобретение:"], ["3. Распределение затрат"],
            [None, "Наименование товара (работ, услуг)/ Затраты", "Количество", "Цена (EUR)", "Сумма (EUR)", "Цена (сум)", "Сумма (сум)"]]
    for i, (name, qty, eur, uzs, vat, assay) in enumerate(items, 1):
        landed = (uzs + vat + assay + 10) * qty
        rows += [[str(i), name, qty, None, None, landed / qty, landed],
                 ["1", "Фактурная стоимость поставки", qty, eur, eur * qty, uzs, uzs * qty],
                 ["2", "НДС, оплаченный на таможне", None, None, None, None, vat * qty],
                 ["3", "За опробирование", None, None, None, None, assay * qty],
                 ["4", "Таможенное оформление", None, None, None, None, 6 * qty],
                 ["5", "Таможенный сбор", None, None, None, None, 3 * qty],
                 ["6", "Таможенное оформление", None, None, None, None, 1 * qty]]
    rows.append([None, "Всего себестоимость поставки", None, None, None, None, 1])
    return rows

def piece(serial, article, receipt="7", brand="Zz Atelier"):
    return {"brand": brand, "serial": serial, "article": article, "barcode": "600", "receipt_no": receipt, "data": {}}

class CostFile(unittest.TestCase):
    def test_header_and_item(self):
        d = m.parse_cost_file(cost_rows(items=[("ZZ Кольцо ZZ-AT-0100 ZZ0090001", 1, 500.0, 6500000.0, 130000.0, 10000.0)]), "/x/zz.xlsx")
        self.assertEqual((d["doc_no"], d["doc_date"], d["supplier"], d["contract"], d["currency"], d["source_file"]),
                         ("ZZ0001", "2026-10-01", "ZZ SUPPLIER SPA", "№ ZZ-1 от 01.09.2026", "EUR", "zz.xlsx"))
        it = d["items"][0]
        self.assertEqual((it["invoice_price"], it["invoice_uzs"], it["customs_vat_uzs"], it["assay_uzs"], it["clearance_uzs"], it["customs_fee_uzs"], it["landed_uzs"], it["fx_rate"]),
                         (500.0, 6500000.0, 130000.0, 10000.0, 7.0, 3.0, 6640010.0, 13000.0))
    def test_quantity_is_per_unit(self):
        it = m.parse_cost_file(cost_rows(items=[("ZZ пара ZZ-AT-0200", 2, 100.0, 1300000.0, 26000.0, 5000.0)]), "z.xlsx")["items"][0]
        self.assertEqual((it["invoice_uzs"], it["customs_vat_uzs"], it["landed_uzs"]), (1300000.0, 26000.0, 1331010.0))
    def test_same_document_twice_keeps_the_fuller_file(self):
        a = m.parse_cost_file(cost_rows(items=[("A ZZ-AT-0100", 1, 1.0, 1.0, 0.0, 0.0)]), "a.xlsx")
        b = m.parse_cost_file(cost_rows(items=[("A ZZ-AT-0100", 1, 1.0, 1.0, 0.0, 0.0), ("B ZZ-AT-0101", 1, 1.0, 1.0, 0.0, 0.0)]), "b.xlsx")
        self.assertEqual([d["source_file"] for d in m.dedupe_docs([a, b])], ["b.xlsx"])

class Matching(unittest.TestCase):
    def docs(self, items, **kw):
        return [m.parse_cost_file(cost_rows(items=items, **kw), "zz.xlsx")]
    def test_serial_in_the_name_is_exact(self):
        c = m.match_costs([piece("ZZ.00.90001", "ZZ-AT-0100")], self.docs([("Кольцо ZZ-AT-0100 zz0090001", 1, 500.0, 6500000.0, 130000.0, 10000.0)]))
        x = c[("Zz Atelier", "ZZ.00.90001")]
        self.assertEqual((x["match_quality"], x["landed_uzs"], x["supplier"], x["currency"]), ("exact", 6640010.0, "ZZ SUPPLIER SPA", "EUR"))
        self.assertIn("1C ZZ0001, 2026-10-01", x["source_file"])
    def test_reference_with_one_price_is_exact_for_every_piece(self):
        c = m.match_costs([piece("S1AAAA", "ZZ-AT-0100"), piece("S2BBBB", "ZZ-AT-0100")],
                          self.docs([("Кольцо ZZ-AT-0100", 1, 500.0, 6500000.0, 130000.0, 10000.0), ("Кольцо ZZ-AT-0100", 1, 500.0, 6500000.0, 130000.0, 10000.0)]))
        self.assertEqual({x["match_quality"] for x in c.values()}, {"exact"}); self.assertEqual(len(c), 2)
    def test_reference_with_two_prices_is_an_estimate_at_the_average(self):
        c = m.match_costs([piece("S1AAAA", "ZZ-AT-0100")],
                          self.docs([("Кольцо ZZ-AT-0100", 1, 500.0, 6000000.0, 0.0, 0.0), ("Кольцо ZZ-AT-0100", 1, 700.0, 8000000.0, 0.0, 0.0)]))
        x = c[("Zz Atelier", "S1AAAA")]
        self.assertEqual((x["match_quality"], x["landed_uzs"], x["invoice_price"]), ("estimated", 7000010.0, 600.0))
    def test_a_piece_that_arrived_long_after_the_document_is_an_estimate(self):
        docs = self.docs([("Кольцо ZZ-AT-0100", 1, 500.0, 6500000.0, 0.0, 0.0)])
        late = m.match_costs([piece("S1AAAA", "ZZ-AT-0100", "9")], docs, {"9": "2027-03-01"})
        near = m.match_costs([piece("S1AAAA", "ZZ-AT-0100", "9")], docs, {"9": "2026-10-20"})
        self.assertEqual((late[("Zz Atelier", "S1AAAA")]["match_quality"], near[("Zz Atelier", "S1AAAA")]["match_quality"]), ("estimated", "exact"))
    def test_no_match_is_no_cost_and_short_codes_never_match(self):
        c = m.match_costs([piece("S1AAAA", "ZZ-AT-0999"), piece("12", "77")], self.docs([("Кольцо 12 77 ZZ-AT-0100", 1, 5.0, 6.0, 0.0, 0.0)]))
        self.assertEqual(c, {})

class Colibri(unittest.TestCase):
    def test_stock_report_and_arrival_dates(self):
        head = ["Бренд", "Линия продукции", "Артикул", "Серийный номер", "Приход №", "Штрих Код", "НДС", "Состав"]
        rows = [["Stock"], head, ["Zz Atelier", "Кольцо", "ZZ-AT-0100", "ZZ.00.90001", 7.0, 6000000000017.0, 0, None], [None] * 8,
                ["Zz Atelier", "Кольцо", "ZZ-AT-0100", None, 7, 1, 0, None]]
        p = m.parse_stock_report(rows, "s.xlsx")
        self.assertEqual(len(p), 1)
        self.assertEqual((p[0]["serial"], p[0]["barcode"], p[0]["receipt_no"]), ("ZZ.00.90001", "6000000000017", "7"))
        self.assertEqual(p[0]["data"]["НДС"], 0); self.assertNotIn("Состав", p[0]["data"])
        sf = [["x"], ["Год", "Бренд", "Артикул", "Номер накладной прихода", "Дата прихода"],
              [2026, "Zz", "A", "7", datetime.datetime(2026, 10, 14)], [2026, "Zz", "B", 8, datetime.datetime(2026, 1, 1)], [2026, "Zz", "C", 8, datetime.datetime(2026, 2, 1)]]
        self.assertEqual(m.parse_sf(sf), {"7": "2026-10-14"})

if __name__ == "__main__":
    unittest.main()
