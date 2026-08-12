import enum
from sqlalchemy import (
    Column,
    BigInteger,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Enum,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class UserRole(str, enum.Enum):
    WARD = "WARD"
    GUARDIAN = "GUARDIAN"


class User(Base):
    __tablename__ = "users"

    user_id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    name = Column(String(50), nullable=False)
    email = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ward_code = relationship(
        "WardCode", back_populates="ward", uselist=False, cascade="all, delete"
    )


class WardCode(Base):
    __tablename__ = "ward_codes"

    code_id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    ward_id = Column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    code = Column(String(20), unique=True, nullable=False, index=True)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ward = relationship("User", back_populates="ward_code")


class Relationship(Base):
    __tablename__ = "relationships"

    relation_id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    ward_id = Column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    guardian_id = Column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("ward_id", name="uq_relation_ward_id"),
        UniqueConstraint("guardian_id", name="uq_relation_guardian_id"),
    )


# 커뮤니티 검색기능

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Float,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# models.py 중 커뮤니티 관련 모델 부분


class CommunityPost(Base):
    __tablename__ = "community_posts"

    post_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    nickname = Column(String(50), nullable=False)
    category = Column(String(20), nullable=False)
    image_url = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    location_description = Column(Text, nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    like_count = Column(Integer, default=0, nullable=False)

    # [추가] 문제해결 관련 상태 및 카운트 컬럼
    is_resolved = Column(Boolean, default=False, nullable=False)
    resolve_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    author = relationship("User", backref="community_posts")
    likes = relationship(
        "PostLike", back_populates="post", cascade="all, delete-orphan"
    )
    resolves = relationship(
        "PostResolve", back_populates="post", cascade="all, delete-orphan"
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    like_id = Column(Integer, primary_key=True, index=True)
    post_id = Column(
        Integer,
        ForeignKey("community_posts.post_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    post = relationship("CommunityPost", back_populates="likes")
    user = relationship("User", backref="post_likes")

    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="unique_user_post_like"),
    )


# [추가] 문제해결 1인 1회 투표 기록 테이블
class PostResolve(Base):
    __tablename__ = "post_resolves"

    resolve_id = Column(Integer, primary_key=True, index=True)
    post_id = Column(
        Integer,
        ForeignKey("community_posts.post_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    post = relationship("CommunityPost", back_populates="resolves")
    user = relationship("User", backref="post_resolves")

    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="unique_user_post_resolve"),
    )


# models.py 하단에 추가


class UserSetting(Base):
    __tablename__ = "user_settings"

    setting_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # 긴급 신고 토글 옵션
    is_test_mode = Column(Boolean, default=False, nullable=False)
    is_power_button_emergency = Column(Boolean, default=True, nullable=False)
    is_shake_emergency = Column(Boolean, default=True, nullable=False)

    # 알림 토글 옵션
    is_vibration_enabled = Column(Boolean, default=True, nullable=False)
    is_sound_enabled = Column(Boolean, default=True, nullable=False)

    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationship
    user = relationship("User", backref="setting", uselist=False)

    has_seen_security_help = Column(Boolean, default=False, nullable=False)

