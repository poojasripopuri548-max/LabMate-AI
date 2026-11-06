"""Unit tests for Module 1 - recommendation (run: python -m unittest discover -s tests -v)."""
import json
import sqlite3
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ai_module import LabMateDataError, recommend_equipment  # noqa: E402


def make_inventory():
    """Small hand-made inventory (TEST DATA)."""
    return pd.DataFrame([
        dict(equipment_id="T1", equipment_name="Compound Microscope", category="Microscopy",
             description="Light microscope for viewing stained cell slides", specifications="1000x",
             available_quantity=3, total_quantity=5, lab_location="Bio Lab"),
        dict(equipment_id="T2", equipment_name="Stereo Microscope", category="Microscopy",
             description="Low power microscope for dissection", specifications="40x",
             available_quantity=2, total_quantity=2, lab_location="Bio Lab"),
        dict(equipment_id="T3", equipment_name="Digital Microscope", category="Microscopy",
             description="USB camera microscope for cell images", specifications="500x",
             available_quantity=0, total_quantity=2, lab_location="Bio Lab"),   # UNAVAILABLE
        dict(equipment_id="T4", equipment_name="Digital Multimeter", category="Electronics",
             description="Measures voltage current resistance", specifications="600V",
             available_quantity=9, total_quantity=10, lab_location="E Lab"),
        dict(equipment_id="T5", equipment_name="Soldering Station", category="Electronics",
             description="Temperature controlled soldering iron", specifications="60W",
             available_quantity=4, total_quantity=4, lab_location="E Lab"),
    ])


class TestRecommendation(unittest.TestCase):
    def test_basic_ranking_and_scores(self):
        res = recommend_equipment("microscope to view cell slides", make_inventory(), top_n=3)
        self.assertEqual(res["status"], "ok")
        recs = res["recommendations"]
        self.assertTrue(1 <= len(recs) <= 3)
        scores = [r["relevance_score"] for r in recs]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertTrue(all(0 <= s <= 1 for s in scores))
        self.assertEqual(recs[0]["equipment_id"], "T1")
        self.assertEqual([r["rank"] for r in recs], list(range(1, len(recs) + 1)))

    def test_unavailable_equipment_is_excluded(self):
        res = recommend_equipment("digital microscope usb camera", make_inventory(), top_n=5)
        ids = [r["equipment_id"] for r in res["recommendations"]]
        self.assertNotIn("T3", ids)
        self.assertEqual(res["excluded_unavailable_count"], 1)

    def test_explanations_and_disclaimer_present(self):
        res = recommend_equipment("microscope", make_inventory())
        self.assertIn("compatib", res["disclaimer"].lower())
        for r in res["recommendations"]:
            self.assertTrue(r["explanation"])
            self.assertIn("verify technical compatibility", r["explanation"])
            self.assertIsInstance(r["matched_terms"], list)

    def test_requested_item_excluded_and_used_as_query(self):
        res = recommend_equipment(None, make_inventory(), requested_equipment_id="T3")
        ids = [r["equipment_id"] for r in res["recommendations"]]
        self.assertNotIn("T3", ids)
        self.assertIn(ids[0], ("T1", "T2"))   # microscopes rank first
        self.assertIn("T3", res["query_used"])

    def test_category_filter(self):
        res = recommend_equipment("measure", make_inventory(), category="electronics")
        self.assertTrue(all(r["category"] == "Electronics" for r in res["recommendations"]))

    def test_no_match_query(self):
        res = recommend_equipment("zzzz qqqq", make_inventory())
        self.assertEqual(res["status"], "no_match")
        self.assertEqual(res["recommendations"], [])

    def test_empty_dataset_returns_status_not_crash(self):
        for empty in (pd.DataFrame(), []):
            res = recommend_equipment("microscope", empty)
            self.assertEqual(res["status"], "empty_inventory")

    def test_all_unavailable(self):
        df = make_inventory()
        df["available_quantity"] = 0
        res = recommend_equipment("microscope", df)
        self.assertEqual(res["status"], "no_available_equipment")

    def test_missing_values_handled(self):
        df = make_inventory()
        df.loc[0, "description"] = None
        df.loc[1, "available_quantity"] = None      # treated as unavailable
        df.loc[2, "specifications"] = float("nan")
        res = recommend_equipment("microscope", df)
        self.assertEqual(res["status"], "ok")
        self.assertNotIn("T2", [r["equipment_id"] for r in res["recommendations"]])
        self.assertTrue(any("unavailable" in w for w in res["warnings"]))

    def test_duplicate_and_blank_ids(self):
        df = pd.concat([make_inventory(), make_inventory().head(1)], ignore_index=True)
        df.loc[len(df)] = df.loc[0]
        df.loc[len(df) - 1, "equipment_id"] = ""
        res = recommend_equipment("microscope", df)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["warnings"]), 2)

    def test_list_of_dicts_input(self):
        res = recommend_equipment("multimeter voltage", make_inventory().to_dict("records"))
        self.assertEqual(res["recommendations"][0]["equipment_id"], "T4")

    def test_sqlite_rows_input(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        make_inventory().to_sql("equipment", con, index=False)
        rows = con.execute("SELECT * FROM equipment").fetchall()
        res = recommend_equipment("soldering", rows)
        self.assertEqual(res["recommendations"][0]["equipment_id"], "T5")
        con.close()

    def test_output_is_json_serialisable(self):
        json.dumps(recommend_equipment("microscope", make_inventory()))

    def test_invalid_inputs_raise(self):
        inv = make_inventory()
        with self.assertRaises(LabMateDataError):
            recommend_equipment("", inv)
        with self.assertRaises(LabMateDataError):
            recommend_equipment(None, inv)
        with self.assertRaises(LabMateDataError):
            recommend_equipment(123, inv)
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", inv, top_n=0)
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", inv, top_n="5")
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", inv, min_score=2)
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", None)
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", "not a table")
        with self.assertRaises(LabMateDataError):
            recommend_equipment("microscope", inv.drop(columns=["description"]))
        with self.assertRaises(LabMateDataError):
            recommend_equipment(None, inv, requested_equipment_id="NOPE")

    def test_does_not_mutate_input(self):
        inv = make_inventory()
        before = inv.copy()
        recommend_equipment("microscope", inv)
        pd.testing.assert_frame_equal(inv, before)

    def test_sample_csv_end_to_end(self):
        df = pd.read_csv(ROOT / "data" / "sample_equipment_data.csv")
        res = recommend_equipment("oscilloscope waveform", df, top_n=3)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["recommendations"][0]["equipment_id"], "LAB-007")
        ids = {r["equipment_id"] for r in res["recommendations"]}
        self.assertFalse(ids & {"LAB-003", "LAB-005", "LAB-008", "LAB-018"})  # unavailable items


if __name__ == "__main__":
    unittest.main()
