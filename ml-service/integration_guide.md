# LabMate AI – Integration Guide (for Backend & Frontend teammates)

The AI/ML module is a **plain Python package** (`ai_module/`). It has no server, no database
connection and no global state. Copy the `ai_module/` folder into the backend project (or add the
`LabMate_AI_ML` folder to `PYTHONPATH`) and import three functions.

```python
from ai_module import recommend_equipment, analyze_usage, analyze_maintenance, LabMateDataError
```
Dependencies: `pip install -r requirements.txt` (pandas, numpy, scikit-learn, matplotlib).

> Sample CSVs in `data/` are **SAMPLE DATA**. Never present them as real inventory.

---

## 1. What the backend passes in

Every function accepts **either** a pandas `DataFrame` **or** a list of dict rows (a list of
`sqlite3.Row` objects also works). Column names are case-insensitive and spaces become underscores
(`"Equipment ID"` → `equipment_id`). Inputs are never modified. Unknown extra columns are ignored.

### 1.1 `equipment` table (all three functions)

| Column | recommend | usage | maintenance | Notes |
|---|:-:|:-:|:-:|---|
| `equipment_id` | ✔ | ✔ | ✔ | unique; blank/duplicate rows are dropped with a warning |
| `equipment_name` | ✔ | ✔ | ✔ | |
| `category` | ✔ | ✔ | optional | |
| `description` | ✔ | – | – | free text |
| `available_quantity` | ✔ | ✔ | optional | ≤ 0 or missing ⇒ unavailable (never recommended) |
| `total_quantity` | optional | ✔ | optional | needed for utilisation % |
| `specifications` | optional | – | – | improves recommendations |
| `lab_location` | optional | optional | optional | |
| `usage_count` | – | ✔ **only if no issue records are passed** | – | |
| `last_used_date` | – | optional | – | `YYYY-MM-DD` |
| `damage_count` | – | – | ✔ | number of complaints |
| `maintenance_status` | – | – | ✔ | Operational / Needs Inspection / Under Maintenance / Pending Repair / Out of Service (common synonyms accepted) |
| `damage_severity` | – | – | ✔ | None / Low / Medium / High / Critical (synonyms: minor, moderate, major, severe) |
| `damage_reported_date` | – | – | optional | date the open problem was first reported → "days pending" |

### 1.2 Optional `issue_records` (usage analysis)
`equipment_id`, `issue_date` required; `return_date` (blank = still issued) and `quantity`
(default 1) optional. When supplied, usage counts and **real utilisation %** come from these
records. Without them the module falls back to `usage_count` and does **not** calculate
utilisation % (it never invents it).

### 1.3 Optional `damage_reports` (maintenance analysis)
`equipment_id`, `report_date` required; `severity` and `resolved_date` (blank = still open)
optional. For equipment that has reports: complaints = number of reports, severity = highest among
open reports, days pending = days since the oldest open report. Other equipment uses the table columns.

---

## 2. How to pass SQLite data

```python
import sqlite3, pandas as pd
from ai_module import recommend_equipment

con = sqlite3.connect("labmate.db")

# Option A – DataFrame (alias columns in SQL if your schema names differ)
equipment = pd.read_sql_query(
    """SELECT id AS equipment_id, name AS equipment_name, category, description,
              total_qty AS total_quantity, available_qty AS available_quantity
       FROM equipment""", con)
result = recommend_equipment("need a microscope for cell slides", equipment, top_n=5)

# Option B – list of rows (no pandas needed in backend code)
con.row_factory = sqlite3.Row
rows = con.execute("SELECT * FROM equipment").fetchall()
result = recommend_equipment("need a microscope for cell slides", rows)
```
Re-query the table for every request so availability is current; the functions are stateless and
fast for hundreds/thousands of rows. (The SQLite-row path is covered by a unit test; the SQL above is a template –
adapt table/column names to your schema.)

---

## 3. Function reference and return format

The field names and structure below are exact; the **numbers are illustrative** (taken from the SAMPLE DATA demo or simplified). All results are **JSON-safe** (`dict`/`list`/`str`/`int`/`float`/`bool`/`None`; dates are
`"YYYY-MM-DD"`), so `json.dumps(result)` or your framework's JSON response works directly.

### 3.1 `recommend_equipment(query, equipment_data, top_n=5, requested_equipment_id=None, category=None, min_score=0.05)`
* `query`: student's text requirement (may be `None` if `requested_equipment_id` is given – "find
  alternatives to this unavailable item").
```jsonc
{
  "status": "ok",            // ok | no_match | empty_inventory | no_available_equipment
  "message": "Found 3 available alternative(s).",
  "query_used": "alternatives to LAB-018 (Analytical Balance)",
  "recommendations": [
    { "rank": 1, "equipment_id": "LAB-025", "equipment_name": "Top Loading Balance",
      "category": "Biology and Chemistry", "lab_location": "Chemistry Lab C-102",
      "available_quantity": 5, "relevance_score": 0.5668,     // cosine similarity 0-1
      "match_strength": "strong text match",                  // strong>=.5, moderate>=.25, else weak
      "matched_terms": ["readability", "weighing", "capacity"],
      "explanation": "Strong text match (cosine similarity 0.57). Shared key terms: ... Text similarity only - verify technical compatibility." }
  ],
  "excluded_unavailable_count": 3,
  "method": "TF-IDF ... + cosine similarity ...",
  "disclaimer": "Relevance scores measure text similarity only. ...",
  "warnings": []
}
```

### 3.2 `analyze_usage(equipment_data, issue_records=None, period_start=None, period_end=None, as_of_date=None, dormant_days=90, top_n=5, output_dir=None, report_label="")`
```jsonc
{
  "status": "ok",                       // ok | empty_inventory
  "data_source": "issue_records",       // or "usage_count_column"
  "period": {"start": "2026-08-01", "end": "2026-10-31", "days": 92},   // null in column mode
  "summary": { "total_equipment": 25, "total_usage": 588, "mean_usage": 23.52, "median_usage": 18.0,
               "max_usage": 72, "frequent_count": 6, "underutilized_count": 6, "zero_usage_count": 2,
               "top3_usage_share_pct": 31.0, "utilization_available": true,
               "mean_utilization_pct": 10.37, "utilization_note": "..." },
  "equipment": [ { "equipment_id": "LAB-011", "equipment_name": "...", "category": "...", "lab_location": "...",
                   "total_quantity": 25, "available_quantity": 18, "usage_count": 72, "usage_share_pct": 12.24,
                   "usage_per_unit": 2.88, "utilization_pct": 7.91,      // null if not computable
                   "last_used_date": "2026-10-31", "days_since_last_use": 5.0,
                   "usage_class": "Frequently used" } ],   // sorted by usage, all items
  "frequently_used": [...], "underutilized": [...], "zero_usage": [...],
  "category_summary": [ {"category": "...", "equipment_items": 8, "total_usage": 250, "zero_usage_items": 1, "mean_utilization_pct": 12.3} ],
  "suggestions": [ {"type": "zero_usage", "message": "...", "equipment_ids": ["LAB-014", "LAB-019"]} ],
  "warnings": ["2 record(s) have no return_date; ..."],
  "outputs": {"report": ".../usage_report.md", "table": ".../usage_equipment_table.csv", "charts": [".../usage_top_equipment.png", "..."]}
}
```
`outputs` is empty unless `output_dir` is passed. Use `report_label="SAMPLE DATA ..."` while demoing.

### 3.3 `analyze_maintenance(equipment_data, damage_reports=None, as_of_date=None, top_n=5, output_dir=None, report_label="")`
```jsonc
{
  "status": "ok",                       // ok | empty_inventory
  "message": "4 item(s) need immediate attention.",
  "summary": {"total_equipment": 25, "high_count": 4, "medium_count": 3, "low_count": 18,
              "mean_priority_score": 25.7, "as_of_date": "2026-11-05"},
  "equipment": [                         // ALL items, sorted by priority_score desc
    { "rank": 1, "equipment_id": "LAB-008", "equipment_name": "Analog Oscilloscope", "category": "...", "lab_location": "...",
      "maintenance_status": "Out of Service", "severity_level": "Critical", "complaints": 4, "days_pending": 51,
      "priority_score": 96.0, "priority": "High",              // High | Medium | Low
      "score_breakdown": {"severity": 40.0, "complaints": 16.0, "days_pending": 20.0, "status": 20.0},
      "requires_immediate_attention": true, "data_source": "equipment_table",
      "explanation": "Score 96.0/100 = severity Critical (40.0) + ...",
      "suggested_actions": ["Escalate to the lab in-charge ...", "..."] } ],
  "immediate_attention": [ ...High-priority items, same shape... ],
  "scoring_method": {"type": "rule-based weighted score (not a predictive ML model)", "weights": {...}, "thresholds": {...}},
  "warnings": [], "outputs": {}
}
```
`days_pending` may be `null` when an item is not operational and has no reported date (counted as 0, noted in `explanation`).

### 3.4 Optional: `evaluate_failure_model(history_df, label_col="failed_within_90d", time_col=None)`
Only worthwhile after months of real failure history. Returns `{"status": "insufficient_data", ...}`
unless ≥150 rows and ≥20 examples of each class exist. Not needed for the hackathon demo.

---

## 4. Error handling contract

| Situation | Behaviour |
|---|---|
| Empty table / empty list | **No exception**; `status` = `"empty_inventory"` (usage/maintenance) with empty lists |
| No available items / no text overlap | `status` = `"no_available_equipment"` / `"no_match"` |
| Missing required column, bad argument, bad date, `None` input | raises `LabMateDataError` (subclass of `ValueError`) with a readable message |
| Dirty rows (blank IDs, duplicates, negative or NaN numbers, bad dates) | cleaned/ignored; a note is added to `warnings` |

```python
try:
    result = analyze_maintenance(rows)
except LabMateDataError as exc:
    return {"error": str(exc)}, 400     # bad input from our own code → fix the query/columns
```

---

## 5. Example backend endpoints (sketch – adapt to your framework; not executed in the module's tests)

```python
# Flask-style pseudo-code
@app.get("/api/ai/recommend")
def api_recommend():
    rows = db.fetch_all_equipment()                 # list of dicts / sqlite3.Row
    return jsonify(recommend_equipment(request.args["q"], rows, top_n=5))

@app.get("/api/ai/usage")
def api_usage():
    return jsonify(analyze_usage(db.fetch_all_equipment(), db.fetch_issue_records(),
                                 period_start=request.args.get("from"),
                                 period_end=request.args.get("to")))

@app.get("/api/ai/maintenance")
def api_maintenance():
    return jsonify(analyze_maintenance(db.fetch_all_equipment()))
```
Serving charts: pass `output_dir="static/ai_reports"` and expose `result["outputs"]["charts"]`
as static files – or render your own charts in the frontend from `result["equipment"]`
(recommended for interactivity; the PNGs are for reports/demos).

---

## 6. Frontend display suggestions

| Screen | Use these fields |
|---|---|
| Recommendation panel | Cards from `recommendations`: name, `relevance_score` as a bar (label "Text match", **not** "compatibility"), `match_strength` badge, `matched_terms` chips, `explanation`; always show `disclaimer` as small print. If `status != "ok"`, show `message`. |
| Usage dashboard | KPI tiles from `summary`; bar chart of `equipment[].usage_count`; badges from `usage_class`; table of `zero_usage`; list `suggestions[].message`. Show utilisation columns only when `summary.utilization_available` is true. |
| Maintenance board | Colour by `priority` (High red / Medium amber / Low green); stacked bar from `score_breakdown`; expandable `explanation` and `suggested_actions`; a "Needs immediate attention" banner from `immediate_attention`. |
| Admin/debug | Show `warnings` so data-quality issues are visible instead of silent. |

## 7. Ownership boundaries
* The module **never** writes to the database and never opens connections.
* It does not authenticate users or decide who may see results – the backend does.
* The AI Agent teammate can call the same three functions as tools; pass their `result` dict (or the
  `explanation`/`message` strings) to the agent and keep the `disclaimer` in any recommendation text.
