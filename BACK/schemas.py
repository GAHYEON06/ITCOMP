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
