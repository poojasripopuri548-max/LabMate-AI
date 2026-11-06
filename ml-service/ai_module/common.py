"""Shared helpers for the LabMate AI ML module.

Everything here is deliberately small and dependency-light so the three
analysis modules (recommendation, usage, maintenance) stay focused on their
own logic.  Responsibilities:

* Accept the data shapes a backend will realistically pass (DataFrame,
  list of dicts, list of ``sqlite3.Row``) and turn them into a clean DataFrame.
* Validate required columns and raise a single, catchable exception type.
* Convert results into JSON-safe Python objects (no numpy / NaN / Timestamp).
* Save simple bar charts with matplotlib's object-oriented API (no global
  pyplot state, so it is safe to call inside a web backend).
"""

from __future__ import annotations

import datetime as _dt
import math
from pathlib import Path
from typing import Any, Iterable, List, Optional, Sequence

import numpy as np
import pandas as pd


class LabMateDataError(ValueError):
    """Raised when the input passed to an AI function is invalid.

    Subclasses ``ValueError`` so backends can catch either type.
    """


# --------------------------------------------------------------------------
# Input conversion / validation
# --------------------------------------------------------------------------
def to_dataframe(data: Any, name: str = "data") -> pd.DataFrame:
    """Return a *copy* of ``data`` as a DataFrame.

    Accepts a DataFrame, or a list/tuple of dict-like rows (dicts or
    ``sqlite3.Row`` objects).  An empty list gives an empty DataFrame.
    """
    if data is None:
        raise LabMateDataError(
            f"'{name}' is None. Pass a pandas DataFrame or a list of dict rows."
        )
    if isinstance(data, pd.DataFrame):
        return data.copy()
    if isinstance(data, (list, tuple)):
        if len(data) == 0:
            return pd.DataFrame()
        if all(hasattr(row, "keys") for row in data):
            return pd.DataFrame([dict(row) for row in data])
    raise LabMateDataError(
        f"'{name}' must be a pandas DataFrame or a list of dict rows "
        f"(got {type(data).__name__})."
    )


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Lower-case column names and replace spaces with underscores."""
    df = df.copy()
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


def require_columns(df: pd.DataFrame, required: Sequence[str], name: str) -> None:
    """Raise :class:`LabMateDataError` if any required column is missing."""
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise LabMateDataError(
            f"'{name}' is missing required column(s): {missing}. "
            f"Columns received: {list(df.columns)}"
        )


def clean_text(series: pd.Series) -> pd.Series:
    """Missing -> empty string, everything else -> stripped string."""
    return series.fillna("").astype(str).str.strip()


def parse_dates(series: pd.Series) -> pd.Series:
    """Parse to timezone-naive, midnight-normalised timestamps; bad -> NaT."""
    try:
        out = pd.to_datetime(series, errors="coerce", format="mixed")
    except (TypeError, ValueError):
        out = pd.to_datetime(series, errors="coerce")
    if getattr(out.dt, "tz", None) is not None:
        out = out.dt.tz_localize(None)
    return out.dt.normalize()


def to_timestamp(value: Any, name: str) -> Optional[pd.Timestamp]:
    """Convert a scalar date-like value to a normalised Timestamp (None stays None)."""
    if value is None:
        return None
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        raise LabMateDataError(f"'{name}' is not a valid date: {value!r}")
    if ts.tzinfo is not None:
        ts = ts.tz_localize(None)
    return ts.normalize()


def prepare_inventory(
    data: Any,
    required: Sequence[str],
    text_cols: Iterable[str],
    numeric_cols: Iterable[str],
    warnings: List[str],
    name: str = "equipment_data",
) -> pd.DataFrame:
    """Validate and clean an equipment table.

    * normalises column names
    * requires ``required`` columns (``equipment_id`` is always required)
    * drops rows with a blank ``equipment_id`` and duplicate ids (keeps first)
    * text columns: missing -> "" (created if absent)
    * numeric columns: coerced to numbers, invalid -> NaN (only if present)

    Human-readable notes about anything altered are appended to ``warnings``.
    """
    df = normalise_columns(to_dataframe(data, name))
    if df.empty:
        return df
    require_columns(df, ["equipment_id", *required], name)

    ids = clean_text(df["equipment_id"])
    blank = ids.str.lower().isin(["", "nan", "none", "null"])
    if blank.any():
        warnings.append(f"{int(blank.sum())} row(s) without an equipment_id were ignored.")
    df = df.loc[~blank].copy()
    df["equipment_id"] = ids.loc[~blank]

    dup = df["equipment_id"].duplicated(keep="first")
    if dup.any():
        warnings.append(
            f"{int(dup.sum())} duplicate equipment_id row(s) ignored (first occurrence kept)."
        )
        df = df.loc[~dup].copy()

    for col in text_cols:
        df[col] = clean_text(df[col]) if col in df.columns else ""
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.reset_index(drop=True)


# --------------------------------------------------------------------------
# JSON-safe conversion
# --------------------------------------------------------------------------
def jsonable(obj: Any) -> Any:
    """Recursively convert numpy / pandas objects into plain JSON-safe types.

    NaN / NaT / pd.NA become ``None``; Timestamps become ``YYYY-MM-DD``.
    """
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, pd.DataFrame):
        return jsonable(obj.to_dict("records"))
    if isinstance(obj, pd.Series):
        return jsonable(obj.tolist())
    if isinstance(obj, (list, tuple, set)):
        return [jsonable(v) for v in obj]
    if obj is None or obj is pd.NaT or obj is pd.NA:
        return None
    if isinstance(obj, (pd.Timestamp, _dt.datetime, _dt.date)):
        ts = pd.Timestamp(obj)
        return None if pd.isna(ts) else ts.strftime("%Y-%m-%d")
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        value = float(obj)
        return None if (math.isnan(value) or math.isinf(value)) else value
    return obj if isinstance(obj, str) else str(obj)


def round_or_none(value: Any, digits: int = 2) -> Optional[float]:
    """Round a number, returning None for missing / non-finite values."""
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return round(value, digits)


# --------------------------------------------------------------------------
# Charts (matplotlib object-oriented API; no pyplot global state)
# --------------------------------------------------------------------------
def _short(label: str, width: int = 30) -> str:
    return label if len(label) <= width else label[: width - 1] + "…"


def save_bar_chart(
    path: Path,
    labels: Sequence[str],
    values: Sequence[float],
    title: str,
    xlabel: str,
    horizontal: bool = True,
    colors: Optional[Sequence[str]] = None,
    footer: str = "",
) -> str:
    """Save a simple labelled bar chart as PNG and return the path as a string."""
    from matplotlib.figure import Figure  # lazy import keeps module import cheap

    labels = [_short(str(label)) for label in labels]
    height = max(3.2, 0.42 * len(labels) + 1.6) if horizontal else 4.6
    fig = Figure(figsize=(9, height), dpi=110)
    ax = fig.subplots()
    bar_colors = list(colors) if colors else "#3b6ea5"
    if horizontal:
        bars = ax.barh(labels, values, color=bar_colors)
        ax.invert_yaxis()
        ax.set_xlabel(xlabel)
        for bar, val in zip(bars, values):
            ax.text(bar.get_width(), bar.get_y() + bar.get_height() / 2,
                    f" {val:g}", va="center", fontsize=8)
    else:
        bars = ax.bar(labels, values, color=bar_colors)
        ax.set_ylabel(xlabel)
        ax.tick_params(axis="x", labelrotation=30)
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(),
                    f"{val:g}", ha="center", va="bottom", fontsize=8)
    ax.set_title(title, fontsize=11, fontweight="bold")
    ax.spines[["top", "right"]].set_visible(False)
    if footer:
        fig.text(0.01, 0.01, footer, fontsize=7, color="#666666")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    return str(path)
