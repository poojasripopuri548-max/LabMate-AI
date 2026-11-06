"""Unit tests for Module 3 - maintenance priority analysis (+ optional ML evaluator)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ai_module import LabMateDataError, analyze_maintenance, evaluate_failure_model  # noqa: E402

AS_OF = "2026-11-05"


def make_inventory():
    """TEST DATA with hand-computed scores (see comments)."""
    return pd.DataFrame([
        # sev Critical 40 + 5 complaints 20 + >=30 days 20 + Out of Service 20 = 100 -> High
        dict(equipment_id="M1", equipment_name="Broken Scope", damage_count=5, maintenance_status="Out of Service",
             damage_severity="Critical", damage_reported_date="2026-09-01"),
        # sev Medium 20 + 2 complaints 8 + 15 days 10 + Pending Repair 16 = 54 -> Medium
        dict(equipment_id="M2", equipment_name="Slow PSU", damage_count=2, maintenance_status="Pending Repair",
             damage_severity="Medium", damage_reported_date="2026-10-21"),
        # sev Low 10 + 1 complaint 4 + 3 days 2 + Under Maintenance 12 = 28 -> Low
        dict(equipment_id="M3", equipment_name="Minor Meter", damage_count=1, maintenance_status="Under Maintenance",
             damage_severity="Low", damage_reported_date="2026-11-02"),
        # nothing wrong -> 0 -> Low
        dict(equipment_id="M4", equipment_name="Healthy Kit", damage_count=0, maintenance_status="Operational",
             damage_severity="None", damage_reported_date=None),
    ])


class TestMaintenanceScoring(unittest.TestCase):
    def setUp(self):
        self.res = analyze_maintenance(make_inventory(), as_of_date=AS_OF)
        self.by_id = {e["equipment_id"]: e for e in self.res["equipment"]}

    def test_hand_computed_scores_and_priorities(self):
        self.assertAlmostEqual(self.by_id["M1"]["priority_score"], 100.0)
        self.assertAlmostEqual(self.by_id["M2"]["priority_score"], 54.0)
        self.assertAlmostEqual(self.by_id["M3"]["priority_score"], 28.0)
        self.assertAlmostEqual(self.by_id["M4"]["priority_score"], 0.0)
        self.assertEqual([self.by_id[k]["priority"] for k in ("M1", "M2", "M3", "M4")],
                         ["High", "Medium", "Low", "Low"])

    def test_breakdown_sums_to_score(self):
        for e in self.res["equipment"]:
            self.assertAlmostEqual(sum(e["score_breakdown"].values()), e["priority_score"], places=1)
            self.assertTrue(0 <= e["priority_score"] <= 100)
            self.assertIn("Score", e["explanation"])
            self.assertTrue(e["suggested_actions"])

    def test_ranking_and_immediate_attention(self):
        ranks = [e["equipment_id"] for e in self.res["equipment"]]
        self.assertEqual(ranks, ["M1", "M2", "M3", "M4"])
        self.assertEqual([e["equipment_id"] for e in self.res["immediate_attention"]], ["M1"])
        s = self.res["summary"]
        self.assertEqual((s["high_count"], s["medium_count"], s["low_count"]), (1, 1, 2))

    def test_days_pending(self):
        self.assertEqual(self.by_id["M1"]["days_pending"], 65)
        self.assertEqual(self.by_id["M2"]["days_pending"], 15)
        self.assertEqual(self.by_id["M4"]["days_pending"], 0)

    def test_method_is_declared_rule_based(self):
        self.assertIn("not a predictive", self.res["scoring_method"]["type"])

    def test_missing_values(self):
        df = make_inventory()
        df.loc[1, "damage_severity"] = None          # complaints>0 -> assumed Medium, flagged
        df.loc[2, "damage_reported_date"] = None     # days unknown -> 0, flagged
        df.loc[3, "maintenance_status"] = None       # unknown status -> neutral level
        df.loc[0, "damage_count"] = None
        res = analyze_maintenance(df, as_of_date=AS_OF)
        by_id = {e["equipment_id"]: e for e in res["equipment"]}
        self.assertEqual(by_id["M2"]["severity_level"], "Unknown")
        self.assertIn("assumed Medium", by_id["M2"]["explanation"])
        self.assertIsNone(by_id["M3"]["days_pending"])
        self.assertAlmostEqual(by_id["M4"]["score_breakdown"]["status"], 6.0)
        self.assertEqual(by_id["M1"]["complaints"], 0)
        self.assertTrue(res["warnings"])

    def test_status_and_severity_aliases(self):
        df = make_inventory().head(1).copy()
        df["maintenance_status"] = "broken"
        df["damage_severity"] = "SEVERE"
        e = analyze_maintenance(df, as_of_date=AS_OF)["equipment"][0]
        self.assertEqual(e["maintenance_status"], "Out of Service")
        self.assertEqual(e["severity_level"], "Critical")

    def test_future_report_date_not_negative(self):
        df = make_inventory().head(2).copy()
        df["damage_reported_date"] = "2027-01-01"
        for e in analyze_maintenance(df, as_of_date=AS_OF)["equipment"]:
            self.assertGreaterEqual(e["days_pending"], 0)

    def test_empty_dataset(self):
        for empty in (pd.DataFrame(), []):
            res = analyze_maintenance(empty)
            self.assertEqual(res["status"], "empty_inventory")
            self.assertEqual(res["immediate_attention"], [])

    def test_invalid_input_raises(self):
        with self.assertRaises(LabMateDataError):
            analyze_maintenance(None)
        with self.assertRaises(LabMateDataError):
            analyze_maintenance(make_inventory().drop(columns=["damage_severity"]))
        with self.assertRaises(LabMateDataError):
            analyze_maintenance(make_inventory(), top_n=0)
        with self.assertRaises(LabMateDataError):
            analyze_maintenance(make_inventory(), as_of_date="nonsense")

    def test_json_safe_and_no_mutation(self):
        inv = make_inventory()
        before = inv.copy()
        json.dumps(analyze_maintenance(inv, as_of_date=AS_OF))
        pd.testing.assert_frame_equal(inv, before)


class TestDamageReports(unittest.TestCase):
    def test_reports_override_table_fields(self):
        reports = pd.DataFrame([
            dict(equipment_id="M4", report_date="2026-10-06", severity="High", resolved_date=None),
            dict(equipment_id="M4", report_date="2026-10-20", severity="Low", resolved_date=None),
            dict(equipment_id="M4", report_date="2026-08-01", severity="Critical", resolved_date="2026-08-05"),
        ])
        res = analyze_maintenance(make_inventory(), reports, as_of_date=AS_OF)
        m4 = {e["equipment_id"]: e for e in res["equipment"]}["M4"]
        self.assertEqual(m4["data_source"], "damage_reports")
        self.assertEqual(m4["complaints"], 3)
        self.assertEqual(m4["severity_level"], "High")        # highest OPEN severity
        self.assertEqual(m4["days_pending"], 30)              # oldest open: Oct 6 -> Nov 5
        m1 = {e["equipment_id"]: e for e in res["equipment"]}["M1"]
        self.assertEqual(m1["data_source"], "equipment_table")

    def test_resolved_reports_have_no_pending_days(self):
        reports = pd.DataFrame([dict(equipment_id="M1", report_date="2026-01-01",
                                     severity="Low", resolved_date="2026-01-03")])
        m1 = {e["equipment_id"]: e for e in analyze_maintenance(make_inventory(), reports, AS_OF)["equipment"]}["M1"]
        self.assertEqual(m1["days_pending"], 0)

    def test_bad_reports_are_ignored_with_warning(self):
        reports = pd.DataFrame([dict(equipment_id="GHOST", report_date="2026-10-01"),
                                dict(equipment_id="M1", report_date="bad-date")])
        res = analyze_maintenance(make_inventory(), reports, as_of_date=AS_OF)
        self.assertTrue(any("ignored" in w for w in res["warnings"]))

    def test_reports_missing_columns_raise(self):
        with self.assertRaises(LabMateDataError):
            analyze_maintenance(make_inventory(), pd.DataFrame([dict(equipment_id="M1")]))


class TestMaintenanceOutputs(unittest.TestCase):
    def test_files_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            res = analyze_maintenance(make_inventory(), as_of_date=AS_OF, output_dir=tmp,
                                      report_label="TEST DATA")
            out = res["outputs"]
            self.assertTrue(Path(out["report"]).exists() and Path(out["table"]).exists())
            self.assertEqual(len(out["charts"]), 2)
            self.assertIn("Not a predictive model", Path(out["report"]).read_text(encoding="utf-8"))

    def test_sample_data_end_to_end(self):
        eq = pd.read_csv(ROOT / "data" / "sample_equipment_data.csv")
        res = analyze_maintenance(eq, as_of_date=AS_OF)
        high = {e["equipment_id"] for e in res["immediate_attention"]}
        self.assertEqual(high, {"LAB-005", "LAB-007", "LAB-008", "LAB-022"})
        self.assertEqual(res["equipment"][0]["equipment_id"], "LAB-008")


class TestOptionalFailureModel(unittest.TestCase):
    """The ML routine must refuse tiny data and evaluate honestly on enough data.
    The data below is SYNTHETIC and exists only to test the code path."""

    @staticmethod
    def synthetic(n):
        rng = np.random.default_rng(0)
        usage = rng.integers(0, 100, n)
        damage = rng.integers(0, 6, n)
        p = 1 / (1 + np.exp(-(0.03 * usage + 0.5 * damage - 3.5)))
        fail = (rng.random(n) < p).astype(int)
        return pd.DataFrame({"usage_count": usage, "damage_count": damage,
                             "record_date": pd.date_range("2024-01-01", periods=n, freq="D"),
                             "failed_within_90d": fail})

    def test_insufficient_data_refused(self):
        res = evaluate_failure_model(pd.read_csv(ROOT / "data" / "sample_equipment_data.csv"))
        self.assertEqual(res["status"], "insufficient_data")
        self.assertIn("rule-based", res["message"])
        self.assertEqual(evaluate_failure_model(self.synthetic(40))["status"], "insufficient_data")
        self.assertEqual(evaluate_failure_model(pd.DataFrame())["status"], "insufficient_data")

    def test_runs_with_enough_data_and_reports_test_metrics(self):
        res = evaluate_failure_model(self.synthetic(600))
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["n_train"] + res["n_test"], 600)
        m = res["metrics_on_test_set"]
        for key in ("accuracy", "precision", "recall", "f1", "baseline_majority_class_accuracy"):
            self.assertTrue(0 <= m[key] <= 1)
        self.assertIn("baseline_majority_class_accuracy", m)   # honest comparison always included

    def test_chronological_split_has_no_overlap(self):
        res = evaluate_failure_model(self.synthetic(600), time_col="record_date")
        self.assertEqual(res["split"], "chronological")
        self.assertEqual(res["n_train"], 450)
        self.assertEqual(res["n_test"], 150)

    def test_label_leakage_rejected(self):
        with self.assertRaises(LabMateDataError):
            evaluate_failure_model(self.synthetic(600), feature_cols=["usage_count", "failed_within_90d"])

    def test_missing_label_column_is_insufficient_data(self):
        res = evaluate_failure_model(self.synthetic(600).drop(columns=["failed_within_90d"]))
        self.assertEqual(res["status"], "insufficient_data")


if __name__ == "__main__":
    unittest.main()
