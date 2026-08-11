import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import DisguiseLog

class DisguiseRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float

router = APIRouter(prefix="/emergency", tags=["Disguise"])

@router.post("/disguise", status_code=status.HTTP_200_OK)
def trigger_disguise_mode(data: DisguiseRequest, db: Session = Depends(get_db)):
    try:
        new_log = DisguiseLog(
            id=str(uuid.uuid4()),
            user_id=data.user_id,
            lat=data.latitude,
            lng=data.longitude,
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        return {
            "status": "success",
            "message": "위장 모드가 기록되었습니다.",
            "log_id": new_log.id,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DB 저장 실패: {str(e)}",
        )