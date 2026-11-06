
import os
from datetime import date
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pymongo import MongoClient

from ai_module import (
    LabMateDataError,
    analyze_maintenance,
    analyze_usage,
    recommend_equipment,
)
from mongo_adapter import load_labmate_data

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB")

if not MONGODB_URI:
    raise RuntimeError("Set MONGODB_URI in ml-service/.env")

client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000
)

if MONGODB_DB:
    db = client[MONGODB_DB]
else:
    db = client.get_default_database()

if db is None:
    raise RuntimeError("Set MONGODB_DB in .env")

app = FastAPI(
    title="LabMate-AI ML Service",
    version="1.0.0"
)


def get_data():
    try:
        return load_labmate_data(db)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"MongoDB data error: {exc}"
        )


@app.get("/")
def home():
    return {
        "status": "ok",
        "service": "LabMate-AI ML Service"
    }


@app.get("/health")
def health():
    try:
        client.admin.command("ping")
        return {
            "status": "ok",
            "database": db.name
        }
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"MongoDB connection failed: {exc}"
        )


@app.get("/ai/recommend")
def recommendation(
    q: str = Query(..., min_length=2),
    top_n: int = 5
):
    equipment, _ = get_data()

    try:
        return recommend_equipment(
            q,
            equipment,
            top_n=top_n
        )
    except LabMateDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/ai/usage")
def usage(
    start: Optional[date] = None,
    end: Optional[date] = None
):
    equipment, records = get_data()

    if not records:
        return {
            "status": "no_data",
            "message": "No completed bookings available for usage analysis.",
            "summary": {
                "total_equipment": len(equipment),
                "total_completed_bookings": 0
            },
            "usage": [],
            "warnings": [
                "Usage analysis requires completed booking records.",
                "Cancelled bookings are excluded."
            ]
        }

    try:
        return analyze_usage(
            equipment,
            issue_records=records,
            period_start=start.isoformat() if start else None,
            period_end=end.isoformat() if end else None,
            output_dir=str(Path(__file__).parent / "reports"),
            report_label="LabMate AI completed bookings"
        )
    except LabMateDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/ai/maintenance")
def maintenance():
    equipment, _ = get_data()

    try:
        result = analyze_maintenance(
            equipment,
            output_dir=str(Path(__file__).parent / "reports"),
            report_label="LabMate AI condition-based assessment"
        )

        result.setdefault("warnings", []).append(
            "Maintenance analysis is condition-based, "
            "not a trained failure prediction model."
        )

        return result

    except LabMateDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
