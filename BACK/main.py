import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine
import models
from routers import (
    auth,
    monitor,
    community,
    emergency,
    settings,
    fcm,
    users,
    sosbell,
    fakescreen,
    ai
)

try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Table creation warning: {e}")

app = FastAPI(title="AI: ZIP_R0", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = "/tmp/uploads" if os.environ.get("VERCEL") else "uploads"
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# 라우터 등록
app.include_router(auth.router)
app.include_router(fcm.router)
app.include_router(monitor.router)
app.include_router(community.router)
app.include_router(emergency.router)
app.include_router(settings.router)
app.include_router(users.router)
app.include_router(sosbell.router)
app.include_router(fakescreen.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "ZIP_R0 API Server is Running"}
