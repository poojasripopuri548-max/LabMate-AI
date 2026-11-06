"""Module 3 - Intelligent Maintenance Priority Analysis.

Ranks equipment by maintenance urgency using a **transparent, rule-based
weighted score** (0-100).  This is NOT a predictive model: the sample data has
no failure history, so presenting it as "AI prediction" would be dishonest.

Score = severity (40) + complaints (20) + days pending (20) + status (20)

=============  =======  ==================================================
Component      Max pts  Calculation
=============  =======  ==================================================
Severity         40     40 x level (None 0, Low .25, Medium .5, High .75, Critical 1)
Complaints       20     20 x min(complaints, 5) / 5
Days pending     20     20 x min(days_pending, 30) / 30
Status           20     20 x level (Operational 0, Needs Inspection .4,
                        Under Maintenance .6, Pending Repair .8, Out of Service 1)
=============  =======  ==================================================

Priority: High >= 60, Medium >= 30, otherwise Low.

``evaluate_failure_model`` is an *optional* genuine ML routine (train/test
split, preprocessing fitted on training data only).  It refuses to run unless
enough labelled failure history exists, and it is never used by
``analyze_maintenance``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

from .common import (
    LabMateDataError,
    clean_text,
    jsonable,
    normalise_columns,
    parse_dates,
    prepare_inventory,
    require_columns,
    round_or_none,
    save_bar_chart,
    to_dataframe,
    to_timestamp,
)

# ---- scoring configuration (single source of truth; documented in README) ----
WEIGHTS = {"severity": 40.0, "complaints": 20.0, "days_pending": 20.0, "status": 20.0}
COMPLAINT_CAP = 5
DAYS_CAP = 30
HIGH_THRESHOLD = 60.0
MEDIUM_THRESHOLD = 30.0

SEVERITY_LEVELS = {"None": 0.0, "Low": 0.25, "Medium": 0.5, "High": 0.75, "Critical": 1.0}
STATUS_LEVELS = {"Operational": 0.0, "Needs Inspection": 0.4, "Under Maintenance": 0.6,
                 "Pending Repair": 0.8, "Out of Service": 1.0}
UNKNOWN_SEVERITY_LEVEL = 0.5   # assumed Medium (flagged in the explanation)
UNKNOWN_STATUS_LEVEL = 0.3     # flagged in the explanation

_SEVERITY_ALIASES = {
    "none": "None", "no damage": "None", "nil": "None", "low": "Low", "minor": "Low",
    "medium": "Medium", "moderate": "Medium", "high": "High", "major": "High",
    "critical": "Critical", "severe": "Critical",
}
_STATUS_ALIASES = {
    "operational": "Operational", "working": "Operational", "available": "Operational",
    "ok": "Operational", "good": "Operational",
    "needs inspection": "Needs Inspection", "inspection required": "Needs Inspection",
    "under maintenance": "Under Maintenance", "in maintenance": "Under Maintenance",
    "under repair": "Under Maintenance",
    "pending repair": "Pending Repair", "awaiting repair": "Pending Repair",
    "pending": "Pending Repair",
    "out of service": "Out of Service", "damaged": "Out of Service",
    "not working": "Out of Service", "broken": "Out of Service",
}
REQUIRED_COLUMNS = ["equipment_name", "damage_count", "maintenance_status", "damage_severity"]

# ---- optional ML thresholds ---------------------------------------------------
MIN_ROWS_FOR_ML = 150
MIN_PER_CLASS_FOR_ML = 20


def _norm_severity(value: Any) -> str:
    key = str(value).strip().lower() if value is not None and not pd.isna(value) else ""
    return _SEVERITY_ALIASES.get(key, "") if key else ""


def _norm_status(value: Any) -> str:
    key = str(value).strip().lower().replace("_", " ") if value is not None and not pd.isna(value) else ""
    return _STATUS_ALIASES.get(key, "Unknown") if key else "Unknown"


def _max_severity(labels: Sequence[str]) -> str:
    known = [l for l in labels if l in SEVERITY_LEVELS]
    return max(known, key=lambda l: SEVERITY_LEVELS[l]) if known else ""


def _priority(score: float) -> str:
    return "High" if score >= HIGH_THRESHOLD else "Medium" if score >= MEDIUM_THRESHOLD else "Low"


def _actions(row: Dict[str, Any]) -> List[str]:
    """Rule-based maintenance suggestions derived from the row's own facts."""
    acts: List[str] = []
    status, sev, prio = row["maintenance_status"], row["severity_level"], row["priority"]
    days, n = row["days_pending"], row["complaints"]
    if prio == "High":
        acts.append("Escalate to the lab in-charge and raise an urgent repair ticket.")
        if status in ("Out of Service", "Pending Repair", "Needs Inspection", "Under Maintenance"):
            acts.append("Keep the item out of student circulation until it is repaired and tested.")
        if sev in ("High", "Critical"):
            acts.append("Inspect for safety hazards (electrical/mechanical/chemical) before any further use.")
    elif prio == "Medium":
        acts.append("Schedule an inspection/repair in the next maintenance window.")
        if status in ("Pending Repair", "Under Maintenance"):
            acts.append("Confirm technician / spare-parts status and expected completion date.")
    else:
        acts.append("Log any reported issue and re-check at the next routine inspection."
                    if n > 0 else "No action needed; continue routine preventive maintenance.")
    if days is not None and days >= DAYS_CAP:
        acts.append(f"Report pending {days} days: follow up with the vendor/maintenance team.")
    if n >= 3:
        acts.append("Repeated complaints: investigate the root cause (wear, calibration, handling) "
                    "instead of repeating the same fix.")
    return acts


def analyze_maintenance(
    equipment_data: Any,
    damage_reports: Any = None,
    as_of_date: Any = None,
    top_n: int = 5,
    output_dir: Optional[str] = None,
    report_label: str = "",
) -> Dict[str, Any]:
    """Score and classify maintenance priority (rule-based, explainable).

    Parameters
    ----------
    equipment_data:
        DataFrame / list of dicts. Required: ``equipment_id``, ``equipment_name``,
        ``damage_count``, ``maintenance_status``, ``damage_severity``.
        Optional: ``category``, ``lab_location``, ``damage_reported_date``
        (date the open problem was first reported - used for days pending),
        ``total_quantity``, ``available_quantity``.
    damage_reports:
        Optional DataFrame / list of dicts with ``equipment_id``, ``report_date``
        and optionally ``severity`` and ``resolved_date`` (blank = still open).
        For equipment that has reports, complaints = number of reports, severity =
        highest severity among open reports (all reports if none open) and days
        pending = days since the oldest open report.  Equipment without reports
        falls back to the equipment-table columns.
    as_of_date:
        Reference date (default: today).
    output_dir:
        If given, charts (PNG), a Markdown report and a CSV table are written there.

    Returns a JSON-safe dict; invalid input raises :class:`LabMateDataError`;
    an empty dataset returns ``status="empty_inventory"``.
    """
    warnings: List[str] = []
    if isinstance(top_n, bool) or not isinstance(top_n, int) or top_n < 1:
        raise LabMateDataError("'top_n' must be a positive integer.")
    as_of = to_timestamp(as_of_date, "as_of_date") or pd.Timestamp.today().normalize()

    inv = prepare_inventory(
        equipment_data, REQUIRED_COLUMNS,
        text_cols=["equipment_name", "category", "lab_location", "maintenance_status",
                   "damage_severity"],
        numeric_cols=["damage_count", "total_quantity", "available_quantity"],
        warnings=warnings)
    if inv.empty:
        return jsonable({"status": "empty_inventory", "message": "The equipment dataset is empty.",
                         "summary": _blank_summary(), "equipment": [], "immediate_attention": [],
                         "scoring_method": _method(), "warnings": warnings, "outputs": {}})

    # ---- clean equipment-level fields -----------------------------------------
    n_bad = int(inv["damage_count"].isna().sum() + (inv["damage_count"] < 0).sum())
    if n_bad:
        warnings.append(f"{n_bad} item(s) had a missing/negative damage_count; treated as 0.")
    inv["damage_count"] = inv["damage_count"].mask(inv["damage_count"] < 0, 0).fillna(0).round().astype(int)
    inv["status_label"] = inv["maintenance_status"].map(_norm_status)
    n_unk = int((inv["status_label"] == "Unknown").sum())
    if n_unk:
        warnings.append(f"{n_unk} item(s) have a missing/unrecognised maintenance_status; "
                        f"a neutral level ({UNKNOWN_STATUS_LEVEL}) was used.")
    inv["severity_label"] = inv["damage_severity"].map(_norm_severity)
    inv["reported_date"] = parse_dates(inv["damage_reported_date"]) if "damage_reported_date" in inv.columns \
        else pd.Series(pd.NaT, index=inv.index, dtype="datetime64[ns]")

    # ---- optional detailed reports --------------------------------------------
    rep_stats = pd.DataFrame()
    if damage_reports is not None:
        rep = normalise_columns(to_dataframe(damage_reports, "damage_reports"))
        if not rep.empty:
            require_columns(rep, ["equipment_id", "report_date"], "damage_reports")
            rep["equipment_id"] = clean_text(rep["equipment_id"])
            rep["report_date"] = parse_dates(rep["report_date"])
            rep["resolved_date"] = parse_dates(rep["resolved_date"]) if "resolved_date" in rep.columns \
                else pd.Series(pd.NaT, index=rep.index, dtype="datetime64[ns]")
            sev_col = "severity" if "severity" in rep.columns else \
                "damage_severity" if "damage_severity" in rep.columns else None
            rep["sev"] = rep[sev_col].map(_norm_severity) if sev_col else ""
            bad = rep["report_date"].isna() | ~rep["equipment_id"].isin(set(inv["equipment_id"]))
            if bad.any():
                warnings.append(f"{int(bad.sum())} damage report(s) with invalid date or unknown "
                                "equipment_id were ignored.")
            rep = rep.loc[~bad]
            rows = []
            for eid, g in rep.groupby("equipment_id"):
                open_g = g[g["resolved_date"].isna()]
                basis = open_g if len(open_g) else g
                rows.append({"equipment_id": eid, "n_reports": len(g), "n_open": len(open_g),
                             "rep_severity": _max_severity(basis["sev"].tolist()),
                             "oldest_open": open_g["report_date"].min() if len(open_g) else pd.NaT})
            rep_stats = pd.DataFrame(rows)

    # ---- per-equipment scoring --------------------------------------------------
    rep_lookup = rep_stats.set_index("equipment_id").to_dict("index") if len(rep_stats) else {}
    out_rows: List[Dict[str, Any]] = []
    for r in inv.itertuples():
        info = rep_lookup.get(r.equipment_id)
        notes: List[str] = []
        if info:
            source = "damage_reports"
            complaints = int(info["n_reports"])
            severity = info["rep_severity"] or r.severity_label
            if info["n_open"]:
                days = max(int((as_of - info["oldest_open"]).days), 0)
            else:
                days = 0
        else:
            source = "equipment_table"
            complaints = int(r.damage_count)
            severity = r.severity_label
            if r.status_label == "Operational":
                days = 0
            elif pd.notna(r.reported_date):
                days = max(int((as_of - r.reported_date).days), 0)
            else:
                days = None
                notes.append("days pending unknown (no damage_reported_date); counted as 0")

        if severity == "":
            severity = "Unknown" if complaints > 0 else "None"
        sev_level = UNKNOWN_SEVERITY_LEVEL if severity == "Unknown" else SEVERITY_LEVELS[severity]
        if severity == "Unknown":
            notes.append("severity missing; assumed Medium")
        status_level = UNKNOWN_STATUS_LEVEL if r.status_label == "Unknown" \
            else STATUS_LEVELS[r.status_label]

        comp_pts = WEIGHTS["complaints"] * min(complaints, COMPLAINT_CAP) / COMPLAINT_CAP
        days_pts = WEIGHTS["days_pending"] * min(days or 0, DAYS_CAP) / DAYS_CAP
        sev_pts = WEIGHTS["severity"] * sev_level
        stat_pts = WEIGHTS["status"] * status_level
        score = sev_pts + comp_pts + days_pts + stat_pts
        prio = _priority(score)

        row = {
            "equipment_id": r.equipment_id, "equipment_name": r.equipment_name,
            "category": r.category, "lab_location": r.lab_location,
            "maintenance_status": r.status_label, "severity_level": severity,
            "complaints": complaints, "days_pending": days,
            "priority_score": round(score, 1), "priority": prio,
            "score_breakdown": {"severity": round(sev_pts, 1), "complaints": round(comp_pts, 1),
                                "days_pending": round(days_pts, 1), "status": round(stat_pts, 1)},
            "requires_immediate_attention": prio == "High",
            "data_source": source,
        }
        row["explanation"] = (
            f"Score {score:.1f}/100 = severity {severity} ({sev_pts:.1f}) + "
            f"{complaints} complaint(s) ({comp_pts:.1f}) + "
            f"{'unknown' if days is None else days} day(s) pending ({days_pts:.1f}) + "
            f"status {r.status_label} ({stat_pts:.1f})."
            + (" Notes: " + "; ".join(notes) + "." if notes else ""))
        row["suggested_actions"] = _actions(row)
        out_rows.append(row)

    res = pd.DataFrame(out_rows).sort_values(
        ["priority_score", "complaints"], ascending=[False, False]).reset_index(drop=True)
    res.insert(0, "rank", range(1, len(res) + 1))

    counts = res["priority"].value_counts()
    summary = {
        "total_equipment": int(len(res)),
        "high_count": int(counts.get("High", 0)),
        "medium_count": int(counts.get("Medium", 0)),
        "low_count": int(counts.get("Low", 0)),
        "mean_priority_score": round_or_none(res["priority_score"].mean(), 1),
        "as_of_date": as_of,
    }
    attention = res[res["requires_immediate_attention"]]
    result: Dict[str, Any] = {
        "status": "ok",
        "message": f"{summary['high_count']} item(s) need immediate attention.",
        "summary": summary,
        "equipment": res.to_dict("records"),
        "immediate_attention": attention.to_dict("records"),
        "scoring_method": _method(),
        "warnings": warnings,
        "outputs": {},
    }
    if output_dir:
        result["outputs"] = _write_outputs(result, res, Path(output_dir), report_label, top_n)
    return jsonable(result)


def _method() -> Dict[str, Any]:
    return {
        "type": "rule-based weighted score (not a predictive ML model)",
        "weights": WEIGHTS, "complaint_cap": COMPLAINT_CAP, "days_cap": DAYS_CAP,
        "thresholds": {"High": f">= {HIGH_THRESHOLD:g}", "Medium": f">= {MEDIUM_THRESHOLD:g}",
                       "Low": f"< {MEDIUM_THRESHOLD:g}"},
        "severity_levels": SEVERITY_LEVELS, "status_levels": STATUS_LEVELS,
    }


def _blank_summary() -> Dict[str, Any]:
    return {"total_equipment": 0, "high_count": 0, "medium_count": 0, "low_count": 0,
            "mean_priority_score": None, "as_of_date": None}


def _write_outputs(result: Dict[str, Any], res: pd.DataFrame, out_dir: Path, label: str,
                   top_n: int) -> Dict[str, Any]:
    from matplotlib.figure import Figure

    out_dir.mkdir(parents=True, exist_ok=True)
    charts: List[str] = []
    s = result["summary"]
    colours = {"High": "#c62828", "Medium": "#ef9a1a", "Low": "#2e7d32"}
    charts.append(save_bar_chart(
        out_dir / "maintenance_priority_distribution.png", list(colours),
        [s["high_count"], s["medium_count"], s["low_count"]],
        "Maintenance priority distribution", "Number of equipment items", horizontal=False,
        colors=list(colours.values()), footer=label))

    top = res.head(10)
    fig = Figure(figsize=(9, max(3.4, 0.45 * len(top) + 1.8)), dpi=110)
    ax = fig.subplots()
    names = [n if len(n) <= 28 else n[:27] + "…" for n in top["equipment_name"]]
    left = np.zeros(len(top))
    for key, col in (("severity", "#c62828"), ("complaints", "#ef9a1a"),
                     ("days_pending", "#3b6ea5"), ("status", "#6a4c93")):
        vals = np.array([b[key] for b in top["score_breakdown"]])
        ax.barh(names, vals, left=left, color=col, label=key.replace("_", " "))
        left += vals
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("Priority score (0-100)")
    ax.set_title("Top maintenance priorities - score breakdown", fontsize=11, fontweight="bold")
    ax.axvline(HIGH_THRESHOLD, color="#c62828", ls="--", lw=0.8)
    ax.axvline(MEDIUM_THRESHOLD, color="#ef9a1a", ls="--", lw=0.8)
    ax.legend(fontsize=8, loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    if label:
        fig.text(0.01, 0.01, label, fontsize=7, color="#666666")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    p = out_dir / "maintenance_top_scores.png"
    fig.savefig(p)
    charts.append(str(p))

    table = res.drop(columns=["score_breakdown", "suggested_actions"]).copy()
    table_path = out_dir / "maintenance_priority_table.csv"
    table.to_csv(table_path, index=False)

    lines = [
        "# Maintenance Priority Report", "", f"**{label}**" if label else "",
        f"- Reference date: {s['as_of_date'].strftime('%Y-%m-%d')}",
        "- Method: rule-based weighted score (severity 40, complaints 20, days pending 20, "
        "status 20). **Not a predictive model.**", "",
        "## Summary", "", "| Priority | Items |", "|---|---|",
        f"| High | {s['high_count']} |", f"| Medium | {s['medium_count']} |",
        f"| Low | {s['low_count']} |", "",
        "## Immediate attention (High priority)", "",
    ]
    att = res[res["requires_immediate_attention"]]
    if att.empty:
        lines.append("- None")
    for r in att.itertuples():
        lines.append(f"### {r.equipment_id} - {r.equipment_name} (score {r.priority_score})")
        lines.append(f"{r.explanation}")
        lines += [f"- {a}" for a in r.suggested_actions]
        lines.append("")
    lines += ["## Top ranked equipment", "", "| Rank | ID | Equipment | Score | Priority | Status |",
              "|---|---|---|---|---|---|"]
    lines += [f"| {r.rank} | {r.equipment_id} | {r.equipment_name} | {r.priority_score} | "
              f"{r.priority} | {r.maintenance_status} |" for r in res.head(max(top_n, 10)).itertuples()]
    if result["warnings"]:
        lines += ["", "## Data warnings", ""] + [f"- {w}" for w in result["warnings"]]
    lines += ["", "## Charts", ""] + [f"![{Path(c).stem}]({Path(c).name})" for c in charts]
    report_path = out_dir / "maintenance_report.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"report": str(report_path), "table": str(table_path), "charts": charts}


# --------------------------------------------------------------------------
# Optional genuine ML: failure prediction with honest evaluation
# --------------------------------------------------------------------------
def evaluate_failure_model(
    history_data: Any,
    label_col: str = "failed_within_90d",
    feature_cols: Optional[Sequence[str]] = None,
    time_col: Optional[str] = None,
    test_size: float = 0.25,
    random_state: int = 42,
    min_rows: int = MIN_ROWS_FOR_ML,
    min_per_class: int = MIN_PER_CLASS_FOR_ML,
) -> Dict[str, Any]:
    """Train and evaluate a failure-prediction model - only if data is sufficient.

    ``history_data`` needs a binary label column plus numeric feature columns
    (e.g. ``usage_count``, ``damage_count``, ``age_months``,
    ``days_since_last_maintenance``).  Features must be known *before* the label
    period (no leakage) - the function cannot check that for you, but it does:

    * fit the imputer and model on the training split only,
    * support a chronological split via ``time_col`` (recommended),
    * report metrics measured on the held-out test split only,
    * return ``status="insufficient_data"`` instead of inventing a model when
      there are fewer than ``min_rows`` rows or ``min_per_class`` examples of
      either class.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                                 precision_score, recall_score, roc_auc_score)
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline

    if not 0.1 <= test_size <= 0.5:
        raise LabMateDataError("'test_size' must be between 0.1 and 0.5.")
    df = normalise_columns(to_dataframe(history_data, "history_data"))
    fallback = ("Using transparent rule-based prioritisation (analyze_maintenance) "
                "instead of a predictive model.")
    if df.empty:
        return {"status": "insufficient_data", "reasons": ["history_data is empty"],
                "message": fallback}
    label_col = str(label_col).strip().lower().replace(" ", "_")
    if label_col not in df.columns:
        return {"status": "insufficient_data",
                "reasons": [f"no failure-history label column '{label_col}' in the data"],
                "message": fallback}

    reasons: List[str] = []
    label = pd.to_numeric(df[label_col], errors="coerce")
    df = df.loc[label.isin([0, 1])].copy()
    df[label_col] = label.loc[df.index].astype(int)

    if feature_cols is None:
        feature_cols = [c for c in df.select_dtypes(include="number").columns
                        if c != label_col and c != time_col and not c.endswith("_id")]
    feature_cols = [str(c).strip().lower().replace(" ", "_") for c in feature_cols]
    if label_col in feature_cols:
        raise LabMateDataError("The label column must not be used as a feature (data leakage).")
    require_columns(df, feature_cols, "history_data")
    if not feature_cols:
        reasons.append("no numeric feature columns available")
    for c in feature_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    if time_col:
        require_columns(df, [time_col], "history_data")
        df[time_col] = parse_dates(df[time_col])
        df = df.dropna(subset=[time_col]).sort_values(time_col)

    counts = df[label_col].value_counts()
    n_pos, n_neg = int(counts.get(1, 0)), int(counts.get(0, 0))
    if len(df) < min_rows:
        reasons.append(f"only {len(df)} labelled rows (need >= {min_rows})")
    if n_pos < min_per_class:
        reasons.append(f"only {n_pos} failure examples (need >= {min_per_class})")
    if n_neg < min_per_class:
        reasons.append(f"only {n_neg} non-failure examples (need >= {min_per_class})")
    if reasons:
        return {"status": "insufficient_data", "reasons": reasons, "message": fallback}

    if time_col:
        cut = int(len(df) * (1 - test_size))
        train, test, split = df.iloc[:cut], df.iloc[cut:], "chronological"
    else:
        train, test = train_test_split(df, test_size=test_size, random_state=random_state,
                                       stratify=df[label_col])
        split = "stratified_random"
    if train[label_col].nunique() < 2:
        return {"status": "insufficient_data",
                "reasons": ["training split contains only one class"], "message": fallback}

    model = Pipeline([
        ("impute", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("clf", RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=3,
                                       class_weight="balanced_subsample",
                                       random_state=random_state)),
    ])
    model.fit(train[feature_cols], train[label_col])           # training data only
    pred = model.predict(test[feature_cols])
    proba = model.predict_proba(test[feature_cols])[:, 1]
    y_true = test[label_col]
    majority = int(train[label_col].mode().iloc[0])
    auc = float(roc_auc_score(y_true, proba)) if y_true.nunique() == 2 else None
    importances = dict(zip(feature_cols, model.named_steps["clf"].feature_importances_))
    result = jsonable({
        "status": "ok",
        "split": split,
        "n_train": int(len(train)), "n_test": int(len(test)),
        "metrics_on_test_set": {
            "accuracy": accuracy_score(y_true, pred),
            "precision": precision_score(y_true, pred, zero_division=0),
            "recall": recall_score(y_true, pred, zero_division=0),
            "f1": f1_score(y_true, pred, zero_division=0),
            "roc_auc": auc,
            "baseline_majority_class_accuracy": float(np.mean(y_true == majority)),
            "confusion_matrix": confusion_matrix(y_true, pred, labels=[0, 1]).tolist(),
        },
        "feature_importance": dict(sorted(importances.items(), key=lambda kv: -kv[1])),
        "note": ("Metrics come from a held-out test split only. Compare against the baseline "
                 "before trusting the model, and re-validate on real inventory history."),
    })
    result["model"] = model  # fitted sklearn Pipeline (not JSON-serialisable)
    return result
