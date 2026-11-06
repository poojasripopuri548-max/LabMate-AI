"""Demo runner for the LabMate AI ML module.

Run from the project root::

    python run_demo.py

It loads the SAMPLE DATA in ./data, runs all three AI components, prints
readable summaries and writes charts / reports into ./reports.

This is a demonstration harness only - the real backend imports the three
functions from ``ai_module`` directly (see integration_guide.md).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from ai_module import analyze_maintenance, analyze_usage, recommend_equipment

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
REPORT_DIR = ROOT / "reports"
LABEL = "SAMPLE DATA - illustrative only, not real inventory"
# Fixed dates so the demo output is reproducible.
PERIOD_START, PERIOD_END, AS_OF = "2026-08-01", "2026-10-31", "2026-11-05"


def banner(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def show_recommendations(result: dict) -> None:
    print(f"Query : {result['query_used']}")
    print(f"Status: {result['status']} - {result['message']}")
    print(f"(Unavailable items excluded: {result['excluded_unavailable_count']})")
    for r in result["recommendations"]:
        print(f"  #{r['rank']} {r['equipment_id']}  {r['equipment_name']:<30} "
              f"score={r['relevance_score']:.3f}  [{r['match_strength']}]")
        print(f"      why: {r['explanation']}")
    print(f"NOTE: {result['disclaimer']}")


def demo_recommendation(equipment: pd.DataFrame) -> None:
    banner("MODULE 1 - SMART EQUIPMENT RECOMMENDATION  (" + LABEL + ")")
    print("\n--- Case A: free-text requirement ---")
    show_recommendations(recommend_equipment(
        "need an oscilloscope to view signal waveforms and frequency", equipment, top_n=4))
    print("\n--- Case B: alternatives to an UNAVAILABLE item (LAB-018 Analytical Balance) ---")
    show_recommendations(recommend_equipment(None, equipment, requested_equipment_id="LAB-018", top_n=3))
    print("\n--- Case C: query with no usable match ---")
    show_recommendations(recommend_equipment("xyzzy quantum teleporter", equipment))


def demo_usage(equipment: pd.DataFrame, records: pd.DataFrame) -> None:
    banner("MODULE 2 - EQUIPMENT USAGE ANALYSIS  (" + LABEL + ")")
    res = analyze_usage(equipment, records, period_start=PERIOD_START, period_end=PERIOD_END,
                        as_of_date=AS_OF, output_dir=REPORT_DIR, report_label=LABEL)
    p, s = res["period"], res["summary"]
    print(f"Data source: {res['data_source']} | period {p['start']} to {p['end']} ({p['days']} days)")
    print(f"Equipment: {s['total_equipment']} | issue events: {s['total_usage']} | "
          f"mean utilisation: {s['mean_utilization_pct']}%")
    print("\nTop 5 by usage:")
    for e in res["equipment"][:5]:
        print(f"  {e['equipment_id']}  {e['equipment_name']:<30} usage={e['usage_count']:<3} "
              f"share={e['usage_share_pct']:>5}%  utilisation={e['utilization_pct']}%")
    print("\nUnderutilized:", ", ".join(e["equipment_name"] for e in res["underutilized"]) or "none")
    print("Zero usage   :", ", ".join(e["equipment_name"] for e in res["zero_usage"]) or "none")
    print("\nSuggestions:")
    for sug in res["suggestions"]:
        print(f"  - [{sug['type']}] {sug['message']}")
    for w in res["warnings"]:
        print(f"  (data warning) {w}")
    print("\nFiles written:", res["outputs"]["report"])

    print("\n--- Fallback mode: no issue records (usage_count column only) ---")
    fb = analyze_usage(equipment, as_of_date=AS_OF)
    print(f"Data source: {fb['data_source']} | utilisation available: "
          f"{fb['summary']['utilization_available']}")
    print(f"Note: {fb['summary']['utilization_note']}")


def demo_maintenance(equipment: pd.DataFrame) -> None:
    banner("MODULE 3 - MAINTENANCE PRIORITY ANALYSIS  (" + LABEL + ")")
    res = analyze_maintenance(equipment, as_of_date=AS_OF, output_dir=REPORT_DIR, report_label=LABEL)
    s = res["summary"]
    print(f"High: {s['high_count']} | Medium: {s['medium_count']} | Low: {s['low_count']} | "
          f"reference date {s['as_of_date']}")
    print("Method:", res["scoring_method"]["type"])
    print("\nTop 7 by priority score:")
    for e in res["equipment"][:7]:
        print(f"  #{e['rank']} {e['equipment_id']} {e['equipment_name']:<28} "
              f"{e['priority_score']:>5}  {e['priority']:<6} ({e['maintenance_status']})")
    print("\nImmediate attention:")
    for e in res["immediate_attention"]:
        print(f"  * {e['equipment_id']} {e['equipment_name']}: {e['explanation']}")
        for a in e["suggested_actions"]:
            print(f"      - {a}")
    print("\nFiles written:", res["outputs"]["report"])


def main() -> int:
    eq_path, rec_path = DATA_DIR / "sample_equipment_data.csv", DATA_DIR / "sample_issue_records.csv"
    for p in (eq_path, rec_path):
        if not p.exists():
            print(f"ERROR: missing data file {p}", file=sys.stderr)
            return 1
    equipment, records = pd.read_csv(eq_path), pd.read_csv(rec_path)
    print(f"*** {LABEL} ***")
    print(f"Loaded {len(equipment)} equipment rows and {len(records)} issue records.")
    REPORT_DIR.mkdir(exist_ok=True)
    demo_recommendation(equipment)
    demo_usage(equipment, records)
    demo_maintenance(equipment)
    banner("DONE - charts, Markdown reports and CSV tables are in ./reports")
    return 0


if __name__ == "__main__":
    sys.exit(main())
