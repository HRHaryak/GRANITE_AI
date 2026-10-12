from fastapi import APIRouter
from app.ai.capabilities import check_capabilities

router = APIRouter(tags=["capabilities"])


@router.get("/capabilities")
async def get_capabilities() -> dict:
    """Get the status of all AI capabilities."""
    return check_capabilities()
