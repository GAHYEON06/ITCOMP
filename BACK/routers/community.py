import os, uuid, shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import get_db
import models
from models import CommunityPost, PostLike, PostResolve, User
from .deps import current_user

router = APIRouter(prefix="/community", tags=["Community"])

upload_dir = "/tmp/uploads" if os.environ.get("VERCEL") else "uploads"
os.makedirs(upload_dir, exist_ok=True)

@router.get("/posts")
def list_posts(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    q = db.query(CommunityPost).filter(CommunityPost.is_resolved == False)
    if category and category != "ALL":
        q = q.filter(CommunityPost.category == category)
    if keyword:
        q = q.filter(CommunityPost.descrip.ilike(f"%{keyword}%"))
    posts = q.order_by(CommunityPost.created_at.desc()).all()
    return {"posts": [{"id": p.id, "descrip": p.descrip, "category": p.category, "lat": p.lat, "lng": p.lng, "locadescrip": p.locadescrip, "image": p.image, "like_count": p.like_count} for p in posts]}

@router.post("/posts", status_code=201)
def create_post(
    category: str = Form(...),
    descrip: str = Form(...),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    locadescrip: Optional[str] = Form(None),
    keyword: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    u: User = Depends(current_user)
):
    img_url = None
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        fname = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(upload_dir, fname)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(image.file, f)
        img_url = f"/uploads/{fname}"
    p = CommunityPost(
        userid=u.id,
        category=category,
        descrip=descrip,
        lat=lat,
        lng=lng,
        locadescrip=locadescrip,
        keyword=keyword,
        image=img_url
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "descrip": p.descrip}

@router.post("/posts/{post_id}/like")
def toggle_like(post_id: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    p = db.query(CommunityPost).filter_by(id=post_id).first()
    if not p:
        raise HTTPException(404, "게시물 없음")
    ex = db.query(PostLike).filter_by(post_id=post_id, user_id=u.id).first()
    if ex:
        db.delete(ex)
        p.like_count = max(0, p.like_count - 1)
        liked = False
    else:
        db.add(PostLike(post_id=post_id, user_id=u.id))
        p.like_count += 1
        liked = True
    db.commit()
    return {"liked": liked, "like_count": p.like_count}

@router.post("/posts/{post_id}/resolve")
def resolve_post(post_id: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    p = db.query(CommunityPost).filter_by(id=post_id).first()
    if not p:
        raise HTTPException(404, "게시물 없음")
    ex = db.query(PostResolve).filter_by(post_id=post_id, user_id=u.id).first()
    if ex:
        db.delete(ex)
        p.resolve_count = max(0, p.resolve_count - 1)
    else:
        db.add(PostResolve(post_id=post_id, user_id=u.id))
        p.resolve_count += 1
    if p.resolve_count >= 3:
        p.is_resolved = True
    db.commit()
    return {"resolve_count": p.resolve_count, "is_resolved": p.is_resolved}