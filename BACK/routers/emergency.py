import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models
from models import SirenLog, DisguiseLog, User, UserRelationship
from .deps import current_user
from .fcm_service import send_fcm_notification  # FCM 전송 모듈

router = APIRouter(prefix="/emergency", tags=["Emergency Services"])

@router.post("/siren/me")
def siren_me(
    lat: float = Query(0.0),
    lng: float = Query(0.0),
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    """
    SOS 사이렌 호신용 신호 접수 및 보호자 FCM 푸시 알림 전송 (DB 저장 포함)
    """
    try:
        # 1. 사이렌 발생 이력 DB 저장 (DB 테이블 스키마 구조 반영)
        siren_entry = SirenLog(
            id=str(uuid.uuid4()),
            session_id=getattr(u, "id", str(u.id)),  # user_id 또는 session_id 매핑
            latitude=str(lat),                       # varchar 타입 맞춤
            longitude=str(lng),                      # varchar 타입 맞춤
            address="",
            audio_url="",
            created_at=datetime.utcnow()
        )
        db.add(siren_entry)
        db.commit()

    except Exception as e:
        db.rollback()
        print(f"[SOS DB 저장 실패]: {str(e)}")
        # DB 오류 발생 시에도 푸시 알림 로직은 진행할 수 있도록 예외 핸들링

    # 2. 로그인한 사용자와 연결된 보호자(Guardian) 목록 조회
    relationships = db.query(UserRelationship).filter_by(ward_id=u.id).all()
    guardian_ids = [rel.guardian_id for rel in relationships]
    guardians = db.query(User).filter(User.id.in_(guardian_ids)).all()

    # 3. 연결된 보호자들에게 FCM 푸시 알림 발송
    notified_count = 0
    for guardian in guardians:
        if guardian.fcm_token:
            success = send_fcm_notification(
                target_token=guardian.fcm_token,
                title="🚨 [긴급 SOS] 피보호자 위험 경고",
                body=f"[{u.username}] 피보호자가 긴급 상황을 알렸습니다! 위치를 확인해 주세요.",
                data_payload={
                    "type": "EMERGENCY_SOS",
                    "ward_id": str(u.id),
                    "lat": str(lat),
                    "lng": str(lng)
                }
            )
            if success:
                notified_count += 1

    return {
        "status": "ok",
        "message": f"SOS 사이렌 신호가 접수되었습니다. (보호자 {notified_count}명에게 알림 전송)",
        "notified_guardians": notified_count
    }


@router.post("/disguise/me")
def disguise_me(
    lat: float = Query(0.0),
    lng: float = Query(0.0),
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    """
    위장성 보안 화면 위치 기록 DB 저장
    """
    try:
        disguise_entry = DisguiseLog(
            id=str(uuid.uuid4()),
            user_id=str(u.id),
            latitude=float(lat),
            longitude=float(lng),
            created_at=datetime.utcnow()
        )
        db.add(disguise_entry)
        db.commit()

        return {
            "status": "ok",
            "message": "위장 모드 위치가 성공적으로 기록되었습니다."
        }
    except Exception as e:
        db.rollback()
        print(f"[위장 모드 DB 저장 실패]: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"위장 모드 기록 중 DB 오류 발생: {str(e)}"
        )