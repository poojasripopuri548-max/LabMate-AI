"""Unit tests for Module 2 - usage analysis."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ai_module import LabMateDataError, analyze_usage  # noqa: E402


def make_inventory():
    """TEST DATA: 6 items with known usage."""
    rows = [
        ("U1", "Scope A", "Optics", 2, 1, 40),
        ("U2", "Scope B", "Optics", 4, 4, 20),
        ("U3", "Meter C", "Electronics", 10, 9, 10),
        ("U4", "Meter D", "Electronics", 10, 10, 5),
        ("U5", "Rare E", "Electronics", 1, 1, 0),
        ("U6", "Rare F", "Optics", 1, 1, 0),
    ]
    return pd.DataFrame(rows, columns=["equipment_id", "equipment_name", "category",
                                       "total_quantity", "available_quantity", "usage_count"])


def make_records():
    """Hand-checkable records for a 10-day period 2026-01-01..2026-01-10."""
    return pd.DataFrame([
        # U1 (2 units): 5 days + 3 days = 8 unit-days -> 8 / (2*10) = 40 %
        dict(equipment_id="U1", issue_date="2026-01-01", return_date="2026-01-05", quantity=1),
        dict(equipment_id="U1", issue_date="2026-01-08", return_date="2026-01-10", quantity=1),
        # U3 (10 units): 2 units x 1 day (same-day) = 2 unit-days -> 2/(10*10) = 2 %
        dict(equipment_id="U3", issue_date="2026-01-03", return_date="2026-01-03", quantity=2),
        # outside period -> ignored for counts
        dict(equipment_id="U3", issue_date="2025-12-01", return_date="2025-12-02", quantity=1),
    ])


class TestUsageSummaryMode(unittest.TestCase):
    def test_classification(self):
        res = analyze_usage(make_inventory(), as_of_date="2026-02-01")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["data_source"], "usage_count_column")
        names = lambda k: {e["equipment_id"] for e in res[k]}
        self.assertEqual(names("zero_usage"), {"U5", "U6"})
        self.assertIn("U1", names("frequently_used"))
        self.assertIn("U4", names("underutilized"))

    def test_statistics(self):
        res = analyze_usage(make_inventory())
        s = res["summary"]
        self.assertEqual(s["total_usage"], 75)
        self.assertEqual(s["total_equipment"], 6)
        self.assertEqual(s["zero_usage_count"], 2)
        top = res["equipment"][0]
        self.assertEqual(top["equipment_id"], "U1")
        self.assertAlmostEqual(top["usage_share_pct"], round(40 / 75 * 100, 2))

    def test_utilisation_not_invented_without_time_data(self):
        res = analyze_usage(make_inventory())
        self.assertFalse(res["summary"]["utilization_available"])
        self.assertTrue(all(e["utilization_pct"] is None for e in res["equipment"]))
        self.assertTrue(any(s["type"] == "data_quality" for s in res["suggestions"]))

    def test_missing_and_negative_values(self):
        df = make_inventory()
        df.loc[0, "usage_count"] = None
        df.loc[1, "usage_count"] = -5
        df.loc[2, "total_quantity"] = None
        res = analyze_usage(df)
        self.assertEqual(res["status"], "ok")
        by_id = {e["equipment_id"]: e for e in res["equipment"]}
        self.assertEqual(by_id["U1"]["usage_count"], 0)
        self.assertEqual(by_id["U2"]["usage_count"], 0)
        self.assertIsNone(by_id["U3"]["usage_per_unit"])
        self.assertTrue(res["warnings"])

    def test_empty_dataset(self):
        for empty in (pd.DataFrame(), []):
            res = analyze_usage(empty)
            self.assertEqual(res["status"], "empty_inventory")
            self.assertEqual(res["equipment"], [])

    def test_all_zero_usage(self):
        df = make_inventory()
        df["usage_count"] = 0
        res = analyze_usage(df)
        self.assertEqual(res["summary"]["zero_usage_count"], 6)
        self.assertEqual(res["summary"]["total_usage"], 0)
        self.assertIsNone(res["summary"]["top3_usage_share_pct"])

    def test_missing_required_columns_raise(self):
        with self.assertRaises(LabMateDataError):
            analyze_usage(make_inventory().drop(columns=["usage_count"]))
        with self.assertRaises(LabMateDataError):
            analyze_usage(make_inventory().drop(columns=["category"]))
        with self.assertRaises(LabMateDataError):
            analyze_usage(None)

    def test_bad_parameters_raise(self):
        inv = make_inventory()
        with self.assertRaises(LabMateDataError):
            analyze_usage(inv, top_n=0)
        with self.assertRaises(LabMateDataError):
            analyze_usage(inv, dormant_days=-1)
        with self.assertRaises(LabMateDataError):
            analyze_usage(inv, low_quantile=0.9, frequent_quantile=0.5)
        with self.assertRaises(LabMateDataError):
            analyze_usage(inv, as_of_date="not-a-date")


class TestUsageRecordMode(unittest.TestCase):
    def test_counts_and_known_utilisation(self):
        res = analyze_usage(make_inventory(), make_records(),
                            period_start="2026-01-01", period_end="2026-01-10")
        self.assertEqual(res["data_source"], "issue_records")
        self.assertEqual(res["period"]["days"], 10)
        by_id = {e["equipment_id"]: e for e in res["equipment"]}
        self.assertEqual(by_id["U1"]["usage_count"], 2)
        self.assertEqual(by_id["U3"]["usage_count"], 1)          # Dec 2025 record excluded
        self.assertAlmostEqual(by_id["U1"]["utilization_pct"], 40.0)
        self.assertAlmostEqual(by_id["U3"]["utilization_pct"], 2.0)
        self.assertAlmostEqual(by_id["U2"]["utilization_pct"], 0.0)
        self.assertTrue(res["summary"]["utilization_available"])

    def test_records_override_usage_count_column(self):
        res = analyze_usage(make_inventory(), make_records(),
                            period_start="2026-01-01", period_end="2026-01-10")
        self.assertEqual(res["summary"]["total_usage"], 3)       # not the 75 in the column

    def test_open_record_runs_to_period_end(self):
        rec = pd.DataFrame([dict(equipment_id="U1", issue_date="2026-01-06", return_date=None)])
        res = analyze_usage(make_inventory(), rec, "2026-01-01", "2026-01-10")
        u1 = [e for e in res["equipment"] if e["equipment_id"] == "U1"][0]
        self.assertAlmostEqual(u1["utilization_pct"], 5 / (2 * 10) * 100)   # Jan 6-10 = 5 days
        self.assertTrue(any("no return_date" in w for w in res["warnings"]))

    def test_invalid_records_are_dropped_with_warnings(self):
        rec = pd.DataFrame([
            dict(equipment_id="U1", issue_date="garbage", return_date="2026-01-02"),
            dict(equipment_id="U1", issue_date="2026-01-05", return_date="2026-01-02"),   # return < issue
            dict(equipment_id="GHOST", issue_date="2026-01-05", return_date="2026-01-06"),
            dict(equipment_id="U2", issue_date="2026-01-05", return_date="2026-01-06"),
        ])
        res = analyze_usage(make_inventory(), rec, "2026-01-01", "2026-01-10")
        self.assertEqual(res["summary"]["total_usage"], 1)
        self.assertEqual(len(res["warnings"]), 3)

    def test_period_inferred_with_warning(self):
        res = analyze_usage(make_inventory(), make_records())
        self.assertTrue(any("inferred" in w for w in res["warnings"]))
        self.assertEqual(res["period"]["start"], "2025-12-01")

    def test_empty_records_with_period_means_zero_usage(self):
        res = analyze_usage(make_inventory(), [], "2026-01-01", "2026-01-31")
        self.assertEqual(res["summary"]["total_usage"], 0)
        self.assertEqual(res["summary"]["zero_usage_count"], 6)

    def test_empty_records_without_period_falls_back(self):
        res = analyze_usage(make_inventory(), pd.DataFrame())
        self.assertEqual(res["data_source"], "usage_count_column")
        self.assertTrue(res["warnings"])

    def test_invalid_period_raises(self):
        with self.assertRaises(LabMateDataError):
            analyze_usage(make_inventory(), make_records(), "2026-02-01", "2026-01-01")

    def test_records_missing_columns_raise(self):
        with self.assertRaises(LabMateDataError):
            analyze_usage(make_inventory(), pd.DataFrame([dict(equipment_id="U1")]), "2026-01-01", "2026-01-10")

    def test_utilisation_capped_at_100(self):
        rec = pd.DataFrame([dict(equipment_id="U1", issue_date="2026-01-01",
                                 return_date="2026-01-10", quantity=5)])
        res = analyze_usage(make_inventory(), rec, "2026-01-01", "2026-01-10")
        u1 = [e for e in res["equipment"] if e["equipment_id"] == "U1"][0]
        self.assertEqual(u1["utilization_pct"], 100.0)
        self.assertTrue(any("100%" in w for w in res["warnings"]))


class TestUsageOutputs(unittest.TestCase):
    def test_files_written_and_json_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            res = analyze_usage(make_inventory(), make_records(), "2026-01-01", "2026-01-10",
                                output_dir=tmp, report_label="TEST DATA")
            json.dumps(res)
            out = res["outputs"]
            self.assertTrue(Path(out["report"]).exists())
            self.assertTrue(Path(out["table"]).exists())
            self.assertGreaterEqual(len(out["charts"]), 4)
            for c in out["charts"]:
                self.assertGreater(Path(c).stat().st_size, 1000)
            self.assertIn("TEST DATA", Path(out["report"]).read_text(encoding="utf-8"))

    def test_sample_data_end_to_end(self):
        eq = pd.read_csv(ROOT / "data" / "sample_equipment_data.csv")
        rec = pd.read_csv(ROOT / "data" / "sample_issue_records.csv")
        res = analyze_usage(eq, rec, "2026-08-01", "2026-10-31", as_of_date="2026-11-05")
        self.assertEqual(res["summary"]["total_equipment"], 25)
        self.assertEqual({e["equipment_id"] for e in res["zero_usage"]}, {"LAB-014", "LAB-019"})
        self.assertEqual(res["equipment"][0]["equipment_id"], "LAB-011")
        self.assertTrue(all(0 <= (e["utilization_pct"] or 0) <= 100 for e in res["equipment"]))


if __name__ == "__main__":
    unittest.main()
