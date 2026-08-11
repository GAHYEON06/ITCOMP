import uuid, json
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
import models
from models import UserSetting, User
from .deps import current_user

router = APIRouter(prefix="/settings", tags=["User Settings"])

def _ensure_setting(db, uid):
    s = db.query(UserSetting).filter_by(user_id=uid).first()
    if not s:
        s = UserSetting(id=str(uuid.uuid4()), user_id=uid)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s

class SettingsPatchReq(BaseModel):
    notifications_enabled: Optional[bool] = None
    location_sharing: Optional[bool] = None
    dark_mode: Optional[bool] = None
    is_test_mode: Optional[bool] = None
    is_power_button_emergency: Optional[bool] = None
    is_shake_emergency: Optional[bool] = None
    is_vibration_enabled: Optional[bool] = None
    is_sound_enabled: Optional[bool] = None
    has_seen_security_help: Optional[bool] = None

@router.get("")
def get_settings(db: Session = Depends(get_db), u: User = Depends(current_user)):
    s = _ensure_setting(db, u.id)
    return {"data": {
        "notifications_enabled": s.notifications_enabled,
        "location_sharing": s.location_sharing,
        "dark_mode": s.dark_mode,
        "emergency_contacts": json.loads(s.emergency_contacts or "[]"),
        "is_test_mode": s.is_test_mode,
        "is_power_button_emergency": s.is_power_button_emergency,
        "is_shake_emergency": s.is_shake_emergency,
        "is_vibration_enabled": s.is_vibration_enabled,
        "is_sound_enabled": s.is_sound_enabled,
        "has_seen_security_help": s.has_seen_security_help
    }}

@router.patch("")
def patch_settings(data: SettingsPatchReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    s = _ensure_setting(db, u.id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    return {"status": "ok"}