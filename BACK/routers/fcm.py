from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
import models
from models import User
from .deps import current_user

router = APIRouter(prefix="/fcm", tags=["Auth & User"])

class FcmReq(BaseModel):
    fcm_token: str

@router.post("/register")
def register_fcm(data: FcmReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    """
    FCM 푸시 토큰 등록 및 갱신
    """
    u.fcm_token = data.fcm_token
    db.commit()
    return {"status": "ok", "message": "FCM 토큰이 등록되었습니다."}