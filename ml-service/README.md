# LabMate AI – AI/ML Module (Member 3)

**Intelligent Laboratory and Equipment Management System – AI/ML component**

> **All data in this repository is SAMPLE DATA.** The 25 equipment records and 588 issue
> records in `data/` are invented for demonstration. They are **not** real inventory of Vignan
> University or any other institution.

---

## 1. Overview

This package adds three analytical capabilities to LabMate AI. It is a **library**, not an
application: the backend imports three functions and the frontend displays their JSON results.

| Function | Purpose |
|---|---|
| `recommend_equipment()` | Suggest available alternatives for a student's requirement (TF-IDF + cosine similarity) |
| `analyze_usage()` | Frequently used / underutilised / zero-usage equipment, utilisation %, charts, report |
| `analyze_maintenance()` | Explainable maintenance priority score (High / Medium / Low) with suggested actions |

## 2. Problem statement

Lab staff and students lose time when (a) the requested equipment is unavailable and no one knows
a suitable alternative, (b) purchasing and allocation decisions are made without usage evidence,
and (c) damaged equipment is repaired in the order complaints arrive rather than by urgency.

## 3. AI/ML methodology

### 3.1 Recommendation (genuine ML: information retrieval)
* Each item becomes a text document: **name ×3 + category ×2 + specifications + description**
  (repetition up-weights the more informative fields).
* `TfidfVectorizer` (unigrams + bigrams, sublinear TF, English stop-words) is fitted on the
  *available candidate items only*; the query is only *transformed* (no query leakage into IDF).
* Cosine similarity ranks candidates; the top 3–5 (configurable) above `min_score` are returned.
* **Unavailable items (`available_quantity` ≤ 0 or missing) are never recommended.**
* Every result has matched terms, an explanation and a disclaimer.
* **The score is text similarity, not technical compatibility.** The module never claims an item
  is a compatible substitute; a lab in-charge must verify.

### 3.2 Usage analysis (descriptive statistics – not "AI")
* **Issue-record mode:** usage = issue events in the period; **utilisation % = borrowed unit-days ÷
  (total_quantity × period days) × 100** (same-day issue/return = 1 day; missing `return_date` =
  still issued until period end, with a warning; values > 100 % are capped with a warning).
* **Summary-column mode** (no records): uses `usage_count`; utilisation % is **not** calculated and
  the result says so – no fabricated percentages.
* Classes (computed among items with usage > 0): **Frequently used** ≥ 75th percentile,
  **Underutilised** ≤ 25th percentile, **Zero usage** = 0.
* Suggestions are rule-based and each cites the equipment involved.

### 3.3 Maintenance priority (transparent rules – deliberately *not* a predictive model)
The sample data contains no failure history, so claiming "predictive AI" would be dishonest. The
module uses an explainable weighted score (0–100):

| Component | Max | Calculation |
|---|---|---|
| Damage severity | 40 | 40 × level (None 0, Low .25, Medium .5, High .75, Critical 1) |
| Complaints | 20 | 20 × min(complaints, 5) / 5 |
| Days pending | 20 | 20 × min(days, 30) / 30 |
| Status | 20 | 20 × level (Operational 0, Needs Inspection .4, Under Maintenance .6, Pending Repair .8, Out of Service 1) |

**High ≥ 60, Medium ≥ 30, Low < 30.** Weights/thresholds are constants at the top of
`maintenance_analysis.py` and are an *engineering judgement to be tuned with lab staff*, not
learned values. Each result shows its score breakdown, a plain-English explanation and suggested
actions. Missing severity (when complaints exist) is assumed Medium and flagged; unknown days
pending count as 0 and are flagged.

**Optional genuine ML:** `evaluate_failure_model()` trains a RandomForest on labelled failure
history **only if** ≥ 150 rows and ≥ 20 examples of each class exist; otherwise it returns
`insufficient_data`. It fits the imputer/model on the training split only, supports a chronological
split (`time_col`), reports metrics from the held-out test set only and always includes a
majority-class baseline. It is **not** used on the sample data and **no accuracy figure is claimed
anywhere in this project**.

## 4. Architecture

```
 Backend (SQLite) ──rows──►  ai_module  ──JSON-safe dict──►  Backend API ──► Frontend
                              ├─ recommendation.py   recommend_equipment()
                              ├─ usage_analysis.py   analyze_usage()
                              ├─ maintenance_analysis.py  analyze_maintenance()
                              └─ common.py   validation, cleaning, JSON conversion, charts
```
Stateless pure functions: no database connection, no global state, no web server. Inputs are never
mutated. Invalid input raises `LabMateDataError` (a `ValueError`); empty datasets return a normal
result with `status` set accordingly.

## 5. Project structure

```
LabMate_AI_ML/
├── ai_module/            __init__.py  common.py  recommendation.py  usage_analysis.py  maintenance_analysis.py
├── data/                 sample_equipment_data.csv  sample_issue_records.csv   (SAMPLE DATA)
├── tests/                test_recommendation.py  test_usage.py  test_maintenance.py
├── reports/              generated charts / Markdown reports / CSV tables
├── run_demo.py  requirements.txt  README.md  integration_guide.md
```
`common.py` and `sample_issue_records.csv` are small additions beyond the requested layout
(shared validation code; issue/return records needed for real utilisation %).

## 6. Installation

```bash
cd LabMate_AI_ML
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
```

## 7. Execution

```bash
python run_demo.py
```
Prints results for all three modules and writes 6 PNG charts, 2 Markdown reports and 2 CSV tables to `reports/` (see `usage_report.md` and `maintenance_report.md`).

Minimal use:
```python
import pandas as pd
from ai_module import recommend_equipment, analyze_usage, analyze_maintenance

equipment = pd.read_csv("data/sample_equipment_data.csv")
records = pd.read_csv("data/sample_issue_records.csv")

recommend_equipment("oscilloscope waveform", equipment, top_n=3)
analyze_usage(equipment, records, "2026-08-01", "2026-10-31", output_dir="reports")
analyze_maintenance(equipment, as_of_date="2026-11-05", output_dir="reports")
```

## 8. Testing

```bash
python -m unittest discover -s tests -v     # no extra packages needed
# pytest should also work (tests are plain unittest classes), but pytest was not
# available in the environment used to verify this project, so that is unverified.
```
**58 tests**, all passing at packaging time (Python 3.12, pandas 3.0.6, scikit-learn 1.9.1),
also with `python -W error` (no warnings). Coverage includes hand-computed scores and utilisation
values, unavailable-item exclusion, missing values, empty datasets, duplicate/blank IDs, invalid
dates/records, invalid arguments, SQLite row input, JSON-serialisability, file generation, the
no-mutation guarantee and the ML evaluator's refusal on small data / leakage guard. The ML tests use
clearly-labelled **synthetic** data purely to exercise the code path.

## 9. Sample outputs (from `python run_demo.py`, SAMPLE DATA)

**Recommendation – alternatives to an unavailable Analytical Balance (LAB-018):**
```
#1 LAB-025  Top Loading Balance   score=0.567  [strong text match]
#2 LAB-015  Benchtop Centrifuge   score=0.191  [weak text match]
#3 LAB-024  Laboratory Autoclave  score=0.139  [weak text match]
```
Note how rank 2–3 are weak category-only matches – the score honestly shows that only #1 is a
plausible alternative. Even #1 needs human verification (0.1 mg vs 0.1 g readability!).

**Usage (92-day period):** 588 issue events; mean utilisation 10.37 %; zero usage: FPGA
Development Board, UV-Vis Spectrophotometer; most used: Arduino Uno Starter Kit (72 issues).

**Maintenance (as of 2026-11-05):** 4 High, 3 Medium, 18 Low. Top item:
`LAB-008 Analog Oscilloscope 96.0/100 = severity Critical (40.0) + 4 complaints (16.0) + 51 days pending (20.0) + status Out of Service (20.0)`.

Charts: `reports/usage_top_equipment.png`, `usage_by_category.png`, `usage_classification.png`,
`usage_utilization.png`, `maintenance_priority_distribution.png`, `maintenance_top_scores.png`.

## 10. Limitations (be upfront with judges)
* Recommendation is lexical: synonyms ("scope" vs "microscope") and numeric specs are not
  understood; it cannot verify compatibility. Scores are relative, not probabilities.
* Usage classes are percentile-based, so *some* items are always flagged "frequent/underutilised",
  even in a well-balanced lab. Low usage may reflect breakage (e.g. out-of-service items) rather
  than lack of demand – cross-check with the maintenance report.
* Maintenance weights and thresholds are heuristic, not learned or validated on real failures.
* The optional ML evaluator has only been exercised on synthetic data.
* Tested only on the library versions listed above; the lower bounds in `requirements.txt` are untested.
* Sample data is illustrative; results on it say nothing about any real lab.

## 11. Future improvements
Sentence-embedding recommendations (with the same availability filter and disclaimer); structured
spec matching (e.g. bandwidth ≥ 100 MHz); utilisation by booking hours; learning weights from real
failure history once enough exists; a calibrated failure-risk model via `evaluate_failure_model`.

See **`integration_guide.md`** for backend/frontend integration.
