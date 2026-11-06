"""Module 1 - Smart Equipment Recommendation.

Recommends *available* alternative laboratory equipment for a student's
requirement using TF-IDF vectors and cosine similarity over each item's
name, category, specifications and description.

IMPORTANT LIMITATION (also returned in every result): the score measures
*text similarity only*.  It never proves technical compatibility.  A lab
in-charge must confirm that a recommended item really meets the requirement.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .common import (
    LabMateDataError,
    jsonable,
    prepare_inventory,
    round_or_none,
)

REQUIRED_COLUMNS = ["equipment_name", "category", "description", "available_quantity"]
OPTIONAL_COLUMNS = ["specifications", "lab_location", "total_quantity"]

# Weighting: repeating a field in the "document" raises its TF-IDF weight.
NAME_WEIGHT = 3
CATEGORY_WEIGHT = 2

DEFAULT_TOP_N = 5
DEFAULT_MIN_SCORE = 0.05
METHOD = (
    "TF-IDF (unigrams+bigrams, sublinear tf, English stop-words) "
    "+ cosine similarity over name, category, specifications and description"
)
DISCLAIMER = (
    "Relevance scores measure text similarity only. They do NOT confirm technical "
    "compatibility, ratings or suitability. Please verify specifications with the "
    "lab in-charge before relying on a recommendation."
)


def _build_documents(df: pd.DataFrame) -> List[str]:
    """One text 'document' per equipment row (name/category repeated to up-weight)."""
    docs = []
    for name, cat, spec, desc in zip(
        df["equipment_name"], df["category"], df["specifications"], df["description"]
    ):
        docs.append(" ".join([name] * NAME_WEIGHT + [cat] * CATEGORY_WEIGHT + [spec, desc]))
    return docs


def _score_band(score: float) -> str:
    if score >= 0.50:
        return "strong text match"
    if score >= 0.25:
        return "moderate text match"
    return "weak text match"


def _top_terms(contrib: np.ndarray, vocab: np.ndarray, limit: int = 5) -> List[str]:
    """Highest-contributing shared terms; drop unigrams already inside a chosen bigram."""
    order = np.argsort(contrib)[::-1]
    chosen = [str(vocab[i]) for i in order if contrib[i] > 0][: limit + 3]
    bigram_words = {w for t in chosen if " " in t for w in t.split()}
    terms = [t for t in chosen if " " in t or t not in bigram_words]
    return terms[:limit]


def _empty_result(status: str, message: str, query: str, warnings: List[str],
                  excluded_unavailable: int = 0) -> Dict[str, Any]:
    return {
        "status": status,
        "message": message,
        "query_used": query,
        "recommendations": [],
        "excluded_unavailable_count": excluded_unavailable,
        "method": METHOD,
        "disclaimer": DISCLAIMER,
        "warnings": warnings,
    }


def recommend_equipment(
    query: Optional[str],
    equipment_data: Any,
    top_n: int = DEFAULT_TOP_N,
    requested_equipment_id: Optional[str] = None,
    category: Optional[str] = None,
    min_score: float = DEFAULT_MIN_SCORE,
) -> Dict[str, Any]:
    """Recommend up to ``top_n`` available alternatives for a requirement.

    Parameters
    ----------
    query:
        Free-text student requirement, e.g. ``"need to view stained cell slides"``.
        May be ``None`` if ``requested_equipment_id`` is given.
    equipment_data:
        DataFrame or list of dict rows. Required columns: ``equipment_id``,
        ``equipment_name``, ``category``, ``description``, ``available_quantity``.
        Optional: ``specifications``, ``lab_location``, ``total_quantity``.
    top_n:
        Number of results (1-20, default 5).
    requested_equipment_id:
        Find alternatives to this specific item (it is excluded from results and
        its own text is used as the query, together with ``query`` if given).
    category:
        Optional case-insensitive category filter.
    min_score:
        Drop results below this cosine similarity (0-1, default 0.05).

    Returns
    -------
    dict with ``status`` ("ok", "no_match", "empty_inventory",
    "no_available_equipment"), ``recommendations`` (ranked list), ``disclaimer``
    and ``warnings``.  Invalid arguments raise :class:`LabMateDataError`.
    """
    warnings: List[str] = []

    # ---- argument validation ------------------------------------------------
    if isinstance(top_n, bool) or not isinstance(top_n, int) or not 1 <= top_n <= 20:
        raise LabMateDataError("'top_n' must be an integer between 1 and 20.")
    if not isinstance(min_score, (int, float)) or not 0 <= min_score <= 1:
        raise LabMateDataError("'min_score' must be a number between 0 and 1.")
    if query is not None and not isinstance(query, str):
        raise LabMateDataError("'query' must be a string.")
    query_text = (query or "").strip()
    if len(query_text) > 2000:
        query_text = query_text[:2000]
        warnings.append("Query was longer than 2000 characters and was truncated.")
    if not query_text and requested_equipment_id is None:
        raise LabMateDataError(
            "Provide a non-empty 'query' or a 'requested_equipment_id'."
        )
    if query_text and len(query_text) < 2:
        raise LabMateDataError("'query' is too short to analyse.")

    # ---- data preparation -----------------------------------------------------
    df = prepare_inventory(
        equipment_data, REQUIRED_COLUMNS,
        text_cols=["equipment_name", "category", "description", "specifications", "lab_location"],
        numeric_cols=["available_quantity", "total_quantity"],
        warnings=warnings,
    )
    if df.empty:
        return _empty_result("empty_inventory",
                             "The equipment dataset is empty - nothing to recommend.",
                             query_text, warnings)

    n_missing_qty = int(df["available_quantity"].isna().sum())
    if n_missing_qty:
        warnings.append(
            f"{n_missing_qty} item(s) had a missing/invalid available_quantity and were "
            "treated as unavailable."
        )
    df["available_quantity"] = df["available_quantity"].fillna(0)
    df["is_available"] = df["available_quantity"] > 0

    # ---- resolve the query ----------------------------------------------------
    requested_row = None
    if requested_equipment_id is not None:
        rid = str(requested_equipment_id).strip()
        match = df[df["equipment_id"] == rid]
        if match.empty:
            raise LabMateDataError(f"requested_equipment_id '{rid}' not found in equipment_data.")
        requested_row = match.iloc[0]
        base = _build_documents(match.reset_index(drop=True))[0]
        query_text = f"{query_text} {base}".strip()

    # ---- candidates: available only, excluding the requested item ------------
    pool = df if requested_row is None else df[df["equipment_id"] != requested_row["equipment_id"]]
    excluded_unavailable = int((~pool["is_available"]).sum())
    cands = pool[pool["is_available"]]
    if category:
        cands = cands[cands["category"].str.lower() == str(category).strip().lower()]
    cands = cands.reset_index(drop=True)
    if cands.empty:
        return _empty_result(
            "no_available_equipment",
            "No available equipment matches the filters (all candidates are unavailable "
            "or the category filter removed them).",
            query_text, warnings, excluded_unavailable)

    # ---- TF-IDF + cosine ------------------------------------------------------
    # The vectoriser is fitted ONLY on the candidate corpus; the query is merely
    # transformed (no query text leaks into the vocabulary / IDF statistics).
    docs = _build_documents(cands)
    vectoriser = TfidfVectorizer(
        lowercase=True, stop_words="english", ngram_range=(1, 2), sublinear_tf=True
    )
    try:
        doc_matrix = vectoriser.fit_transform(docs)
    except ValueError:  # e.g. all documents contain only stop-words
        return _empty_result("no_match", "Equipment descriptions contain no usable text.",
                             query_text, warnings, excluded_unavailable)
    query_vec = vectoriser.transform([query_text])
    if query_vec.nnz == 0:
        return _empty_result(
            "no_match",
            "None of the words in the requirement appear in the equipment catalogue. "
            "Try different or more specific keywords.",
            query_text, warnings, excluded_unavailable)

    scores = cosine_similarity(query_vec, doc_matrix).ravel()
    vocab = np.asarray(vectoriser.get_feature_names_out())

    cands = cands.assign(_score=scores)
    cands = cands[cands["_score"] >= max(min_score, 1e-9)]
    if cands.empty:
        return _empty_result(
            "no_match",
            f"No available equipment reached the minimum relevance score ({min_score}).",
            query_text, warnings, excluded_unavailable)
    cands = cands.sort_values(
        ["_score", "available_quantity", "equipment_name"], ascending=[False, False, True]
    ).head(top_n)

    # ---- build explainable output --------------------------------------------
    recs: List[Dict[str, Any]] = []
    for rank, (idx, row) in enumerate(cands.iterrows(), start=1):
        # recompute row position in the doc matrix (cands index was reset before filtering)
        contrib = query_vec.multiply(doc_matrix[idx]).toarray().ravel()
        terms = _top_terms(contrib, vocab)
        parts = [f"{_score_band(row['_score']).capitalize()} (cosine similarity "
                 f"{row['_score']:.2f})."]
        if terms:
            parts.append("Shared key terms: " + ", ".join(terms) + ".")
        if requested_row is not None and row["category"].lower() == requested_row["category"].lower():
            parts.append(f"Same category as the requested item ({row['category']}).")
        stock = f"{int(row['available_quantity'])} unit(s) currently available"
        if "total_quantity" in row and pd.notna(row.get("total_quantity")):
            stock += f" of {int(row['total_quantity'])}"
        parts.append(stock + (f" in {row['lab_location']}." if row["lab_location"] else "."))
        parts.append("Text similarity only - verify technical compatibility.")
        recs.append({
            "rank": rank,
            "equipment_id": row["equipment_id"],
            "equipment_name": row["equipment_name"],
            "category": row["category"],
            "lab_location": row["lab_location"],
            "available_quantity": int(row["available_quantity"]),
            "relevance_score": round_or_none(row["_score"], 4),
            "match_strength": _score_band(row["_score"]),
            "matched_terms": terms,
            "explanation": " ".join(parts),
        })

    return jsonable({
        "status": "ok",
        "message": f"Found {len(recs)} available alternative(s).",
        "query_used": query_text if requested_row is None else
                      f"alternatives to {requested_row['equipment_id']} ({requested_row['equipment_name']})"
                      + (f" + '{(query or '').strip()}'" if (query or "").strip() else ""),
        "recommendations": recs,
        "excluded_unavailable_count": excluded_unavailable,
        "method": METHOD,
        "disclaimer": DISCLAIMER,
        "warnings": warnings,
    })
