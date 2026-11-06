"""Module 2 - Equipment Usage Analysis.

Analyses equipment issue/return activity to find frequently used,
under-utilised and zero-usage equipment, calculates usage statistics and
(only when valid data exist) utilisation percentages, and produces charts,
a Markdown report, a CSV table and actionable suggestions.

Two input modes
---------------
1. **Issue-record mode** (preferred): pass ``issue_records`` with
   ``equipment_id`` and ``issue_date`` (plus optional ``return_date`` and
   ``quantity``).  Usage counts and a true utilisation % are calculated for
   the analysis period.
2. **Summary-column mode** (fallback): if no records are given, the
   ``usage_count`` column of the equipment table is used.  Utilisation % is
   *not* calculated in this mode because no time/duration data exists - the
   result says so explicitly.

Definitions (all documented in README.md)
------------------------------------------
* usage_count      - number of issue events with issue_date inside the period.
* utilisation %    - borrowed unit-days / (total_quantity x period days) x 100.
                     A same-day issue+return counts as 1 day (inclusive days).
* Frequently used  - usage >= 75th percentile of equipment with usage > 0.
* Underutilised    - 0 < usage <= 25th percentile of equipment with usage > 0.
* Zero usage       - usage == 0.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

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

REQUIRED_COLUMNS = ["equipment_name", "category", "total_quantity", "available_quantity"]
CLASS_FREQUENT = "Frequently used"
CLASS_MODERATE = "Moderately used"
CLASS_UNDER = "Underutilized"
CLASS_ZERO = "Zero usage"


def _empty_records() -> pd.DataFrame:
    return pd.DataFrame({
        "equipment_id": pd.Series(dtype="object"),
        "issue_date": pd.Series(dtype="datetime64[ns]"),
        "return_date": pd.Series(dtype="datetime64[ns]"),
        "quantity": pd.Series(dtype="float64"),
    })


def _prepare_records(raw: Any, valid_ids: set, warnings: List[str]) -> pd.DataFrame:
    """Validate/clean issue records; invalid rows are dropped with a warning."""
    rec = normalise_columns(to_dataframe(raw, "issue_records"))
    if rec.empty:
        return _empty_records()
    require_columns(rec, ["equipment_id", "issue_date"], "issue_records")

    rec["equipment_id"] = clean_text(rec["equipment_id"])
    rec["issue_date"] = parse_dates(rec["issue_date"])
    rec["return_date"] = parse_dates(rec["return_date"]) if "return_date" in rec.columns \
        else pd.Series(pd.NaT, index=rec.index, dtype="datetime64[ns]")
    qty = pd.to_numeric(rec["quantity"], errors="coerce") if "quantity" in rec.columns \
        else pd.Series(1.0, index=rec.index)
    rec["quantity"] = qty.fillna(1.0).clip(lower=1.0)

    bad_date = rec["issue_date"].isna()
    if bad_date.any():
        warnings.append(f"{int(bad_date.sum())} issue record(s) with invalid issue_date ignored.")
    bad_order = rec["return_date"].notna() & (rec["return_date"] < rec["issue_date"])
    if bad_order.any():
        warnings.append(f"{int(bad_order.sum())} issue record(s) with return_date before "
                        "issue_date ignored.")
    unknown = ~rec["equipment_id"].isin(valid_ids)
    if (unknown & ~bad_date).any():
        warnings.append(f"{int((unknown & ~bad_date).sum())} issue record(s) reference an "
                        "equipment_id not in the equipment table and were ignored.")
    keep = ~(bad_date | bad_order | unknown)
    return rec.loc[keep, ["equipment_id", "issue_date", "return_date", "quantity"]].reset_index(drop=True)


def _classify(usage: pd.Series, frequent_q: float, low_q: float) -> pd.Series:
    labels = pd.Series(CLASS_ZERO, index=usage.index, dtype="object")
    nonzero = usage[usage > 0]
    if nonzero.empty:
        return labels
    hi, lo = nonzero.quantile(frequent_q), nonzero.quantile(low_q)
    labels[usage > 0] = CLASS_MODERATE
    if hi > lo:  # if every active item has similar usage, nobody is flagged high/low
        labels[(usage > 0) & (usage >= hi)] = CLASS_FREQUENT
        labels[(usage > 0) & (usage <= lo)] = CLASS_UNDER
    return labels


def _suggestions(t: pd.DataFrame, summary: Dict[str, Any], dormant_days: int) -> List[Dict[str, Any]]:
    """Rule-based, data-driven suggestions (each cites the equipment involved)."""
    out: List[Dict[str, Any]] = []

    def add(kind: str, message: str, ids: List[str]) -> None:
        out.append({"type": kind, "message": message, "equipment_ids": ids})

    zero = t[t["usage_class"] == CLASS_ZERO]
    if len(zero):
        add("zero_usage",
            f"{len(zero)} item(s) had no recorded usage in this analysis: "
            f"{', '.join(zero['equipment_name'].head(5))}{'...' if len(zero) > 5 else ''}. "
            "Check whether students know they exist (add them to lab manuals / the booking "
            "page), confirm they are in working order, or relocate them to a lab with demand.",
            zero["equipment_id"].tolist())

    freq = t[t["usage_class"] == CLASS_FREQUENT]
    tight = freq[(freq["available_quantity"].fillna(0) <= 0) |
                 ((freq["available_quantity"] / freq["total_quantity"]) <= 0.25)]
    if len(tight):
        add("capacity",
            f"High-demand item(s) with little or no stock left: "
            f"{', '.join(tight['equipment_name'])}. Consider a booking/slot system or "
            "additional units, and prioritise their maintenance so they stay available.",
            tight["equipment_id"].tolist())

    under = t[t["usage_class"] == CLASS_UNDER]
    spare = under[(under["available_quantity"] / under["total_quantity"]) >= 0.75]
    if len(spare):
        add("reallocate",
            f"Under-utilised item(s) with most units idle: {', '.join(spare['equipment_name'])}. "
            "Consider sharing them across labs or reviewing whether further purchases are needed.",
            spare["equipment_id"].tolist())

    dormant = t[(t["usage_class"] != CLASS_ZERO) & (t["days_since_last_use"] > dormant_days)]
    if len(dormant):
        add("dormant",
            f"{len(dormant)} item(s) not used for more than {dormant_days} days: "
            f"{', '.join(dormant['equipment_name'].head(5))}. Run a quick functional check "
            "and consider a demo session.",
            dormant["equipment_id"].tolist())

    if summary["top3_usage_share_pct"] is not None and summary["top3_usage_share_pct"] > 50:
        add("concentration",
            f"The top 3 items account for {summary['top3_usage_share_pct']}% of all usage. "
            "Usage is concentrated - make sure these have spares and preventive maintenance.",
            t.sort_values("usage_count", ascending=False)["equipment_id"].head(3).tolist())

    if summary["utilization_available"]:
        hot = t[t["utilization_pct"].fillna(0) >= 70]
        if len(hot):
            add("near_capacity",
                f"Item(s) at or above 70% utilisation: {', '.join(hot['equipment_name'])}. "
                "Plan additional capacity or scheduled access.", hot["equipment_id"].tolist())
        mean_util = summary["mean_utilization_pct"]
        if mean_util is not None and mean_util < 20:
            add("overall_low",
                f"Average utilisation is only {mean_util}%. Total stock may exceed current "
                "demand - review purchase plans before buying more.", [])
    else:
        add("data_quality",
            "Utilisation % could not be calculated (no issue/return dates). Record issue and "
            "return dates for every transaction to enable true utilisation analysis.", [])
    return out


def _write_outputs(result: Dict[str, Any], t: pd.DataFrame, out_dir: Path, label: str,
                   top_n: int) -> Dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    footer = label or ""
    charts: List[str] = []

    top = t.sort_values("usage_count", ascending=False).head(10)
    charts.append(save_bar_chart(
        out_dir / "usage_top_equipment.png", top["equipment_name"].tolist(),
        top["usage_count"].tolist(), "Most frequently used equipment", "Issue count",
        footer=footer))

    cat = t.groupby("category")["usage_count"].sum().sort_values(ascending=False)
    charts.append(save_bar_chart(
        out_dir / "usage_by_category.png", cat.index.tolist(), cat.tolist(),
        "Total usage by category", "Issue count", horizontal=False, footer=footer))

    cls = t["usage_class"].value_counts()
    order = [c for c in (CLASS_FREQUENT, CLASS_MODERATE, CLASS_UNDER, CLASS_ZERO) if c in cls.index]
    colour = {CLASS_FREQUENT: "#2e7d32", CLASS_MODERATE: "#3b6ea5",
              CLASS_UNDER: "#ef9a1a", CLASS_ZERO: "#c62828"}
    charts.append(save_bar_chart(
        out_dir / "usage_classification.png", order, [int(cls[c]) for c in order],
        "Equipment by usage class", "Number of equipment items", horizontal=False,
        colors=[colour[c] for c in order], footer=footer))

    if result["summary"]["utilization_available"]:
        u = t.dropna(subset=["utilization_pct"]).sort_values("utilization_pct", ascending=False).head(10)
        charts.append(save_bar_chart(
            out_dir / "usage_utilization.png", u["equipment_name"].tolist(),
            u["utilization_pct"].round(1).tolist(), "Highest utilisation % (borrowed unit-days)",
            "Utilisation %", footer=footer))

    table_path = out_dir / "usage_equipment_table.csv"
    t.to_csv(table_path, index=False)

    s = result["summary"]
    lines = [
        "# Equipment Usage Analysis Report", "",
        f"**{label}**" if label else "",
        f"- Data source: `{result['data_source']}`",
        f"- Period: {result['period']['start']} to {result['period']['end']} "
        f"({result['period']['days']} days)" if result["period"] else
        "- Period: not available (summary-column mode)",
        f"- Equipment analysed: {s['total_equipment']}", "",
        "## Summary", "",
        f"| Metric | Value |", "|---|---|",
        f"| Total issue events | {s['total_usage']} |",
        f"| Mean usage per item | {s['mean_usage']} |",
        f"| Median usage per item | {s['median_usage']} |",
        f"| Frequently used | {s['frequent_count']} |",
        f"| Underutilized | {s['underutilized_count']} |",
        f"| Zero usage | {s['zero_usage_count']} |",
        f"| Mean utilisation % | {s['mean_utilization_pct'] if s['utilization_available'] else 'not calculated'} |",
        "", "## Top equipment by usage", "",
        "| Rank | ID | Equipment | Usage | Share % | Utilisation % |", "|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(t.sort_values("usage_count", ascending=False).head(top_n).itertuples(), 1):
        util = "n/a" if pd.isna(r.utilization_pct) else f"{r.utilization_pct:.1f}"
        lines.append(f"| {i} | {r.equipment_id} | {r.equipment_name} | {r.usage_count} | "
                     f"{r.usage_share_pct:.1f} | {util} |")
    lines += ["", "## Zero-usage equipment", ""]
    zero = t[t["usage_class"] == CLASS_ZERO]
    lines += [f"- {r.equipment_id} {r.equipment_name} ({r.lab_location or 'location n/a'})"
              for r in zero.itertuples()] or ["- None"]
    lines += ["", "## Suggestions", ""]
    lines += [f"- **{x['type']}**: {x['message']}" for x in result["suggestions"]] or ["- None"]
    if result["warnings"]:
        lines += ["", "## Data warnings", ""] + [f"- {w}" for w in result["warnings"]]
    lines += ["", "## Charts", ""] + [f"![{Path(c).stem}]({Path(c).name})" for c in charts]
    report_path = out_dir / "usage_report.md"
    report_path.write_text("\n".join(l for l in lines if l is not None) + "\n", encoding="utf-8")
    return {"report": str(report_path), "table": str(table_path), "charts": charts}


def analyze_usage(
    equipment_data: Any,
    issue_records: Any = None,
    period_start: Any = None,
    period_end: Any = None,
    as_of_date: Any = None,
    dormant_days: int = 90,
    top_n: int = 5,
    frequent_quantile: float = 0.75,
    low_quantile: float = 0.25,
    output_dir: Optional[str] = None,
    report_label: str = "",
) -> Dict[str, Any]:
    """Analyse equipment usage.

    Parameters
    ----------
    equipment_data:
        DataFrame / list of dicts. Required: ``equipment_id``, ``equipment_name``,
        ``category``, ``total_quantity``, ``available_quantity``.  ``usage_count``
        is required only when ``issue_records`` is not supplied.  Optional:
        ``lab_location``, ``last_used_date``.
    issue_records:
        Optional DataFrame / list of dicts: ``equipment_id``, ``issue_date`` and
        optionally ``return_date`` (blank = still issued) and ``quantity`` (default 1).
    period_start, period_end:
        Analysis window for issue records (inclusive).  If omitted they are
        inferred from the records and a warning is added.
    as_of_date:
        Reference date for "days since last use" (default: today).
    output_dir:
        If given, charts (PNG), a Markdown report and a CSV table are written there.
    report_label:
        Text printed on charts/report (e.g. ``"SAMPLE DATA - illustrative only"``).

    Returns a JSON-safe dict (see integration_guide.md).  Bad input raises
    :class:`LabMateDataError`; empty datasets return ``status="empty_inventory"``.
    """
    warnings: List[str] = []
    if isinstance(top_n, bool) or not isinstance(top_n, int) or top_n < 1:
        raise LabMateDataError("'top_n' must be a positive integer.")
    if isinstance(dormant_days, bool) or not isinstance(dormant_days, int) or dormant_days < 1:
        raise LabMateDataError("'dormant_days' must be a positive integer.")
    if not 0 < low_quantile < frequent_quantile < 1:
        raise LabMateDataError("Quantiles must satisfy 0 < low_quantile < frequent_quantile < 1.")
    ps_in, pe_in = to_timestamp(period_start, "period_start"), to_timestamp(period_end, "period_end")
    if ps_in is not None and pe_in is not None and pe_in < ps_in:
        raise LabMateDataError("'period_end' must not be earlier than 'period_start'.")
    as_of = to_timestamp(as_of_date, "as_of_date") or pd.Timestamp.today().normalize()

    # ---- inventory ---------------------------------------------------------
    use_records = issue_records is not None
    required = list(REQUIRED_COLUMNS) + ([] if use_records else ["usage_count"])
    inv = prepare_inventory(
        equipment_data, required,
        text_cols=["equipment_name", "category", "lab_location"],
        numeric_cols=["total_quantity", "available_quantity", "usage_count"],
        warnings=warnings)
    if inv.empty:
        return jsonable({
            "status": "empty_inventory", "message": "The equipment dataset is empty.",
            "data_source": None, "period": None, "summary": _blank_summary(),
            "equipment": [], "frequently_used": [], "underutilized": [], "zero_usage": [],
            "category_summary": [], "suggestions": [], "warnings": warnings, "outputs": {}})

    for col in ("total_quantity", "available_quantity"):
        bad = inv[col].isna() | (inv[col] < 0)
        if bad.any():
            warnings.append(f"{int(bad.sum())} item(s) have a missing/negative {col}; "
                            "treated as unknown.")
            inv.loc[bad, col] = np.nan
    inv["last_used_date"] = parse_dates(inv["last_used_date"]) if "last_used_date" in inv.columns \
        else pd.Series(pd.NaT, index=inv.index, dtype="datetime64[ns]")

    # ---- usage counts (+ utilisation when valid) --------------------------------
    period: Optional[Dict[str, Any]] = None
    inv["utilization_pct"] = np.nan
    data_source = "usage_count_column"
    rec = None
    if use_records:
        rec = _prepare_records(issue_records, set(inv["equipment_id"]), warnings)
        if rec.empty and ps_in is None and pe_in is None:
            warnings.append("Issue records are empty and no period was given; falling back "
                            "to the usage_count column.")
            use_records = False
            if "usage_count" not in inv.columns:
                raise LabMateDataError("No usable issue records and no 'usage_count' column.")

    if use_records:
        data_source = "issue_records"
        if rec.empty:
            ps, pe = ps_in, pe_in
        else:
            ps = ps_in or rec["issue_date"].min()
            pe = pe_in or max(rec["issue_date"].max(), rec["return_date"].max()
                              if rec["return_date"].notna().any() else rec["issue_date"].max())
        if ps_in is None or pe_in is None:
            if ps_in is None and pe_in is None:
                warnings.append(f"Analysis period inferred from records: {ps.date()} to {pe.date()}.")
            else:
                warnings.append("Only one period bound was provided; the other was inferred.")
            if ps is None or pe is None or pe < ps:
                raise LabMateDataError("Could not determine a valid analysis period; pass both "
                                       "'period_start' and 'period_end'.")
        period_days = int((pe - ps).days) + 1
        period = {"start": ps.strftime("%Y-%m-%d"), "end": pe.strftime("%Y-%m-%d"), "days": period_days}

        in_period = rec[(rec["issue_date"] >= ps) & (rec["issue_date"] <= pe)]
        counts = in_period.groupby("equipment_id").size()
        inv["usage_count"] = inv["equipment_id"].map(counts).fillna(0).astype(int)

        overlap = rec[(rec["issue_date"] <= pe) & (rec["return_date"].isna() | (rec["return_date"] >= ps))]
        n_open = int(overlap["return_date"].isna().sum())
        if n_open:
            warnings.append(f"{n_open} record(s) have no return_date; treated as still issued "
                            "until the end of the period.")
        o_start = overlap["issue_date"].where(overlap["issue_date"] > ps, ps)
        o_end = overlap["return_date"].fillna(pe).where(overlap["return_date"].fillna(pe) < pe, pe)
        unit_days = ((o_end - o_start).dt.days + 1).clip(lower=1) * overlap["quantity"]
        per_item = unit_days.groupby(overlap["equipment_id"]).sum()
        capacity = inv["total_quantity"] * period_days
        util = inv["equipment_id"].map(per_item).fillna(0) / capacity.where(capacity > 0) * 100
        over = util > 100
        if over.any():
            warnings.append(f"{int(over.sum())} item(s) exceeded 100% utilisation (inconsistent "
                            "quantities or overlapping records); values capped at 100.")
        inv["utilization_pct"] = util.clip(upper=100)

        if not rec.empty:
            last_rec = rec.groupby("equipment_id")["issue_date"].max()
            inv["last_used_date"] = pd.concat(
                [inv["equipment_id"].map(last_rec), inv["last_used_date"]], axis=1).max(axis=1)
    else:
        usage = inv["usage_count"]
        bad = usage.isna() | (usage < 0)
        if bad.any():
            warnings.append(f"{int(bad.sum())} item(s) had a missing/negative usage_count; "
                            "treated as 0.")
        inv["usage_count"] = usage.mask(bad, 0).fillna(0).round().astype(int)

    # ---- derived columns ------------------------------------------------------
    t = inv.copy()
    total_usage = int(t["usage_count"].sum())
    t["usage_share_pct"] = (t["usage_count"] / total_usage * 100) if total_usage else 0.0
    t["usage_per_unit"] = t["usage_count"] / t["total_quantity"].where(t["total_quantity"] > 0)
    t["days_since_last_use"] = (as_of - t["last_used_date"]).dt.days.clip(lower=0)
    t["usage_class"] = _classify(t["usage_count"], frequent_quantile, low_quantile)

    util_available = bool(use_records and t["utilization_pct"].notna().any())
    s = t["usage_count"]
    top3_share = round(float(s.nlargest(3).sum() / total_usage * 100), 1) if total_usage else None
    summary = {
        "total_equipment": int(len(t)),
        "total_usage": total_usage,
        "mean_usage": round_or_none(s.mean()),
        "median_usage": round_or_none(s.median()),
        "max_usage": int(s.max()),
        "frequent_count": int((t["usage_class"] == CLASS_FREQUENT).sum()),
        "underutilized_count": int((t["usage_class"] == CLASS_UNDER).sum()),
        "zero_usage_count": int((t["usage_class"] == CLASS_ZERO).sum()),
        "top3_usage_share_pct": top3_share,
        "utilization_available": util_available,
        "mean_utilization_pct": round_or_none(t["utilization_pct"].mean()) if util_available else None,
        "utilization_note": (
            "Utilisation % = borrowed unit-days / (total_quantity x period days) x 100."
            if util_available else
            "Utilisation % not calculated: requires issue records with issue/return dates "
            "and a valid total_quantity."),
    }

    cols = ["equipment_id", "equipment_name", "category", "lab_location", "total_quantity",
            "available_quantity", "usage_count", "usage_share_pct", "usage_per_unit",
            "utilization_pct", "last_used_date", "days_since_last_use", "usage_class"]
    t = t[cols].sort_values(["usage_count", "equipment_name"], ascending=[False, True]).reset_index(drop=True)
    for c in ("usage_share_pct", "usage_per_unit", "utilization_pct"):
        t[c] = t[c].round(2)

    cat = (t.groupby("category")
             .agg(equipment_items=("equipment_id", "count"), total_usage=("usage_count", "sum"),
                  zero_usage_items=("usage_class", lambda x: int((x == CLASS_ZERO).sum())),
                  mean_utilization_pct=("utilization_pct", "mean"))
             .reset_index().sort_values("total_usage", ascending=False))
    cat["mean_utilization_pct"] = cat["mean_utilization_pct"].round(2)

    def pick(cls: str) -> List[Dict[str, Any]]:
        return t[t["usage_class"] == cls][
            ["equipment_id", "equipment_name", "category", "usage_count", "usage_share_pct",
             "utilization_pct", "lab_location"]].to_dict("records")

    result: Dict[str, Any] = {
        "status": "ok",
        "message": f"Analysed {len(t)} equipment item(s).",
        "data_source": data_source,
        "period": period,
        "summary": summary,
        "equipment": t.to_dict("records"),
        "frequently_used": pick(CLASS_FREQUENT),
        "underutilized": pick(CLASS_UNDER),
        "zero_usage": pick(CLASS_ZERO),
        "category_summary": cat.to_dict("records"),
        "suggestions": _suggestions(t, summary, dormant_days),
        "warnings": warnings,
        "outputs": {},
    }
    if output_dir:
        result["outputs"] = _write_outputs(result, t, Path(output_dir), report_label, top_n)
    return jsonable(result)


def _blank_summary() -> Dict[str, Any]:
    return {"total_equipment": 0, "total_usage": 0, "mean_usage": None, "median_usage": None,
            "max_usage": 0, "frequent_count": 0, "underutilized_count": 0, "zero_usage_count": 0,
            "top3_usage_share_pct": None, "utilization_available": False,
            "mean_utilization_pct": None, "utilization_note": "No data."}
