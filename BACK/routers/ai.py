import os
import json
import pandas as pd
from fastapi import APIRouter, status
from pydantic import BaseModel
from typing import List
from groq import Groq

router = APIRouter(prefix="/ai", tags=["AI Recommendation"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# 1. 백엔드 실행 시 CSV 파일 로드 (예시)
# CSV 파일 위치: BACK/data/safety_data.csv
CSV_PATH = os.path.join(os.path.dirname(__file__), "../data/safety_data.csv")

try:
    if os.path.exists(CSV_PATH):
        safety_df = pd.read_csv(CSV_PATH)
        print("✅ 안전 인프라 CSV 데이터 로드 완료")
    else:
        safety_df = None
        print("⚠️ CSV 파일이 없습니다. 기본 계산을 진행합니다.")
except Exception as e:
    safety_df = None
    print(f"❌ CSV 로드 오류: {e}")


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

@router.post("/briefing", response_model=AIBriefingResponse)
def get_ai_briefing(data: AIBriefingRequest):
    if not GROQ_API_KEY:
        return AIBriefingResponse(
            tagline=f"파출소 {data.policeCount}개·비상벨 {data.bellCount}개 안심 경유 구역",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )

    try:
        client = Groq(api_key=GROQ_API_KEY)

        # 2. CSV 데이터를 활용해 유동적인 안심 가이드 작성
        prompt = f"""
        당신은 여성 및 교통 약자를 위한 안심 귀가 경로 안내 AI입니다.
        다음 경로 정보를 바탕으로 안심 한 줄 요약(tagline)과 태그 3개(safetyTags)를 작성하세요.

        [경로 정보]
        - 출발지: {data.originName} -> 도착지: {data.destName}
        - 시간대: {'야간(밤)' if data.isNight else '주간(낮)'}
        - 안전 인프라: 파출소 {data.policeCount}개, 비상벨 {data.bellCount}개
        - 종합 안전 점수: {data.safetyScore}점 / 100점

        [응답 규칙]
        반드시 JSON 형식으로만 답하세요:
        {{
          "tagline": "문구 내용",
          "safetyTags": ["태그1", "태그2", "태그3"]
        }}
        """

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "Output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        result_json = json.loads(response.choices[0].message.content)

        return AIBriefingResponse(
            tagline=result_json.get("tagline", "안전 인프라 연동 안심 도보 경로"),
            safetyTags=result_json.get("safetyTags", ["파출소 근처", "비상벨 구역", "안전 우선"])
        )

    except Exception as e:
        print(f"❌ Groq API 오류: {str(e)}")
        return AIBriefingResponse(
            tagline=f"안전 인프라 연동 도보 경로 (안전점수 {data.safetyScore}점)",
            safetyTags=["파출소 근처", "비상벨 구역", "안전 우선"]
        )
