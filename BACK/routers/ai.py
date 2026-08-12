import os
import json
from fastapi import APIRouter, status
from pydantic import BaseModel
from typing import List
from groq import Groq

# 엔드포인트 주소: /ai/briefing
router = APIRouter(prefix="/ai", tags=["AI Recommendation"])

# Vercel 환경 변수에서 GROQ_API_KEY 읽기
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

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
    # API 키가 없을 경우 서버 오류 방지를 위한 예외 처리
    if not GROQ_API_KEY:
        print("⚠️ GROQ_API_KEY가 설정되지 않았습니다.")
        return AIBriefingResponse(
            tagline=f"파출소 {data.policeCount}개·비상벨 {data.bellCount}개 안심 경유 구역",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )

    try:
        client = Groq(api_key=GROQ_API_KEY)

        prompt = f"""
        당신은 여성 및 교통 약자를 위한 안심 귀가 경로 안내 AI입니다.
        다음 경로 정보를 기반으로 사용자가 안심할 수 있는 짧고 강렬한 한 줄 요약 문구(tagline)와 핵심 태그 3개(safetyTags)를 작성하세요.

        [경로 정보]
        - 출발지: {data.originName}
        - 도착지: {data.destName}
        - 시간대: {'야간(밤)' if data.isNight else '주간(낮)'}
        - 인근 파출소 수: {data.policeCount}개
        - 인근 비상벨 수: {data.bellCount}개
        - 종합 안전 점수: {data.safetyScore}점 / 100점

        [출력 규칙]
        오직 아래 예시와 동일한 JSON 형식으로만 응답해야 합니다. 다른 서론이나 부연 설명은 절대 포함하지 마세요.

        {{
          "tagline": "파출소와 비상벨이 인접해 있어 야간에도 안심하고 걸을 수 있는 경로입니다.",
          "safetyTags": ["파출소 인접", "비상벨 설치", "안전점수 양호"]
        }}
        """

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        content = response.choices[0].message.content
        result_json = json.loads(content)

        return AIBriefingResponse(
            tagline=result_json.get("tagline", "안전 인프라 연동 안심 도보 경로"),
            safetyTags=result_json.get("safetyTags", ["파출소 근처", "비상벨 구역", "안전 우선"])
        )

    except Exception as e:
        print(f"❌ Groq API 오류: {str(e)}")
        return AIBriefingResponse(
            tagline=f"파출소 및 비상벨 밀집 구역 경유 (안전점수 {data.safetyScore}점)",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )
