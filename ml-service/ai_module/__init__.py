"""LabMate AI - AI/ML module (Member 3).

Public API (import these in the backend)::

    from ai_module import recommend_equipment, analyze_usage, analyze_maintenance

Each function takes a pandas DataFrame *or* a list of dict rows (e.g. from
``sqlite3`` with ``row_factory = sqlite3.Row``) and returns a JSON-safe dict.
"""

from .common import LabMateDataError
from .maintenance_analysis import analyze_maintenance, evaluate_failure_model
from .recommendation import recommend_equipment
from .usage_analysis import analyze_usage

__version__ = "1.0.0"
__all__ = [
    "recommend_equipment",
    "analyze_usage",
    "analyze_maintenance",
    "evaluate_failure_model",
    "LabMateDataError",
]
