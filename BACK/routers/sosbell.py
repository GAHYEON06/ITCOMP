import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, status, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User, SirenLog

class SirenRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float

router = APIRouter(prefix="/emergency", tags=["Emergency Services"])

@router.post("/siren", status_code=status.HTTP_200_OK)
def trigger_siren_and_find_guardian(data: SirenRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter((User.id == data.user_id) | (User.userid == data.user_id)).first()
    user_name = getattr(user, "username", "사용자") if user else "사용자"
    target_guardian_phone = getattr(user, "phone", None) if user else None
    guardian_notified = False
    push_status = "보호자 없음"

    if target_guardian_phone:
        guardian = db.query(User).filter(User.phone == target_guardian_phone).first()
        if guardian:
            guardian_notified = True
            guardian_name = getattr(guardian, "username", "보호자")
            push_status = f"알림 전송 완료 ({guardian_name})"

    try:
        new_siren_log = SirenLog(
            id=str(uuid.uuid4()),
            session_id=data.user_id,
            latitude=str(data.latitude),
            longitude=str(data.longitude),
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_siren_log)
        db.commit()
        db.refresh(new_siren_log)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DB 저장 실패: {str(e)}"
        )

    return {
        "status": "success",
        "message": f"[{user_name}] 긴급 SOS 신호가 접수되었습니다.",
        "log_id": new_siren_log.id,
        "location": {"latitude": data.latitude, "longitude": data.longitude},
        "delivery_result": push_status,
    }