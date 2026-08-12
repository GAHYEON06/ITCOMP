import os
import json
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from google import genai
from google.genai import types

# FastAPI 라우터 설정 (prefix 및 태그)
router = APIRouter(prefix="/ai", tags=["AI Recommendation"])

# Vercel 환경 변수에서 GEMINI_API_KEY 읽기
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# 데이터 요청 스키마 (pydantic)
class AIBriefingRequest(BaseModel):
    originName: str
    destName: str
    isNight: bool = False
    policeCount: int = 0
    bellCount: int = 0
    safetyScore: int = 50

# 데이터 응답 스키마
class AIBriefingResponse(BaseModel):
    tagline: str
    safetyTags: List[str]

@router.post("/briefing", response_model=AIBriefingResponse, status_code=status.HTTP_200_OK)
def get_ai_briefing(data: AIBriefingRequest):
    """
    경로 인프라 데이터를 받아 Gemini API로 안심 요약 문구와 태그를 생성합니다.
    """
    # API 키 누락 시 Fallback 예외 처리
    if not GEMINI_API_KEY:
        print("⚠️ GEMINI_API_KEY가 설정되지 않았습니다.")
        return AIBriefingResponse(
            tagline=f"파출소 {data.policeCount}개·비상벨 {data.bellCount}개 안심 경유 구역",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )

    try:
        # Gemini Client 초기화
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""
        사용자가 '{data.originName}'에서 '{data.destName}'까지 도보로 이동합니다.
        시간대: {'야간(밤)' if data.isNight else '주간(낮)'}
        경로 인프라: 파출소 {data.policeCount}개, 비상벨 {data.bellCount}개, 종합 안전점수 {data.safetyScore}점.

        이 정보를 바탕으로 사용자 안심용 한줄 요약 문구(tagline)와 태그 3개(safetyTags)를 JSON 형식으로 작성해줘.
        """

        # Gemini 1.5 Flash 모델 사용 및 JSON 응답 강제 설정
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "tagline": {"type": "STRING"},
                        "safetyTags": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"}
                        }
                    },
                    "required": ["tagline", "safetyTags"]
                }
            )
        )

        result_json = json.loads(response.text)
        return AIBriefingResponse(
            tagline=result_json.get("tagline", "안전 인프라 연동 안심 도보 경로"),
            safetyTags=result_json.get("safetyTags", ["파출소 근처", "비상벨 구역", "안전 우선"])
        )

    except Exception as e:
        print(f"❌ Gemini API 호출 에러: {str(e)}")
        # 에러 발생 시 서비스가 중단되지 않도록 기본값 반환
        return AIBriefingResponse(
            tagline=f"파출소 및 비상벨 밀집 구역 경유 (안전점수 {data.safetyScore}점)",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )
