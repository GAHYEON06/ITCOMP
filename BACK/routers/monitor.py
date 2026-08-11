from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
from models import User, UserRelationship, SirenLog
from .deps import current_user
from .fcm_service import send_fcm_notification  # 👈 FCM 푸시 알림 발송 함수 임포트

router = APIRouter(prefix="/monitor", tags=["Monitor & Matching"])

class LinkReq(BaseModel):
    wardcode: str

class MonitorStartReq(BaseModel):
    start_loc: str
    dest_loc: str
    lat: float
    lng: float
    progress: int = 0
    estimated_time_minutes: int = 20

# 1. 보호자 -> 피보호자 연결
@router.post("/link")
def link_guardian(data: LinkReq, db: Session = Depends(get_db), u: User = Depends(current_user)):
    if str(u.role).lower() != "guardian":
        raise HTTPException(403, "보호자 계정만 피보호자를 연결할 수 있습니다.")

    ward = db.query(User).filter_by(wardcode=data.wardcode).first()
    if not ward:
        raise HTTPException(404, "피보호자를 찾을 수 없습니다.")
        
    if not db.query(UserRelationship).filter_by(guardian_id=u.id, ward_id=ward.id).first():
        db.add(UserRelationship(guardian_id=u.id, ward_id=ward.id))
        db.commit()
        
    # 🔔 연결 성공 시 피보호자에게 알림 전송 (선택사항)
    if ward.fcm_token:
        send_fcm_notification(
            target_token=ward.fcm_token,
            title="🔗 보호자 연결 완료",
            body=f"[{u.username}] 보호자님이 회원님과 연결되었습니다.",
            data_payload={"type": "LINK_SUCCESS", "guardian_id": u.id}
        )

    return {"status": "ok", "message": f"{ward.username} 피보호자와 성공적으로 연결되었습니다."}

# 2. [보호자 전용] 연결된 피보호자 목록 조회
@router.get("/wards")
def get_wards(db: Session = Depends(get_db), u: User = Depends(current_user)):
    if str(u.role).lower() != "guardian":
        raise HTTPException(403, "보호자만 연결된 피보호자 목록을 조회할 수 있습니다.")

    rels = db.query(UserRelationship).filter_by(guardian_id=u.id).all()
    ward_ids = [r.ward_id for r in rels]
    wards = db.query(User).filter(User.id.in_(ward_ids)).all()

    return {
        "status": "ok",
        "role": "guardian",
        "wards": [
            {
                "id": w.id,
                "username": w.username,
                "phone": w.phone or "",
                "wardcode": w.wardcode or ""
            } for w in wards
        ]
    }

# 3. [피보호자 전용] 나를 보호하는 보호자 목록 조회
@router.get("/guardians")
def get_guardians(db: Session = Depends(get_db), u: User = Depends(current_user)):
    if str(u.role).lower() != "ward":
        raise HTTPException(403, "피보호자만 연결된 보호자 목록을 조회할 수 있습니다.")

    rels = db.query(UserRelationship).filter_by(ward_id=u.id).all()
    guardian_ids = [r.guardian_id for r in rels]
    guardians = db.query(User).filter(User.id.in_(guardian_ids)).all()

    return {
        "status": "ok",
        "role": "ward",
        "guardians": [
            {
                "id": g.id,
                "username": g.username,
                "phone": g.phone or ""
            } for g in guardians
        ]
    }

# 4. [알림 핵심] 피보호자가 이동/길찾기 시작 시 보호자에게 FCM 알림 발송
@router.post("/start")
def monitor_start(
    data: MonitorStartReq, 
    db: Session = Depends(get_db), 
    u: User = Depends(current_user)
):
    if str(u.role).lower() != "ward":
        raise HTTPException(403, "피보호자만 이동 모니터링을 시작할 수 있습니다.")

    # 피보호자(u.id)와 연결된 보호자들 찾기
    rels = db.query(UserRelationship).filter_by(ward_id=u.id).all()
    guardian_ids = [r.guardian_id for r in rels]
    guardians = db.query(User).filter(User.id.in_(guardian_ids)).all()

    notified_count = 0
    # 연결된 모든 보호자들에게 푸시 알림 전송
    for g in guardians:
        if g.fcm_token:
            success = send_fcm_notification(
                target_token=g.fcm_token,
                title="🚶‍♂️ [안전 모니터링] 이동 시작",
                body=f"[{u.username}] 피보호자가 {data.dest_loc}(으)로 이동을 시작했습니다.",
                data_payload={
                    "type": "MONITOR_START",
                    "ward_id": u.id,
                    "dest_loc": data.dest_loc,
                    "lat": str(data.lat),
                    "lng": str(data.lng)
                }
            )
            if success:
                notified_count += 1

    return {
        "status": "ok", 
        "message": f"모니터링 시작 알림을 전송했습니다. (보호자 {notified_count}명 전송 성공)", 
        "lat": data.lat, 
        "lng": data.lng
    }

# 5. 피보호자 최신 위치 조회
@router.get("/wards/{id}/location")
def ward_location(id: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    log = db.query(SirenLog).filter_by(user_id=id).order_by(SirenLog.created_at.desc()).first()
    return {"ward_id": id, "lat": log.lat if log else 37.5665, "lng": log.lng if log else 126.9780}