
from datetime import datetime, timezone


def load_labmate_data(db):
    """
    Read equipment and completed bookings
    from the existing LabMate AI MongoDB database.
    """

    now = datetime.now(timezone.utc)

    # Fetch equipment
    equipment_docs = list(
        db["equipment"].find({
            "status": {"$ne": "retired"}
        })
    )

    # Find currently approved bookings
    approved_bookings = list(
        db["bookings"].find({
            "status": "approved",
            "startTime": {"$lte": now},
            "endTime": {"$gt": now}
        })
    )

    reserved = {}

    for booking in approved_bookings:
        equipment_id = str(booking.get("equipment"))
        quantity = int(booking.get("quantity", 0))

        reserved[equipment_id] = (
            reserved.get(equipment_id, 0) + quantity
        )

    equipment_rows = []

    for item in equipment_docs:

        equipment_id = str(item.get("_id"))
        total = int(item.get("totalQuantity", 0))

        condition = item.get("condition", "working")
        status = item.get("status", "active")

        working = (
            condition == "working"
            and status == "active"
        )

        available = (
            max(0, total - reserved.get(equipment_id, 0))
            if working else 0
        )

        specifications = item.get("specifications") or {}

        if not isinstance(specifications, dict):
            specifications = dict(specifications)

        equipment_rows.append({
            "equipment_id": equipment_id,
            "equipment_name": item.get("name", ""),
            "category": item.get("category", ""),
            "description": item.get("description", ""),
            "specifications": " ".join(
                f"{key}: {value}"
                for key, value in specifications.items()
            ),
            "total_quantity": total,
            "available_quantity": available,
            "lab_location": "",
            "maintenance_status": {
                "working": "Operational",
                "damaged": "Needs Inspection",
                "under_maintenance": "Under Maintenance"
            }.get(condition, "Unknown"),
            "damage_count": 0,
            "damage_severity": {
                "working": "None",
                "damaged": "Medium",
                "under_maintenance": "High"
            }.get(condition, "None")
        })

    # Fetch completed bookings for usage analysis
    completed_bookings = db["bookings"].find({
        "status": "completed"
    })

    usage_rows = []

    for booking in completed_bookings:

        usage_rows.append({
            "equipment_id": str(booking.get("equipment")),
            "issue_date": booking.get("startTime"),
            "return_date": booking.get("endTime"),
            "quantity": booking.get("quantity", 1)
        })

    return equipment_rows, usage_rows
