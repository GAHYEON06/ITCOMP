import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Float, Integer, Text, ForeignKey, DateTime, Date
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userid = Column(String, unique=True, nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    wardcode = Column(String, nullable=True)
    autologin = Column(Boolean, default=False)
    role = Column(String, nullable=False)
    fcm_token = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    birthdate = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserRelationship(Base):
    __tablename__ = "user_relationships"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ward_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    guardian_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    notifications_enabled = Column(Boolean, default=True)
    location_sharing = Column(Boolean, default=True)
    dark_mode = Column(Boolean, default=False)
    emergency_contacts = Column(Text, default="[]")
    is_test_mode = Column(Boolean, default=False)
    is_power_button_emergency = Column(Boolean, default=True)
    is_shake_emergency = Column(Boolean, default=True)
    is_vibration_enabled = Column(Boolean, default=False)
    is_sound_enabled = Column(Boolean, default=True)
    has_seen_security_help = Column(Boolean, default=False)


class CommunityPost(Base):
    __tablename__ = "community_posts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userid = Column(String, ForeignKey("users.id", ondelete="CASCADE"))
    category = Column(String, nullable=False)
    descrip = Column(Text, nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    locadescrip = Column(String, nullable=True)
    image = Column(String, nullable=True)
    keyword = Column(String, nullable=True)
    is_resolved = Column(Boolean, default=False)
    like_count = Column(Integer, default=0)
    resolve_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PostLike(Base):
    __tablename__ = "post_likes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    post_id = Column(String, ForeignKey("community_posts.id", ondelete="CASCADE"))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))


class PostResolve(Base):
    __tablename__ = "post_resolves"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    post_id = Column(String, ForeignKey("community_posts.id", ondelete="CASCADE"))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))


class SirenLog(Base):
    __tablename__ = "emergency_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=True)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    address = Column(String, nullable=True)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DisguiseLog(Base):
    __tablename__ = "disguise_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))