import os
import json
from fastapi import APIRouter, status
from pydantic import BaseModel
from typing import List
import google.generativeai as genai
from google.genai import types

# API 키 설정
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# 모델 호출 시
model = genai.GenerativeModel('gemini-2.5-flash')

# 엔드포인트 주소: /ai/briefing
router = APIRouter(prefix="/ai", tags=["AI Recommendation"])

# Vercel 환경 변수에서 GEMINI_API_KEY 읽기
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class AIBriefingRequest(BaseModel):
    originName: str
    destName: str
    isNight: bool = False
    policeCount: int = 0
    bellCount: int = 0
    safetyScore: int = 50

class AIBriefingResponse(BaseModel):
    tagline: str
    safetyTags: List[str]

@router.post("/briefing", response_model=AIBriefingResponse, status_code=status.HTTP_200_OK)
def get_ai_briefing(data: AIBriefingRequest):
    # GEMINI_API_KEY가 없을 경우 예외 처리 (서버 튕김 방지)
    if not GEMINI_API_KEY:
        print("⚠️ GEMINI_API_KEY가 설정되지 않았습니다.")
        return AIBriefingResponse(
            tagline=f"파출소 {data.policeCount}개·비상벨 {data.bellCount}개 안심 경유 구역",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""
        사용자가 '{data.originName}'에서 '{data.destName}'까지 도보로 이동합니다.
        시간대: {'야간(밤)' if data.isNight else '주간(낮)'}
        경로 인프라: 파출소 {data.policeCount}개, 비상벨 {data.bellCount}개, 종합 안전점수 {data.safetyScore}점.

        이 정보를 바탕으로 사용자 안심용 한줄 요약 문구(tagline)와 태그 3개(safetyTags)를 JSON 형식으로 작성해줘.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
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
        print(f"❌ Gemini API 오류: {str(e)}")
        return AIBriefingResponse(
            tagline=f"파출소 및 비상벨 밀집 구역 경유 (안전점수 {data.safetyScore}점)",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )
