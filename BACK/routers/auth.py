import random, string, os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt

from database import get_db
import models
from models import User, UserSetting, UserRelationship
from pydantic import BaseModel
from .deps import current_user, SECRET_KEY, ALGORITHM, EXPIRE_HOURS

router = APIRouter(prefix="/auth", tags=["Auth & User"])

def hash_pw(pw: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw.encode('utf-8'), salt).decode('utf-8')

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode('utf-8'), h.encode('utf-8'))
    except Exception:
        return False

def make_token(data: dict) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HOURS)
    return jwt.encode({**data, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)

def _token_resp(u: User):
    return {
        "access_token": make_token({"sub": u.id}),
        "token_type": "bearer",
        "user_id": u.id,
        "role": str(u.role).lower(),
        "userid": u.userid,
        "username": u.username
    }

def _rand_code(n=8):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))

# 요청 DTO 규격
class WardSignupReq(BaseModel):
    userid: str
    password: str
    username: str          # 사용자 이름
    phone: Optional[str] = None
    email: Optional[str] = None
    autologin: Optional[bool] = False

class GuardianSignupReq(BaseModel):
    userid: str
    password: str
    username: str          # 사용자 이름
    wardcode: str
    phone: Optional[str] = None
    email: Optional[str] = None
    autologin: Optional[bool] = False

class LoginReq(BaseModel):
    userid: str
    password: str

@router.post("/signup/ward")
def signup_ward(data: WardSignupReq, db: Session = Depends(get_db)):
    if db.query(User).filter(User.userid == data.userid).first():
        raise HTTPException(400, "이미 사용 중인 아이디입니다.")
    
    w_code = _rand_code()
    while db.query(User).filter(User.wardcode == w_code).first():
        w_code = _rand_code()
        
    # 💡 모든 입력값(username, phone, email)을 명확하게 User 객체에 할당하여 저장
    u = User(
        userid=data.userid,
        password=hash_pw(data.password),
        username=data.username,
        phone=data.phone,
        email=data.email,
        autologin=data.autologin,
        role="ward",
        wardcode=w_code
    )
    db.add(u)
    db.flush()
    db.add(UserSetting(user_id=u.id))
    db.commit()
    db.refresh(u)
    return _token_resp(u)

@router.post("/signup/guardian")
def signup_guardian(data: GuardianSignupReq, db: Session = Depends(get_db)):
    if db.query(User).filter(User.userid == data.userid).first():
        raise HTTPException(400, "이미 사용 중인 아이디입니다.")
    
    ward = db.query(User).filter(User.wardcode == data.wardcode).first()
    if not ward:
        raise HTTPException(404, "유효하지 않은 피보호자 고유 코드입니다.")
        
    # 💡 모든 입력값 명확히 저장
    u = User(
        userid=data.userid,
        password=hash_pw(data.password),
        username=data.username,
        phone=data.phone,
        email=data.email,
        autologin=data.autologin,
        role="guardian"
    )
    db.add(u)
    db.flush()
    db.add(UserSetting(user_id=u.id))
    db.add(UserRelationship(ward_id=ward.id, guardian_id=u.id))
    db.commit()
    db.refresh(u)
    return _token_resp(u)

@router.post("/login")
def login(data: LoginReq, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.userid == data.userid).first()
    if not u or not verify_pw(data.password, u.password):
        raise HTTPException(401, "아이디 또는 비밀번호가 틀렸습니다.")
    return _token_resp(u)

@router.get("/me")
def me(db: Session = Depends(get_db), u: User = Depends(current_user)):
    # 본인이 피보호자면 자신의 wardcode, 보호자면 연결된 피보호자의 wardcode를 조회
    wardcode = u.wardcode
    if str(u.role).lower() == "guardian":
        rel = db.query(UserRelationship).filter_by(guardian_id=u.id).first()
        if rel:
            ward = db.query(User).filter(User.id == rel.ward_id).first()
            wardcode = ward.wardcode if ward else None
        else:
            wardcode = None

    return {
        "id": u.id,
        "userid": u.userid,
        "username": u.username,
        "role": str(u.role).lower(),
        "wardcode": wardcode,
        "phone": u.phone,
        "email": u.email,
        "gender": u.gender,
        "birthdate": u.birthdate.isoformat() if u.birthdate else None
    }