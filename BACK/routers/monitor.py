import time
import uuid
import datetime
import logging
import json
from typing import Optional, Literal, Any, Dict, List

import requests
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
import models
from models import User, UserRelationship, SirenLog
from .deps import current_user
from .fcm_service import send_fcm_notification

logger = logging.getLogger("monitor")

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitor & Matching"])

# ==========================================
# 1. WebSocket 커넥션 매니저 (룸 기반 브로드캐스팅)
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info(f"[WS Connect] session_id: {session_id} | Total clients: {len(self.active_connections[session_id])}")

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"[WS Disconnect] session_id: {session_id}")

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"[WS Broadcast Error] {e}")

manager = ConnectionManager()


# ==========================================
# 2. Pydantic 스키마 정의
# ==========================================
class CommonResponse(BaseModel):
    status: int
    message: str
    data: Optional[Any] = None

class LinkReq(BaseModel):
    wardcode: str

class MonitoringSessionCreateRequest(BaseModel):
    ward_id: str = Field(..., description="피보호자 ID")
    guardian_id: str = Field(..., description="보호자 ID")
    start_location: Optional[str] = Field(None, description="출발지 명칭")
    start_lat: float
    start_lng: float
    end_location: Optional[str] = Field(None, description="도착지 명칭")
    end_lat: float
    end_lng: float
    route_profile: Literal["foot", "drive"] = Field("foot", description="이동 수단")

class MonitoringSessionResponse(BaseModel):
    id: str
    ward_id: str
    guardian_id: str
    status: str
    start_location: Optional[str]
    start_lat: float
    start_lng: float
    end_location: Optional[str]
    end_lat: float
    end_lng: float
    route_profile: str
    route_geojson: Optional[dict]
    estimated_time_minutes: Optional[int]
    websocket_channel: str
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime]
    ended_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


# ==========================================
# 3. OSRM 및 캐시 설정 / 헬퍼 함수
# ==========================================
OSRM_BASE_URL = "https://router.project-osrm.org"
ROUTE_CACHE_TTL_SECONDS = 60 * 60
REQUEST_TIMEOUT_SECONDS = 5
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 0.5

PROFILE_MAP = {
    "foot": "foot",
    "drive": "driving",
}

def _build_cache_key(profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> str:
    return (
        f"osrm:{profile}:"
        f"{round(start_lat, 5)},{round(start_lng, 5)}:"
        f"{round(end_lat, 5)},{round(end_lng, 5)}"
    )

def _get_cached_route(db: Session, cache_key: str) -> dict | None:
    cache_row = (
        db.query(models.ExternalApiCache)
        .filter(models.ExternalApiCache.cache_key == cache_key)
        .first()
    )
    if cache_row is None or cache_row.expires_at < datetime.datetime.utcnow():
        return None
    return cache_row.response_body

def _upsert_cache(db: Session, cache_key: str, response_body: dict) -> None:
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=ROUTE_CACHE_TTL_SECONDS)
    cache_row = (
        db.query(models.ExternalApiCache)
        .filter(models.ExternalApiCache.cache_key == cache_key)
        .first()
    )
    if cache_row:
        cache_row.response_body = response_body
        cache_row.expires_at = expires_at
    else:
        cache_row = models.ExternalApiCache(
            id=str(uuid.uuid4()),
            cache_key=cache_key,
            response_body=response_body,
            expires_at=expires_at,
        )
        db.add(cache_row)
    db.commit()

def _call_osrm_api(profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    osrm_profile = PROFILE_MAP[profile]
    url = (
        f"{OSRM_BASE_URL}/route/v1/{osrm_profile}/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}"
        f"?overview=full&geometries=geojson"
    )

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") != "Ok" or not data.get("routes"):
                    raise ValueError(f"OSRM 응답 오류: {data.get('code')}")
                return data
            if 400 <= resp.status_code < 500:
                raise HTTPException(status_code=502, detail=f"길찾기 API 요청 오류 (status={resp.status_code})")
            last_error = ValueError(f"OSRM 5xx 응답: {resp.status_code}")
        except (requests.exceptions.RequestException, ValueError) as e:
            last_error = e
            logger.warning(f"[OSRM] {attempt}/{MAX_RETRIES}차 시도 실패: {e}")

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise HTTPException(status_code=503, detail="길찾기 API 응답 실패 (재시도 초과)")

def get_route(db: Session, profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    cache_key = _build_cache_key(profile, start_lat, start_lng, end_lat, end_lng)
    cached = _get_cached_route(db, cache_key)
    if cached is not None:
        return cached

    fresh_data = _call_osrm_api(profile, start_lat, start_lng, end_lat, end_lng)
    _upsert_cache(db, cache_key, fresh_data)
    return fresh_data

def _extract_geojson_and_eta(osrm_response: dict) -> tuple[dict, int]:
    route = osrm_response["routes"][0]
    geojson = route["geometry"]
    duration_seconds = route["duration"]
    estimated_time_minutes = max(1, round(duration_seconds / 60))
    return geojson, estimated_time_minutes


# ==========================================
# 4. REST API 엔드포인트
# ==========================================

# 1) 매칭 연결
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
        
    if ward.fcm_token:
        send_fcm_notification(
            target_token=ward.fcm_token,
            title="🔗 보호자 연결 완료",
            body=f"[{u.username}] 보호자님이 회원님과 연결되었습니다.",
            data_payload={"type": "LINK_SUCCESS", "guardian_id": u.id}
        )

    return {"status": "ok", "message": f"{ward.username} 피보호자와 성공적으로 연결되었습니다."}

# 2) 연결된 피보호자 목록
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

# 3) 나를 보호하는 보호자 목록
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

# 4) 세션 생성
@router.post("/sessions", response_model=CommonResponse)
def create_monitoring_session(
    payload: MonitoringSessionCreateRequest,
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    rel = db.query(UserRelationship).filter_by(
        guardian_id=payload.guardian_id, 
        ward_id=payload.ward_id
    ).first()
    if not rel:
        raise HTTPException(status_code=403, detail="연결된 보호자-피보호자 관계가 아닙니다.")

    osrm_response = get_route(
        db=db,
        profile=payload.route_profile,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        end_lat=payload.end_lat,
        end_lng=payload.end_lng,
    )
    route_geojson, estimated_time_minutes = _extract_geojson_and_eta(osrm_response)

    now = datetime.datetime.utcnow()
    session_id = str(uuid.uuid4())

    new_session = models.MonitoringSession(
        id=session_id,
        ward_id=payload.ward_id,
        guardian_id=payload.guardian_id,
        status="NORMAL",
        start_location=payload.start_location,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        end_location=payload.end_location,
        end_lat=payload.end_lat,
        end_lng=payload.end_lng,
        route_geojson=route_geojson,
        route_profile=payload.route_profile,
        estimated_time_minutes=estimated_time_minutes,
        created_at=now,
        updated_at=now,
        started_at=now,
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    guardian = db.query(User).filter_by(id=payload.guardian_id).first()
    ward = db.query(User).filter_by(id=payload.ward_id).first()
    
    if guardian and guardian.fcm_token:
        send_fcm_notification(
            target_token=guardian.fcm_token,
            title="🚶‍♂️ [안전 모니터링] 이동 시작",
            body=f"[{ward.username if ward else '피보호자'}]님이 이동을 시작했습니다.",
            data_payload={
                "type": "MONITOR_START",
                "session_id": session_id,
                "ward_id": payload.ward_id,
                "dest_loc": payload.end_location or "",
            }
        )

    response_data = MonitoringSessionResponse(
        id=new_session.id,
        ward_id=new_session.ward_id,
        guardian_id=new_session.guardian_id,
        status=new_session.status,
        start_location=new_session.start_location,
        start_lat=new_session.start_lat,
        start_lng=new_session.start_lng,
        end_location=new_session.end_location,
        end_lat=new_session.end_lat,
        end_lng=new_session.end_lng,
        route_profile=new_session.route_profile,
        route_geojson=new_session.route_geojson,
        estimated_time_minutes=new_session.estimated_time_minutes,
        websocket_channel=f"monitoring:{new_session.id}",
        created_at=new_session.created_at,
        started_at=new_session.started_at,
        ended_at=new_session.ended_at,
    )

    return CommonResponse(
        status=201,
        message="모니터링 세션이 성공적으로 생성되었습니다.",
        data=response_data.model_dump(mode="json"),
    )

# 5) 세션 상세 조회
@router.get("/sessions/{session_id}", response_model=CommonResponse)
def get_monitoring_session(session_id: str, db: Session = Depends(get_db)):
    session_row = (
        db.query(models.MonitoringSession)
        .filter(models.MonitoringSession.id == session_id)
        .first()
    )
    if session_row is None:
        raise HTTPException(status_code=404, detail="모니터링 세션을 찾을 수 없습니다.")

    response_data = MonitoringSessionResponse(
        id=session_row.id,
        ward_id=session_row.ward_id,
        guardian_id=session_row.guardian_id,
        status=session_row.status,
        start_location=session_row.start_location,
        start_lat=session_row.start_lat,
        start_lng=session_row.start_lng,
        end_location=session_row.end_location,
        end_lat=session_row.end_lat,
        end_lng=session_row.end_lng,
        route_profile=session_row.route_profile,
        route_geojson=session_row.route_geojson,
        estimated_time_minutes=session_row.estimated_time_minutes,
        websocket_channel=f"monitoring:{session_row.id}",
        created_at=session_row.created_at,
        started_at=session_row.started_at,
        ended_at=session_row.ended_at,
    )

    return CommonResponse(
        status=200,
        message="조회 성공",
        data=response_data.model_dump(mode="json"),
    )

# 6) 최근 위치 조회
@router.get("/wards/{id}/location")
def ward_location(id: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    log = db.query(SirenLog).filter_by(user_id=id).order_by(SirenLog.created_at.desc()).first()
    return {"ward_id": id, "lat": log.lat if log else 37.5665, "lng": log.lng if log else 126.9780}


# ==========================================
# 5. [3단계] 실시간 위치 중계 WebSocket
# ==========================================
@router.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    db: Session = Depends(get_db)
):
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "LOCATION_UPDATE":
                lat = data.get("lat")
                lng = data.get("lng")
                
                # DB 저장 (models.py의 기존 컬럼명 latitude, longitude 매칭)
                if lat is not None and lng is not None:
                    try:
                        log_entry = models.MonitoringLocationLog(
                            session_id=session_id,
                            latitude=float(lat),
                            longitude=float(lng)
                        )
                        db.add(log_entry)
                        db.commit()
                    except Exception as db_err:
                        logger.error(f"[WS Log Save Error] {db_err}")
                        db.rollback()

                # 실시간 브로드캐스팅
                broadcast_payload = {
                    "session_id": session_id,
                    "event": "LOCATION_UPDATED",
                    "lat": lat,
                    "lng": lng,
                    "speed_kmh": data.get("speed_kmh"),
                    "battery_level": data.get("battery_level"),
                    "timestamp": datetime.datetime.utcnow().isoformat()
                }
                await manager.broadcast(session_id, broadcast_payload)

            elif data.get("type") == "END_SESSION":
                await manager.broadcast(session_id, {
                    "session_id": session_id,
                    "event": "SESSION_ENDED",
                    "reason": data.get("reason", "arrived")
                })
                break

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
        logger.info(f"[WS Closed] Client disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"[WS Error] {e}")
        manager.disconnect(session_id, websocket)import time
import uuid
import datetime
import logging
import json
from typing import Optional, Literal, Any, Dict, List

import requests
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
import models
from models import User, UserRelationship, SirenLog
from .deps import current_user
from .fcm_service import send_fcm_notification

logger = logging.getLogger("monitor")

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitor & Matching"])

# ==========================================
# 1. WebSocket 커넥션 매니저 (룸 기반 브로드캐스팅)
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info(f"[WS Connect] session_id: {session_id} | Total clients: {len(self.active_connections[session_id])}")

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"[WS Disconnect] session_id: {session_id}")

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"[WS Broadcast Error] {e}")

manager = ConnectionManager()


# ==========================================
# 2. Pydantic 스키마 정의
# ==========================================
class CommonResponse(BaseModel):
    status: int
    message: str
    data: Optional[Any] = None

class LinkReq(BaseModel):
    wardcode: str

class MonitoringSessionCreateRequest(BaseModel):
    ward_id: str = Field(..., description="피보호자 ID")
    guardian_id: str = Field(..., description="보호자 ID")
    start_location: Optional[str] = Field(None, description="출발지 명칭")
    start_lat: float
    start_lng: float
    end_location: Optional[str] = Field(None, description="도착지 명칭")
    end_lat: float
    end_lng: float
    route_profile: Literal["foot", "drive"] = Field("foot", description="이동 수단")

class MonitoringSessionResponse(BaseModel):
    id: str
    ward_id: str
    guardian_id: str
    status: str
    start_location: Optional[str]
    start_lat: float
    start_lng: float
    end_location: Optional[str]
    end_lat: float
    end_lng: float
    route_profile: str
    route_geojson: Optional[dict]
    estimated_time_minutes: Optional[int]
    websocket_channel: str
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime]
    ended_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


# ==========================================
# 3. OSRM 및 캐시 설정 / 헬퍼 함수
# ==========================================
OSRM_BASE_URL = "https://router.project-osrm.org"
ROUTE_CACHE_TTL_SECONDS = 60 * 60
REQUEST_TIMEOUT_SECONDS = 5
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 0.5

PROFILE_MAP = {
    "foot": "foot",
    "drive": "driving",
}

def _build_cache_key(profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> str:
    return (
        f"osrm:{profile}:"
        f"{round(start_lat, 5)},{round(start_lng, 5)}:"
        f"{round(end_lat, 5)},{round(end_lng, 5)}"
    )

def _get_cached_route(db: Session, cache_key: str) -> dict | None:
    cache_row = (
        db.query(models.ExternalApiCache)
        .filter(models.ExternalApiCache.cache_key == cache_key)
        .first()
    )
    if cache_row is None or cache_row.expires_at < datetime.datetime.utcnow():
        return None
    return cache_row.response_body

def _upsert_cache(db: Session, cache_key: str, response_body: dict) -> None:
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=ROUTE_CACHE_TTL_SECONDS)
    cache_row = (
        db.query(models.ExternalApiCache)
        .filter(models.ExternalApiCache.cache_key == cache_key)
        .first()
    )
    if cache_row:
        cache_row.response_body = response_body
        cache_row.expires_at = expires_at
    else:
        cache_row = models.ExternalApiCache(
            id=str(uuid.uuid4()),
            cache_key=cache_key,
            response_body=response_body,
            expires_at=expires_at,
        )
        db.add(cache_row)
    db.commit()

def _call_osrm_api(profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    osrm_profile = PROFILE_MAP[profile]
    url = (
        f"{OSRM_BASE_URL}/route/v1/{osrm_profile}/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}"
        f"?overview=full&geometries=geojson"
    )

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") != "Ok" or not data.get("routes"):
                    raise ValueError(f"OSRM 응답 오류: {data.get('code')}")
                return data
            if 400 <= resp.status_code < 500:
                raise HTTPException(status_code=502, detail=f"길찾기 API 요청 오류 (status={resp.status_code})")
            last_error = ValueError(f"OSRM 5xx 응답: {resp.status_code}")
        except (requests.exceptions.RequestException, ValueError) as e:
            last_error = e
            logger.warning(f"[OSRM] {attempt}/{MAX_RETRIES}차 시도 실패: {e}")

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise HTTPException(status_code=503, detail="길찾기 API 응답 실패 (재시도 초과)")

def get_route(db: Session, profile: str, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    cache_key = _build_cache_key(profile, start_lat, start_lng, end_lat, end_lng)
    cached = _get_cached_route(db, cache_key)
    if cached is not None:
        return cached

    fresh_data = _call_osrm_api(profile, start_lat, start_lng, end_lat, end_lng)
    _upsert_cache(db, cache_key, fresh_data)
    return fresh_data

def _extract_geojson_and_eta(osrm_response: dict) -> tuple[dict, int]:
    route = osrm_response["routes"][0]
    geojson = route["geometry"]
    duration_seconds = route["duration"]
    estimated_time_minutes = max(1, round(duration_seconds / 60))
    return geojson, estimated_time_minutes


# ==========================================
# 4. REST API 엔드포인트
# ==========================================

# 1) 매칭 연결
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
        
    if ward.fcm_token:
        send_fcm_notification(
            target_token=ward.fcm_token,
            title="🔗 보호자 연결 완료",
            body=f"[{u.username}] 보호자님이 회원님과 연결되었습니다.",
            data_payload={"type": "LINK_SUCCESS", "guardian_id": u.id}
        )

    return {"status": "ok", "message": f"{ward.username} 피보호자와 성공적으로 연결되었습니다."}

# 2) 연결된 피보호자 목록
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

# 3) 나를 보호하는 보호자 목록
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

# 4) 세션 생성
@router.post("/sessions", response_model=CommonResponse)
def create_monitoring_session(
    payload: MonitoringSessionCreateRequest,
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    rel = db.query(UserRelationship).filter_by(
        guardian_id=payload.guardian_id, 
        ward_id=payload.ward_id
    ).first()
    if not rel:
        raise HTTPException(status_code=403, detail="연결된 보호자-피보호자 관계가 아닙니다.")

    osrm_response = get_route(
        db=db,
        profile=payload.route_profile,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        end_lat=payload.end_lat,
        end_lng=payload.end_lng,
    )
    route_geojson, estimated_time_minutes = _extract_geojson_and_eta(osrm_response)

    now = datetime.datetime.utcnow()
    session_id = str(uuid.uuid4())

    new_session = models.MonitoringSession(
        id=session_id,
        ward_id=payload.ward_id,
        guardian_id=payload.guardian_id,
        status="NORMAL",
        start_location=payload.start_location,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        end_location=payload.end_location,
        end_lat=payload.end_lat,
        end_lng=payload.end_lng,
        route_geojson=route_geojson,
        route_profile=payload.route_profile,
        estimated_time_minutes=estimated_time_minutes,
        created_at=now,
        updated_at=now,
        started_at=now,
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    guardian = db.query(User).filter_by(id=payload.guardian_id).first()
    ward = db.query(User).filter_by(id=payload.ward_id).first()
    
    if guardian and guardian.fcm_token:
        send_fcm_notification(
            target_token=guardian.fcm_token,
            title="🚶‍♂️ [안전 모니터링] 이동 시작",
            body=f"[{ward.username if ward else '피보호자'}]님이 이동을 시작했습니다.",
            data_payload={
                "type": "MONITOR_START",
                "session_id": session_id,
                "ward_id": payload.ward_id,
                "dest_loc": payload.end_location or "",
            }
        )

    response_data = MonitoringSessionResponse(
        id=new_session.id,
        ward_id=new_session.ward_id,
        guardian_id=new_session.guardian_id,
        status=new_session.status,
        start_location=new_session.start_location,
        start_lat=new_session.start_lat,
        start_lng=new_session.start_lng,
        end_location=new_session.end_location,
        end_lat=new_session.end_lat,
        end_lng=new_session.end_lng,
        route_profile=new_session.route_profile,
        route_geojson=new_session.route_geojson,
        estimated_time_minutes=new_session.estimated_time_minutes,
        websocket_channel=f"monitoring:{new_session.id}",
        created_at=new_session.created_at,
        started_at=new_session.started_at,
        ended_at=new_session.ended_at,
    )

    return CommonResponse(
        status=201,
        message="모니터링 세션이 성공적으로 생성되었습니다.",
        data=response_data.model_dump(mode="json"),
    )

# 5) 세션 상세 조회
@router.get("/sessions/{session_id}", response_model=CommonResponse)
def get_monitoring_session(session_id: str, db: Session = Depends(get_db)):
    session_row = (
        db.query(models.MonitoringSession)
        .filter(models.MonitoringSession.id == session_id)
        .first()
    )
    if session_row is None:
        raise HTTPException(status_code=404, detail="모니터링 세션을 찾을 수 없습니다.")

    response_data = MonitoringSessionResponse(
        id=session_row.id,
        ward_id=session_row.ward_id,
        guardian_id=session_row.guardian_id,
        status=session_row.status,
        start_location=session_row.start_location,
        start_lat=session_row.start_lat,
        start_lng=session_row.start_lng,
        end_location=session_row.end_location,
        end_lat=session_row.end_lat,
        end_lng=session_row.end_lng,
        route_profile=session_row.route_profile,
        route_geojson=session_row.route_geojson,
        estimated_time_minutes=session_row.estimated_time_minutes,
        websocket_channel=f"monitoring:{session_row.id}",
        created_at=session_row.created_at,
        started_at=session_row.started_at,
        ended_at=session_row.ended_at,
    )

    return CommonResponse(
        status=200,
        message="조회 성공",
        data=response_data.model_dump(mode="json"),
    )

# 6) 최근 위치 조회
@router.get("/wards/{id}/location")
def ward_location(id: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    log = db.query(SirenLog).filter_by(user_id=id).order_by(SirenLog.created_at.desc()).first()
    return {"ward_id": id, "lat": log.lat if log else 37.5665, "lng": log.lng if log else 126.9780}


# ==========================================
# 5. [3단계] 실시간 위치 중계 WebSocket
# ==========================================
@router.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    db: Session = Depends(get_db)
):
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "LOCATION_UPDATE":
                lat = data.get("lat")
                lng = data.get("lng")
                
                # DB 저장 (models.py의 기존 컬럼명 latitude, longitude 매칭)
                if lat is not None and lng is not None:
                    try:
                        log_entry = models.MonitoringLocationLog(
                            session_id=session_id,
                            latitude=float(lat),
                            longitude=float(lng)
                        )
                        db.add(log_entry)
                        db.commit()
                    except Exception as db_err:
                        logger.error(f"[WS Log Save Error] {db_err}")
                        db.rollback()

                # 실시간 브로드캐스팅
                broadcast_payload = {
                    "session_id": session_id,
                    "event": "LOCATION_UPDATED",
                    "lat": lat,
                    "lng": lng,
                    "speed_kmh": data.get("speed_kmh"),
                    "battery_level": data.get("battery_level"),
                    "timestamp": datetime.datetime.utcnow().isoformat()
                }
                await manager.broadcast(session_id, broadcast_payload)

            elif data.get("type") == "END_SESSION":
                await manager.broadcast(session_id, {
                    "session_id": session_id,
                    "event": "SESSION_ENDED",
                    "reason": data.get("reason", "arrived")
                })
                break

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
        logger.info(f"[WS Closed] Client disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"[WS Error] {e}")
        manager.disconnect(session_id, websocket)
