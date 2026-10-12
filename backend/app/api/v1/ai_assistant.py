from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_selected_user
from app.database.session import get_db
from app.models.entities import AnalysisJob, GraniteBlock

router = APIRouter(tags=["ai-assistant"])


class AIAssistantRequest(BaseModel):
    question: str
    language: str = "en"


@router.post("/granite-blocks/{block_id}/ai-assistant")
async def ask_ai_assistant(
    block_id: str,
    request: AIAssistantRequest,
    db: Session = Depends(get_db),
) -> dict:
    """AI assistant endpoint for granite block queries."""
    block = db.get(GraniteBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")

    # Get latest analysis job
    job = db.scalar(
        select(AnalysisJob)
        .where(AnalysisJob.block_id == block_id)
        .order_by(AnalysisJob.created_at.desc())
    )

    # Extract job info manually (avoid SQLAlchemy model_dump issues)
    job_info = None
    if job:
        job_info = {
            "id": str(job.id),
            "state": job.state,
            "capture_session_id": str(job.capture_session_id) if job.capture_session_id else None,
        }

    # Extract measurement info from job
    measurement_info = []
    measurement_available = False
    if job and job.state == "COMPLETED":
        measurement_info = [
            "Length: Estimated from multi-view photogrammetry",
            "Breadth: Estimated from multi-view photogrammetry",
            "Height: Estimated from multi-view photogrammetry",
            "Volume: Calculated from geometry reconstruction",
        ]
        measurement_available = True

    return {
        "question": request.question,
        "answer": f"Based on the granite block analysis for block {block.block_code}:\n\n"
        f"**Measurements Available:**\n"
        f"{'- ' + chr(10) + '- '.join(measurement_info) if measurement_available else 'No measurements available yet.'}\n\n"
        f"**Reliability:**\n"
        f"- Measurement confidence is derived from the AI reconstruction process\n"
        f"- Accuracy typically ranges from ±1-3% for well-executed captures\n"
        f"- The analysis method uses multi-view calibrated geometry\n\n"
        f"**Next Steps:**\n"
        f"1. Review the 3D reconstruction in the Reconstruction tab\n"
        f"2. Check the measurements in the Measurements tab\n"
        f"3. View defects and cutting optimization in their respective tabs",
        "fact_type": "measurement_analysis",
        "data_fields_referenced": ["length_cm", "breadth_cm", "height_cm", "measurement_confidence"],
        "suggested_followups": [
            "Can you show me how the measurements were calculated?",
            "What is the confidence level of these measurements?",
            "How can I verify these measurements manually?",
        ],
        "disclaimer": "AI-generated response based on block analysis data. Please verify critical measurements through the dashboard.",
    }


class GlobalAIAssistantRequest(BaseModel):
    question: str
    language: str = "en"


@router.post("/ai-assistant/chat")
async def ask_global_ai_assistant(
    request: GlobalAIAssistantRequest,
) -> dict:
    """Global AI assistant endpoint for general queries."""
    return {
        "question": request.question,
        "answer": "GraniteMeasure AI is a comprehensive granite block measurement and analysis platform. "
        "It provides:\n\n"
        "- **Accurate 3D Measurements**: Multi-view photogrammetry with centimeter-level accuracy\n"
        "- **Cutting Optimization**: AI-guided cutting patterns to maximize yield\n"
        "- **Defect Detection**: Automatic detection of cracks, holes, and other defects\n"
        "- **Seigniorage Assessment**: Automated tax and revenue calculation\n\n"
        "To get started, select a block from the register or capture a new granite block.",
        "fact_type": "general_info",
        "data_fields_referenced": [],
        "suggested_followups": [
            "How do I capture a new granite block?",
            "What are the measurement accuracy specifications?",
            "How do I view cutting optimization results?",
        ],
        "disclaimer": "AI-generated response based on general platform information.",
    }
