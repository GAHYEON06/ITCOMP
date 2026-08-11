from pydantic import BaseModel, EmailStr
from typing import Optional


# ----- Request Schemas -----
class WardSignupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    username: str
    password: str


class GuardianSignupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    wardCode: str
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str
    autoLogin: Optional[bool] = False


# ----- Response Schemas -----
class CommonResponse(BaseModel):
    status: int
    message: str
    data: Optional[dict] = None


# schemas.py 하단에 추가

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# 위험 제보 게시글 응답 DTO
class CommunityPostResponse(BaseModel):
    postId: int
    nickname: str
    category: str
    imageUrl: str
    description: str
    locationDescription: str
    latitude: float
    longitude: float
    likeCount: int
    createdAt: datetime

    class Config:
        from_attributes = True


# 좋아요 토글 응답 DTO
class LikeToggleResponse(BaseModel):
    postId: int
    isLiked: bool
    likeCount: int

# ===================== schemas.py 추가분 =====================
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


# ----- 모니터링 세션 생성 Request -----
class MonitoringSessionCreateRequest(BaseModel):
    ward_id: str
    guardian_id: str

    start_location: str = Field(..., description="출발지 주소(텍스트)")
    start_lat: float
    start_lng: float

    end_location: str = Field(..., description="도착지 주소(텍스트)")
    end_lat: float
    end_lng: float

    route_profile: Literal["foot", "drive"] = "foot"


# ----- 경로 좌표 하나 -----
class RoutePoint(BaseModel):
    lat: float
    lng: float


# ----- 모니터링 세션 생성/조회 Response -----
class MonitoringSessionResponse(BaseModel):
    id: str
    ward_id: str
    guardian_id: str
    status: str

    start_location: str
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_location: str
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None

    route_profile: Optional[str] = None
    route_geojson: Optional[dict] = None
    estimated_time_minutes: int

    websocket_channel: str  # "monitoring:{session_id}" — 3단계 WebSocket 연동용

    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    class Config:
        from_attributes = True
