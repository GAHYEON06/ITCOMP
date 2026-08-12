// geminiService.ts
export async function fetchAIBriefing(
  originName: string,
  destName: string,
  isNight: boolean,
  policeCount: number,
  bellCount: number,
  safetyScore: number
): Promise<AIBriefing> {
  try {
    const response = await fetch('https://zip-r0.vercel.app/ai/briefing', { // 👈 백엔드 전체 URL 명시[cite: 1]
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originName,
        destName,
        isNight,
        policeCount,
        bellCount,
        safetyScore,
      }),
    });

    if (!response.ok) {
      throw new Error(`API응답 실패 (상태코드: ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.warn("AI 브리핑 연동 실패, 기본 문구를 사용합니다:", error);
    // ⭐️ 에러가 나더라도 null이나 throw 대신 기본 객체를 반환해서 화면이 멈추지 않게 함
    return {
      tagline: `파출소 ${policeCount}개·비상벨 ${bellCount}개 안심 경유 구역`,
      safetyTags: ['파출소 근처', '비상벨 구역', '안전 우선'],
    };
  }
}