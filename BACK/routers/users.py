from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from database import get_db
import models
from models import User
from .deps import current_user

router = APIRouter(prefix="/users", tags=["Users"])

class UserProfileUpdateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    birthdate: Optional[date] = None

    # birthdate에 빈 문자열("")이 들어오면 date 파싱 전에 None으로 변환
    # (DATE 컬럼에 "" 저장 시 포맷 에러 발생하므로 필수 처리)
    @field_validator("birthdate", mode="before")
    @classmethod
    def empty_birthdate_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("gender", mode="before")
    @classmethod
    def empty_gender_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

@router.get("/me")
def get_my_profile(u: User = Depends(current_user)):
    """
    현재 로그인된 사용자 내 정보 전체 조회
    """
    return {
        "id": u.id,
        "userid": u.userid,
        "username": u.username or "",
        "name": u.username or "",      # 프론트엔드가 'name' 키를 참조할 경우를 위한 호환 필드
        "role": str(u.role).lower(),
        "wardcode": u.wardcode or "",
        "phone": u.phone or "",
        "email": u.email or "",
        "gender": u.gender,            # 값 없으면 null
        "birthdate": u.birthdate       # 값 없으면 null (date -> "YYYY-MM-DD"로 직렬화됨)
    }

@router.patch("/me")
def update_my_profile(
    req: UserProfileUpdateRequest,
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    """
    현재 로그인된 사용자 개인 정보 수정
    """
    # exclude_unset=True: 요청 바디에 아예 포함 안 된 필드는 건드리지 않음.
    # 포함됐지만 빈 값인 gender/birthdate는 위 validator에서 이미 None으로 정규화됨 -> NULL 저장.
    update_data = req.model_dump(exclude_unset=True)

    if "username" in update_data:
        u.username = update_data["username"]
    if "email" in update_data:
        u.email = update_data["email"]
    if "phone" in update_data:
        u.phone = update_data["phone"]
    if "gender" in update_data:
        u.gender = update_data["gender"]
    if "birthdate" in update_data:
        u.birthdate = update_data["birthdate"]

    db.commit()
    db.refresh(u)

    return {
        "status": "ok",
        "message": "개인 정보가 성공적으로 수정되었습니다.",
        "data": {
            "id": u.id,
            "userid": u.userid,
            "username": u.username,
            "email": u.email,
            "phone": u.phone,
            "gender": u.gender,
            "birthdate": u.birthdate
        }
    }