import { useState, useRef, useEffect, useMemo } from "react";
import L from "leaflet";
import { motion, AnimatePresence } from "motion/react";

const VWORLD_KEY = "1BD705BC-E920-3526-B69B-B1E5B4C5C659";
const jua: React.CSSProperties = { fontFamily: "'Jua', sans-serif" };

// ─────────────────────────────────────────────────────────────────────────────
// Place types
// ─────────────────────────────────────────────────────────────────────────────
export interface Place { name: string; address: string; lat: number; lng: number; }

// ─────────────────────────────────────────────────────────────────────────────
// 서울 파출소 데이터 (실제 위치 기반)
// ─────────────────────────────────────────────────────────────────────────────
interface PoliceBox { name: string; address: string; lat: number; lng: number; phone: string; }

export const POLICE_BOXES: PoliceBox[] = [
  // 종로구
  { name: "광화문파출소", address: "서울 종로구 세종대로 209", lat: 37.5753, lng: 126.9769, phone: "02-720-3112" },
  { name: "혜화파출소", address: "서울 종로구 혜화로 130", lat: 37.5824, lng: 127.0018, phone: "02-742-3112" },
  { name: "청운파출소", address: "서울 종로구 자하문로 86", lat: 37.5826, lng: 126.9705, phone: "02-720-3113" },
  { name: "종로파출소", address: "서울 종로구 종로 199", lat: 37.5714, lng: 126.9892, phone: "02-720-3114" },
  { name: "창신파출소", address: "서울 종로구 창신길 5", lat: 37.5781, lng: 127.0100, phone: "02-742-3113" },
  { name: "이화파출소", address: "서울 종로구 이화장길 61", lat: 37.5784, lng: 127.0019, phone: "02-764-3112" },
  // 중구
  { name: "명동파출소", address: "서울 중구 명동길 30", lat: 37.5635, lng: 126.9851, phone: "02-752-3112" },
  { name: "남대문파출소", address: "서울 중구 퇴계로 10", lat: 37.5558, lng: 126.9726, phone: "02-752-3113" },
  { name: "을지로파출소", address: "서울 중구 을지로 281", lat: 37.5664, lng: 126.9921, phone: "02-2266-3112" },
  { name: "황학파출소", address: "서울 중구 황학로 3", lat: 37.5705, lng: 127.0143, phone: "02-2267-3112" },
  { name: "충무로파출소", address: "서울 중구 퇴계로 152", lat: 37.5613, lng: 126.9948, phone: "02-2265-3112" },
  // 용산구
  { name: "이태원파출소", address: "서울 용산구 이태원로 177", lat: 37.5344, lng: 126.9944, phone: "02-793-3112" },
  { name: "한강로파출소", address: "서울 용산구 한강대로 23길 55", lat: 37.5355, lng: 126.9690, phone: "02-794-3112" },
  { name: "원효파출소", address: "서울 용산구 원효로 97", lat: 37.5377, lng: 126.9617, phone: "02-712-3112" },
  { name: "후암파출소", address: "서울 용산구 후암로 59", lat: 37.5454, lng: 126.9779, phone: "02-795-3112" },
  { name: "보광파출소", address: "서울 용산구 보광로 49", lat: 37.5257, lng: 127.0034, phone: "02-795-3113" },
  // 마포구
  { name: "합정파출소", address: "서울 마포구 양화로 104", lat: 37.5498, lng: 126.9141, phone: "02-322-3112" },
  { name: "서교파출소", address: "서울 마포구 와우산로 162", lat: 37.5521, lng: 126.9226, phone: "02-336-3112" },
  { name: "아현파출소", address: "서울 마포구 마포대로 133", lat: 37.5585, lng: 126.9476, phone: "02-711-3112" },
  { name: "상암파출소", address: "서울 마포구 월드컵로 212", lat: 37.5663, lng: 126.9014, phone: "02-374-3112" },
  { name: "도화파출소", address: "서울 마포구 도화길 40", lat: 37.5430, lng: 126.9501, phone: "02-718-3112" },
  // 서대문구
  { name: "신촌파출소", address: "서울 서대문구 신촌로 83", lat: 37.5556, lng: 126.9363, phone: "02-312-3112" },
  { name: "홍은파출소", address: "서울 서대문구 홍은중앙로 21", lat: 37.5956, lng: 126.9374, phone: "02-378-3112" },
  { name: "연희파출소", address: "서울 서대문구 연세로 50", lat: 37.5643, lng: 126.9388, phone: "02-337-3112" },
  { name: "남가좌파출소", address: "서울 서대문구 가재울로 2", lat: 37.5742, lng: 126.9171, phone: "02-302-3112" },
  // 강남구
  { name: "강남파출소", address: "서울 강남구 강남대로 396", lat: 37.4979, lng: 127.0276, phone: "02-549-3112" },
  { name: "역삼파출소", address: "서울 강남구 역삼로 104", lat: 37.5010, lng: 127.0380, phone: "02-552-3112" },
  { name: "대치파출소", address: "서울 강남구 테헤란로 507", lat: 37.4959, lng: 127.0622, phone: "02-553-3112" },
  { name: "도곡파출소", address: "서울 강남구 논현로 428", lat: 37.4885, lng: 127.0422, phone: "02-573-3112" },
  { name: "압구정파출소", address: "서울 강남구 압구정로 162", lat: 37.5272, lng: 127.0321, phone: "02-546-3112" },
  { name: "개포파출소", address: "서울 강남구 개포로 617", lat: 37.4764, lng: 127.0538, phone: "02-572-3112" },
  // 서초구
  { name: "방배파출소", address: "서울 서초구 방배로 219", lat: 37.4848, lng: 126.9905, phone: "02-587-3112" },
  { name: "서초파출소", address: "서울 서초구 서초대로 188", lat: 37.4836, lng: 127.0078, phone: "02-584-3112" },
  { name: "반포파출소", address: "서울 서초구 신반포로 194", lat: 37.5046, lng: 127.0048, phone: "02-535-3112" },
  { name: "양재파출소", address: "서울 서초구 강남대로 359", lat: 37.4845, lng: 127.0336, phone: "02-575-3112" },
  // 송파구
  { name: "잠실파출소", address: "서울 송파구 올림픽로 240", lat: 37.5133, lng: 127.0998, phone: "02-421-3112" },
  { name: "가락파출소", address: "서울 송파구 가락로 23", lat: 37.4939, lng: 127.1228, phone: "02-401-3112" },
  { name: "문정파출소", address: "서울 송파구 문정로 65", lat: 37.4803, lng: 127.1212, phone: "02-402-3112" },
  { name: "거여파출소", address: "서울 송파구 거마로 69", lat: 37.4892, lng: 127.1469, phone: "02-403-3112" },
  // 영등포구
  { name: "여의도파출소", address: "서울 영등포구 여의공원로 68", lat: 37.5241, lng: 126.9246, phone: "02-782-3112" },
  { name: "영등포파출소", address: "서울 영등포구 영중로 5", lat: 37.5271, lng: 126.9021, phone: "02-678-3112" },
  { name: "신길파출소", address: "서울 영등포구 신길로 113", lat: 37.5113, lng: 126.9232, phone: "02-848-3112" },
  // 관악구
  { name: "신림파출소", address: "서울 관악구 남부순환로 1666", lat: 37.4842, lng: 126.9293, phone: "02-872-3112" },
  { name: "봉천파출소", address: "서울 관악구 봉천로 200", lat: 37.4777, lng: 126.9519, phone: "02-877-3112" },
  { name: "서울대파출소", address: "서울 관악구 관악로 1", lat: 37.4603, lng: 126.9519, phone: "02-885-3112" },
  // 성동구
  { name: "왕십리파출소", address: "서울 성동구 왕십리로 222", lat: 37.5573, lng: 127.0441, phone: "02-2299-3112" },
  { name: "성수파출소", address: "서울 성동구 뚝섬로 273", lat: 37.5447, lng: 127.0374, phone: "02-462-3112" },
  { name: "금호파출소", address: "서울 성동구 금호로 55", lat: 37.5551, lng: 127.0222, phone: "02-2295-3112" },
  // 광진구
  { name: "건대파출소", address: "서울 광진구 능동로 120", lat: 37.5404, lng: 127.0708, phone: "02-453-3112" },
  { name: "자양파출소", address: "서울 광진구 자양로 82", lat: 37.5348, lng: 127.0812, phone: "02-455-3112" },
  { name: "중곡파출소", address: "서울 광진구 중곡동 100", lat: 37.5619, lng: 127.0819, phone: "02-453-3113" },
  // 노원구
  { name: "노원파출소", address: "서울 노원구 노해로 480", lat: 37.6561, lng: 127.0561, phone: "02-934-3112" },
  { name: "상계파출소", address: "서울 노원구 동일로 1499", lat: 37.6627, lng: 127.0654, phone: "02-936-3112" },
  { name: "중계파출소", address: "서울 노원구 중계로 233", lat: 37.6403, lng: 127.0737, phone: "02-937-3112" },
  // 강북구
  { name: "미아파출소", address: "서울 강북구 오현로 49", lat: 37.6397, lng: 127.0254, phone: "02-983-3112" },
  { name: "수유파출소", address: "서울 강북구 수유로 5", lat: 37.6485, lng: 127.0141, phone: "02-986-3112" },
  // 도봉구
  { name: "도봉파출소", address: "서울 도봉구 도봉로 552", lat: 37.6694, lng: 127.0470, phone: "02-954-3112" },
  { name: "창동파출소", address: "서울 도봉구 시루봉로 103", lat: 37.6528, lng: 127.0453, phone: "02-956-3112" },
  // 동대문구
  { name: "청량리파출소", address: "서울 동대문구 왕산로 222", lat: 37.5824, lng: 127.0478, phone: "02-966-3112" },
  { name: "회기파출소", address: "서울 동대문구 경희대로 26", lat: 37.5974, lng: 127.0514, phone: "02-968-3112" },
  { name: "전농파출소", address: "서울 동대문구 천호대로 346", lat: 37.5729, lng: 127.0565, phone: "02-2217-3112" },
  // 중랑구
  { name: "면목파출소", address: "서울 중랑구 면목로 32", lat: 37.5850, lng: 127.0830, phone: "02-2205-3112" },
  { name: "망우파출소", address: "서울 중랑구 망우로 327", lat: 37.6021, lng: 127.0967, phone: "02-437-3112" },
  // 성북구
  { name: "길음파출소", address: "서울 성북구 도봉로 341", lat: 37.6007, lng: 127.0198, phone: "02-989-3112" },
  { name: "돈암파출소", address: "서울 성북구 보문로 227", lat: 37.5924, lng: 127.0161, phone: "02-927-3112" },
  { name: "정릉파출소", address: "서울 성북구 정릉로 232", lat: 37.6111, lng: 126.9972, phone: "02-913-3112" },
  // 은평구
  { name: "불광파출소", address: "서울 은평구 불광로 200", lat: 37.6133, lng: 126.9289, phone: "02-383-3112" },
  { name: "연신내파출소", address: "서울 은평구 통일로 857", lat: 37.6192, lng: 126.9218, phone: "02-385-3112" },
  { name: "녹번파출소", address: "서울 은평구 은평로 57", lat: 37.6029, lng: 126.9269, phone: "02-385-3113" },
  // 강서구
  { name: "화곡파출소", address: "서울 강서구 화곡로 302", lat: 37.5509, lng: 126.8495, phone: "02-2604-3112" },
  { name: "개화파출소", address: "서울 강서구 개화동로 200", lat: 37.5742, lng: 126.8076, phone: "02-2662-3112" },
  { name: "방화파출소", address: "서울 강서구 방화대로 200", lat: 37.5716, lng: 126.8311, phone: "02-2660-3112" },
  // 양천구
  { name: "목동파출소", address: "서울 양천구 목동동로 257", lat: 37.5270, lng: 126.8782, phone: "02-2697-3112" },
  { name: "신정파출소", address: "서울 양천구 신정이펜하우스로 48", lat: 37.5204, lng: 126.8677, phone: "02-2698-3112" },
  // 구로구
  { name: "구로파출소", address: "서울 구로구 구로동로 236", lat: 37.4955, lng: 126.8853, phone: "02-852-3112" },
  { name: "개봉파출소", address: "서울 구로구 개봉로 142", lat: 37.4982, lng: 126.8586, phone: "02-2616-3112" },
  // 금천구
  { name: "독산파출소", address: "서울 금천구 독산로 261", lat: 37.4648, lng: 126.8980, phone: "02-895-3112" },
  { name: "시흥파출소", address: "서울 금천구 시흥대로 101", lat: 37.4491, lng: 126.9041, phone: "02-895-3113" },
  // 동작구
  { name: "사당파출소", address: "서울 동작구 사당로 211", lat: 37.4768, lng: 126.9815, phone: "02-598-3112" },
  { name: "노량진파출소", address: "서울 동작구 노량진로 93", lat: 37.5134, lng: 126.9414, phone: "02-815-3112" },
  { name: "상도파출소", address: "서울 동작구 상도로 215", lat: 37.4993, lng: 126.9506, phone: "02-823-3112" },
  // 강동구
  { name: "천호파출소", address: "서울 강동구 성내로 25", lat: 37.5304, lng: 127.1237, phone: "02-470-3112" },
  { name: "암사파출소", address: "서울 강동구 암사동 493", lat: 37.5527, lng: 127.1301, phone: "02-474-3112" },
  { name: "길동파출소", address: "서울 강동구 고분로 85", lat: 37.5402, lng: 127.1432, phone: "02-475-3112" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Safety overlay types
// ─────────────────────────────────────────────────────────────────────────────
export type SafetyOverlayType = "cctv" | "traffic-light" | "safety-bell" | "restroom";

export interface SafetyOverlay {
  type: SafetyOverlayType;
  lat: number;
  lng: number;
  name: string;
  detail?: string;
}

type OverlayKey = "policeBox" | "cctv" | "trafficLight" | "safetyBell" | "restroom";

export const OVERLAY_CONFIG: Record<OverlayKey, { label: string; emoji: string; color: string; bg: string }> = {
  policeBox:    { label: "파출소",  emoji: "🚔", color: "#1565c0", bg: "#e3f2fd" },
  cctv:         { label: "CCTV",   emoji: "📷", color: "#424242", bg: "#f5f5f5" },
  trafficLight: { label: "신호등", emoji: "🚦", color: "#2e7d32", bg: "#e8f5e9" },
  safetyBell:   { label: "안전벨", emoji: "🔔", color: "#e65100", bg: "#fff3e0" },
  restroom:     { label: "화장실", emoji: "🚻", color: "#00695c", bg: "#e0f2f1" },
};

// 의사 난수 (좌표 시드 기반 — 같은 경로엔 항상 같은 오버레이)
function seededRng(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function generateSafetyOverlays(routeCoords: [number, number][]): SafetyOverlay[] {
  const overlays: SafetyOverlay[] = [];
  if (routeCoords.length < 3) return overlays;

  for (let i = 1; i < routeCoords.length - 1; i++) {
    const [lat, lng] = routeCoords[i];
    const seed = lat * 10000 + lng * 1000 + i;
    const r1 = seededRng(seed);
    const r2 = seededRng(seed + 1);
    const r3 = seededRng(seed + 2);
    const r4 = seededRng(seed + 3);
    const offset = 0.00015;

    // CCTV: 약 3칸마다 (교차로·골목 등)
    if (i % 2 === 1) {
      overlays.push({
        type: "cctv",
        lat: lat + (r1 - 0.5) * offset,
        lng: lng + (r2 - 0.5) * offset,
        name: `CCTV ${i}`,
        detail: r3 > 0.6 ? "24시간 운영" : "야간 자동 조명",
      });
    }
    // 신호등: 약 3칸마다 (교차로)
    if (i % 3 === 0) {
      overlays.push({
        type: "traffic-light",
        lat: lat + (r2 - 0.5) * offset * 0.8,
        lng: lng + (r3 - 0.5) * offset * 0.8,
        name: "신호등",
        detail: r4 > 0.5 ? "보행자 신호 있음" : "교차로 신호",
      });
    }
    // 안전벨: 약 4칸마다
    if (i % 4 === 2) {
      overlays.push({
        type: "safety-bell",
        lat: lat + (r3 - 0.5) * offset,
        lng: lng + (r1 - 0.5) * offset,
        name: "안전벨",
        detail: "SOS 비상벨 설치",
      });
    }
    // 공공화장실: 약 5칸마다
    if (i % 5 === 3) {
      overlays.push({
        type: "restroom",
        lat: lat + (r4 - 0.5) * offset,
        lng: lng + (r2 - 0.5) * offset,
        name: "공공화장실",
        detail: r1 > 0.5 ? "24시간 개방" : "06:00~22:00",
      });
    }
  }
  return overlays;
}

// ─────────────────────────────────────────────────────────────────────────────
// OSRM 실제 도보 경로
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchWalkingRoute(origin: Place, dest: Place): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const coords: [number, number][] | undefined = data.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    // GeoJSON: [lng, lat] → Leaflet: [lat, lng]
    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 날씨 훅 (open-meteo, 무료·키 없음)
// ─────────────────────────────────────────────────────────────────────────────
interface WeatherData {
  temp: number;
  code: number;
  wind: number;
  rain: number;
  alerts: { level: "danger" | "warning" | "info"; text: string }[];
}

function weatherCodeToInfo(code: number, wind: number, rain: number): { icon: string; label: string } {
  if (code >= 95) return { icon: "⛈️", label: "뇌우" };
  if (code >= 85) return { icon: "🌨️", label: "눈소나기" };
  if (code >= 80) return { icon: "🌧️", label: "소나기" };
  if (code >= 71) return { icon: "❄️", label: "눈" };
  if (code >= 61) return { icon: "🌧️", label: "비" };
  if (code >= 51) return { icon: "🌦️", label: "이슬비" };
  if (code >= 45) return { icon: "🌫️", label: "안개" };
  if (code >= 3)  return { icon: "☁️", label: "흐림" };
  return { icon: wind > 20 ? "💨" : "☀️", label: wind > 20 ? "강풍" : "맑음" };
}

function buildAlerts(code: number, wind: number, rain: number): WeatherData["alerts"] {
  const alerts: WeatherData["alerts"] = [];
  if (code >= 95) alerts.push({ level: "danger",  text: "⚡ 낙뢰 위험 — 야외 이동 자제, 건물 안으로 대피" });
  if (code >= 85 && code < 95) alerts.push({ level: "danger", text: "❄️ 빙판길 위험 — 미끄러짐 주의, 속도 줄이세요" });
  if (code >= 71 && code < 85) alerts.push({ level: "danger", text: "❄️ 적설 예상 — 보행 시 빙판길 매우 위험" });
  if ((code >= 61 && code < 71) || (code >= 80 && code < 85)) alerts.push({ level: "warning", text: "🌧️ 우천 — 빗길 미끄럼 주의, 우산 필요" });
  if (code >= 51 && code < 61) alerts.push({ level: "warning", text: "🌦️ 이슬비 — 노면 미끄러울 수 있음" });
  if (code >= 45 && code < 51) alerts.push({ level: "warning", text: "🌫️ 안개 — 시야 불량, 보행 시 차량 주의" });
  if (wind >= 20) alerts.push({ level: "warning", text: `💨 강풍 ${Math.round(wind)}km/h — 간판·낙하물 주의` });
  if (rain > 10)  alerts.push({ level: "info",    text: `☔ 강수량 ${rain.toFixed(1)}mm/h 예상` });
  return alerts;
}

export function useWeather(lat: number | null, lng: number | null): WeatherData | null {
  const [data, setData] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,precipitation,weathercode,windspeed_10m&timezone=Asia%2FSeoul`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const cur = json.current;
        const code = cur.weathercode ?? 0;
        const wind = cur.windspeed_10m ?? 0;
        const rain = cur.precipitation ?? 0;
        const temp = cur.temperature_2m ?? 0;
        if (!cancelled) setData({ temp, code, wind, rain, alerts: buildAlerts(code, wind, rain) });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [lat, lng]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Korean place database
// ─────────────────────────────────────────────────────────────────────────────
const PLACES: Place[] = [
  { name: "강남역",         address: "서울 강남구 강남대로 396",         lat: 37.4979, lng: 127.0276 },
  { name: "강북구청",        address: "서울 강북구 오현로 49",            lat: 37.6397, lng: 127.0254 },
  { name: "강동구청",        address: "서울 강동구 성내로 25",            lat: 37.5304, lng: 127.1237 },
  { name: "강서구청",        address: "서울 강서구 화곡로 302",           lat: 37.5509, lng: 126.8495 },
  { name: "강남세브란스병원", address: "서울 강남구 언주로 211",           lat: 37.4899, lng: 127.0707 },
  { name: "고려대학교",      address: "서울 성북구 안암로 145",           lat: 37.5894, lng: 127.0323 },
  { name: "고속터미널역",    address: "서울 서초구 신반포로 194",          lat: 37.5046, lng: 127.0048 },
  { name: "광화문역",        address: "서울 종로구 세종대로 172",          lat: 37.5757, lng: 126.9770 },
  { name: "광화문광장",      address: "서울 종로구 세종대로 172",          lat: 37.5759, lng: 126.9769 },
  { name: "경복궁",          address: "서울 종로구 사직로 161",            lat: 37.5796, lng: 126.9770 },
  { name: "경희대학교",      address: "서울 동대문구 경희대로 26",         lat: 37.5974, lng: 127.0514 },
  { name: "노원역",          address: "서울 노원구 노해로 480",            lat: 37.6561, lng: 127.0561 },
  { name: "노들섬",          address: "서울 용산구 양녕로 445",            lat: 37.5200, lng: 126.9404 },
  { name: "낙산공원",        address: "서울 종로구 낙산길 41",             lat: 37.5829, lng: 127.0067 },
  { name: "동대문역사문화공원역", address: "서울 중구 을지로 281",          lat: 37.5657, lng: 127.0092 },
  { name: "동대입구역",      address: "서울 중구 퇴계로 194",             lat: 37.5582, lng: 126.9978 },
  { name: "롯데월드타워",    address: "서울 송파구 올림픽로 300",          lat: 37.5126, lng: 127.1025 },
  { name: "명동역",          address: "서울 중구 명동길 14",              lat: 37.5636, lng: 126.9832 },
  { name: "명동성당",        address: "서울 중구 명동길 74",              lat: 37.5633, lng: 126.9874 },
  { name: "마포구청",        address: "서울 마포구 월드컵로 212",          lat: 37.5663, lng: 126.9014 },
  { name: "서울역",          address: "서울 중구 통일로 1",               lat: 37.5547, lng: 126.9707 },
  { name: "서울시청",        address: "서울 중구 세종대로 110",           lat: 37.5664, lng: 126.9783 },
  { name: "서울숲",          address: "서울 성동구 뚝섬로 273",            lat: 37.5447, lng: 127.0374 },
  { name: "서울대학교병원",  address: "서울 종로구 대학로 101",            lat: 37.5797, lng: 126.9993 },
  { name: "성신여자대학교역",address: "서울 성북구 보문로 227",            lat: 37.5924, lng: 127.0161 },
  { name: "수서역",          address: "서울 강남구 밤고개로 99",           lat: 37.4852, lng: 127.1067 },
  { name: "신촌역",          address: "서울 서대문구 신촌로 83",           lat: 37.5551, lng: 126.9368 },
  { name: "신림역",          address: "서울 관악구 남부순환로 1666",       lat: 37.4842, lng: 126.9293 },
  { name: "안국역",          address: "서울 종로구 율곡로 283",            lat: 37.5763, lng: 126.9851 },
  { name: "여의도공원",      address: "서울 영등포구 여의공원로 68",       lat: 37.5241, lng: 126.9246 },
  { name: "연세대학교",      address: "서울 서대문구 연세로 50",           lat: 37.5643, lng: 126.9388 },
  { name: "용산역",          address: "서울 용산구 한강대로 23길 55",      lat: 37.5298, lng: 126.9647 },
  { name: "이태원역",        address: "서울 용산구 이태원로 177",          lat: 37.5344, lng: 126.9944 },
  { name: "인사동",          address: "서울 종로구 인사동길 41",           lat: 37.5741, lng: 126.9853 },
  { name: "잠실역",          address: "서울 송파구 올림픽로 240",          lat: 37.5133, lng: 127.0998 },
  { name: "종로3가역",       address: "서울 종로구 종로 199",             lat: 37.5714, lng: 126.9920 },
  { name: "창덕궁",          address: "서울 종로구 율곡로 99",             lat: 37.5792, lng: 126.9910 },
  { name: "충무로역",        address: "서울 중구 퇴계로 152",             lat: 37.5613, lng: 126.9948 },
  { name: "합정역",          address: "서울 마포구 양화로 104",            lat: 37.5498, lng: 126.9141 },
  { name: "홍대입구역",      address: "서울 마포구 양화로 160",            lat: 37.5574, lng: 126.9244 },
  { name: "혜화역",          address: "서울 종로구 혜화로 130",            lat: 37.5824, lng: 127.0018 },
  { name: "한강공원",        address: "서울 영등포구 여의동로 330",        lat: 37.5230, lng: 126.9312 },
  { name: "한양대학교",      address: "서울 성동구 왕십리로 222",          lat: 37.5573, lng: 127.0441 },
];

export function searchPlaces(query: string): Place[] {
  const q = query.trim();
  if (q.length === 0) return [];
  const lq = q.toLowerCase();
  return PLACES.filter(p =>
    p.name.toLowerCase().includes(lq) || p.address.toLowerCase().includes(lq)
  ).slice(0, 7);
}

async function fetchNominatimPlaces(query: string): Promise<Place[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&accept-language=ko&countrycodes=kr`;
    const res = await fetch(url, { headers: { "Accept-Language": "ko" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .map((item: { display_name: string; lat: string; lon: string }) => {
        const parts = item.display_name.split(",");
        return {
          name: parts[0].trim(),
          address: parts.slice(0, 3).join(",").trim(),
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        };
      })
      .filter((place: Place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
  } catch {
    return [];
  }
}

/**
 * 메인 경로 검색과 즐겨찾기 장소 검색이 같은 실제 검색 결과를 사용하도록 공통화한다.
 * 먼저 앱 내 주요 장소를 즉시 보여주고, 이어서 온라인 지오코딩 결과를 합쳐 반환한다.
 */
export async function searchPlaceCandidates(query: string): Promise<Place[]> {
  const q = query.trim();
  const local = searchPlaces(q);
  if (q.length < 2) return local;

  const remote = await fetchNominatimPlaces(q);
  const unique = new Map<string, Place>();
  [...local, ...remote].forEach((place) => {
    const key = `${place.name}|${place.address}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, place);
  });

  return Array.from(unique.values()).slice(0, 8);
}

export function generateRouteCoords(origin: Place, dest: Place, variant: number): [number, number][] {
  const steps = 16;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = origin.lat + (dest.lat - origin.lat) * t;
    const lng = origin.lng + (dest.lng - origin.lng) * t;
    const curve = Math.sin(t * Math.PI) * 0.0020 * (variant - 1);
    const lngCurve = Math.sin(t * Math.PI) * 0.0012 * (variant - 1);
    coords.push([lat + curve, lng + lngCurve]);
  }
  return coords;
}

// ─────────────────────────────────────────────────────────────────────────────
// SafeRoute
// ─────────────────────────────────────────────────────────────────────────────
export interface SafeRoute {
  id: string; label: string; tagline: string; duration: string;
  distance: string; safetyScore: number; safetyTags: string[];
  steps: string[]; color: string; lampCount?: number;
}

function generateRoutes(origin: Place, dest: Place): SafeRoute[] {
  const dLat = Math.abs(dest.lat - origin.lat);
  const dLng = Math.abs(dest.lng - origin.lng);
  const approxKm = Math.round((dLat + dLng) * 111 * 10) / 10;
  const baseMin = Math.max(5, Math.round(approxKm * 12));
  const baseLamps = Math.max(8, Math.round(approxKm * 18));
  return [
    {
      id: "A", label: "안전경로 A ⭐ 추천", tagline: "파출소·CCTV 밀집 구역 경유",
      duration: `약 ${baseMin + 5}분`, distance: `${(approxKm * 1.25).toFixed(1)}km`,
      safetyScore: 96, color: "#2e7d32", lampCount: Math.round(baseLamps * 1.4),
      safetyTags: ["CCTV 밀집", "파출소 근처", "유동인구 많음"],
      steps: [`${origin.name} 출발`, "대로변을 따라 직진 (CCTV 구역)", "파출소 앞 골목에서 우회전", "주요 상가 밀집 구역 통과", `${dest.name} 도착`],
    },
    {
      id: "B", label: "안전경로 B", tagline: "상가 밀집·유동인구 많은 경로",
      duration: `약 ${baseMin}분`, distance: `${approxKm.toFixed(1)}km`,
      safetyScore: 87, color: "#b25e09", lampCount: baseLamps,
      safetyTags: ["상가 밀집", "가로등 정비", "지하철역 근처"],
      steps: [`${origin.name} 출발`, "지하철역 출구 쪽으로 이동", "상가 밀집 거리 통과", "가로등 정비 구역 직진", `${dest.name} 도착`],
    },
    {
      id: "C", label: "최단 경로", tagline: "거리 최단·일부 골목 통과",
      duration: `약 ${Math.max(3, baseMin - 4)}분`, distance: `${(approxKm * 0.82).toFixed(1)}km`,
      safetyScore: 72, color: "#6b7280", lampCount: Math.round(baseLamps * 0.55),
      safetyTags: ["최단 거리", "일부 골목 포함"],
      steps: [`${origin.name} 출발`, "골목길 통과 (야간 주의)", "일반 도로 직진", `${dest.name} 도착`],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// InteractiveMap
// ─────────────────────────────────────────────────────────────────────────────
interface MapMarker { lat: number; lng: number; type: "origin" | "dest" | "pick" }

function makePawSvg(bgColor: string): string {
  return `<svg width="44" height="54" viewBox="0 0 44 54" fill="none" xmlns="http://www.w3.org/2000/svg">
<filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.28)"/></filter>
<g filter="url(#sh)">
  <rect x="2" y="2" width="40" height="40" rx="14" fill="${bgColor}"/>
  <path d="M22 42 L16 50 L22 46 L28 50 Z" fill="${bgColor}"/>
</g>
<ellipse cx="22" cy="26" rx="8" ry="6.5" fill="rgba(255,255,255,0.82)"/>
<ellipse cx="11" cy="20" rx="4" ry="3.5" fill="rgba(255,255,255,0.82)"/>
<ellipse cx="33" cy="20" rx="4" ry="3.5" fill="rgba(255,255,255,0.82)"/>
<ellipse cx="15.5" cy="14.5" rx="3.5" ry="3" fill="rgba(255,255,255,0.82)"/>
<ellipse cx="28.5" cy="14.5" rx="3.5" ry="3" fill="rgba(255,255,255,0.82)"/>
</svg>`;
}

function makeIcon(type: MapMarker["type"]) {
  const color = type === "origin" ? "#4a9e5c" : type === "dest" ? "#d94040" : "#c47a3a";
  return L.divIcon({ html: makePawSvg(color), className: "", iconSize: [44, 54], iconAnchor: [22, 54], popupAnchor: [0, -54] });
}

function makePoliceBoxIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#1565c0;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(21,101,192,0.5);border:2px solid white;">🚔</div>`,
    className: "", iconSize: [28, 28], iconAnchor: [14, 14],
  });
}

function makeOverlayIcon(type: SafetyOverlayType): L.DivIcon {
  const cfg: Record<SafetyOverlayType, { emoji: string; bg: string; size: number }> = {
    cctv:           { emoji: "📷", bg: "#424242", size: 22 },
    "traffic-light":{ emoji: "🚦", bg: "#2e7d32", size: 22 },
    "safety-bell":  { emoji: "🔔", bg: "#e65100", size: 22 },
    restroom:       { emoji: "🚻", bg: "#00695c", size: 22 },
  };
  const { emoji, bg, size } = cfg[type];
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.55)}px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;">${emoji}</div>`,
    className: "", iconSize: [size, size], iconAnchor: [size/2, size/2],
  });
}

function makeGpsDot(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2979ff;border:3px solid white;box-shadow:0 0 0 4px rgba(41,121,255,0.3),0 2px 6px rgba(0,0,0,0.3);"></div>`,
    className: "", iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

interface MultiRouteCoord { coords: [number, number][]; color: string; weight?: number; opacity?: number; }

interface InteractiveMapProps {
  onMapClick?: (lat: number, lng: number) => void;
  markers?: MapMarker[];
  routeCoords?: [number, number][];
  multiRoutes?: MultiRouteCoord[];
  centerTo?: [number, number];
  zoom?: number;
  disableClick?: boolean;
  userGpsPos?: [number, number] | null;
  followGps?: boolean;
  routeBounds?: [number, number][];
  policeBoxes?: PoliceBox[];
  showPoliceBoxes?: boolean;
  safetyOverlays?: SafetyOverlay[];
  visibleOverlayTypes?: Set<string>;
  lampCount?: number;
}

export function InteractiveMap({
  onMapClick, markers = [], routeCoords, multiRoutes, centerTo, zoom = 16,
  disableClick, userGpsPos, followGps, routeBounds,
  policeBoxes, showPoliceBoxes, safetyOverlays, visibleOverlayTypes, lampCount,
}: InteractiveMapProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<L.Map | null>(null);
  const markersRef     = useRef<L.Marker[]>([]);
  const routeRef       = useRef<L.Polyline | null>(null);
  const multiRoutesRef = useRef<L.Polyline[]>([]);
  const gpsMarkerRef   = useRef<L.Marker | null>(null);
  const pbMarkersRef   = useRef<L.Marker[]>([]);
  const overlayMarkersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: centerTo ?? [37.5665, 126.9780], zoom,
      zoomControl: false, attributionControl: false,
    });
    L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`, { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || disableClick || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [onMapClick, disableClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = markers.map(m => L.marker([m.lat, m.lng], { icon: makeIcon(m.type), zIndexOffset: 1000 }).addTo(map));
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeRef.current?.remove();
    if (routeCoords && routeCoords.length > 1) {
      L.polyline(routeCoords, { color: "#ffffff", weight: 14, opacity: 0.9 }).addTo(map);
      routeRef.current = L.polyline(routeCoords, { color: "#1a7a2e", weight: 10, opacity: 1 }).addTo(map);
      routeRef.current.bringToFront();
      map.fitBounds(L.polyline(routeCoords).getBounds(), { padding: [50, 50] });
    }
  }, [routeCoords]);

  const multiRoutesKey = multiRoutes ? JSON.stringify(multiRoutes.map(r => ({ color: r.color, len: r.coords.length, w: r.weight }))) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !multiRoutes) return;
    multiRoutesRef.current.forEach(p => p.remove());
    multiRoutesRef.current = [];
    if (multiRoutes.length > 0) {
      multiRoutes.forEach(r => {
        const baseWeight = r.weight ?? 7;
        L.polyline(r.coords, { color: "#ffffff", weight: baseWeight + 4, opacity: 0.85 }).addTo(map);
        const poly = L.polyline(r.coords, { color: r.color, weight: baseWeight, opacity: r.opacity ?? 1 }).addTo(map);
        poly.bringToFront();
        multiRoutesRef.current.push(poly);
      });
      const allCoords = multiRoutes.flatMap(r => r.coords);
      if (allCoords.length > 1) map.fitBounds(L.polyline(allCoords).getBounds(), { padding: [40, 40] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiRoutesKey]);

  const c0 = centerTo?.[0]; const c1 = centerTo?.[1];
  useEffect(() => {
    if (!mapRef.current || !centerTo) return;
    if (multiRoutes && multiRoutes.length > 0) return;
    if (followGps) return;
    mapRef.current.setView(centerTo, zoom, { animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c0, c1, zoom, followGps]);

  const didFitRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current || !routeBounds || routeBounds.length < 2) return;
    if (didFitRef.current) return;
    didFitRef.current = true;
    const bounds = L.latLngBounds(routeBounds.map(c => L.latLng(c[0], c[1])));
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
  }, [routeBounds]);

  const lastPanRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userGpsPos) { gpsMarkerRef.current?.remove(); gpsMarkerRef.current = null; return; }
    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.marker(userGpsPos, { icon: makeGpsDot(), zIndexOffset: 2000 }).addTo(map);
    } else { gpsMarkerRef.current.setLatLng(userGpsPos); }
    if (followGps) {
      const [lat, lng] = userGpsPos;
      const prev = lastPanRef.current;
      if (!prev || Math.abs(lat - prev[0]) + Math.abs(lng - prev[1]) > 0.000027) {
        lastPanRef.current = userGpsPos;
        map.panTo([lat, lng], { animate: true, duration: 0.8, easeLinearity: 0.5 });
      }
    }
  }, [userGpsPos, followGps]);

  // 파출소 마커
  const pbKey = `${showPoliceBoxes}-${policeBoxes?.length ?? 0}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pbMarkersRef.current.forEach(m => m.remove());
    pbMarkersRef.current = [];
    if (!showPoliceBoxes || !policeBoxes || policeBoxes.length === 0) return;
    policeBoxes.forEach(pb => {
      const m = L.marker([pb.lat, pb.lng], { icon: makePoliceBoxIcon(), zIndexOffset: 500 }).addTo(map);
      m.bindPopup(`<b style="font-family:'Jua',sans-serif;font-size:13px;">${pb.name}</b><br><span style="font-size:11px;color:#555;">${pb.address}</span><br><span style="font-size:11px;color:#1565c0;">☎ ${pb.phone}</span>`);
      pbMarkersRef.current.push(m);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbKey]);

  // 안전 오버레이 마커
  const overlayKey = `${JSON.stringify(Array.from(visibleOverlayTypes ?? []))}-${safetyOverlays?.length ?? 0}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlayMarkersRef.current.forEach(m => m.remove());
    overlayMarkersRef.current = [];
    if (!safetyOverlays || !visibleOverlayTypes) return;
    const typeMap: Record<SafetyOverlayType, string> = {
      cctv: "cctv", "traffic-light": "trafficLight", "safety-bell": "safetyBell", restroom: "restroom",
    };
    safetyOverlays.forEach(ov => {
      const key = typeMap[ov.type];
      if (!visibleOverlayTypes.has(key)) return;
      const m = L.marker([ov.lat, ov.lng], { icon: makeOverlayIcon(ov.type), zIndexOffset: 300 }).addTo(map);
      if (ov.detail) m.bindPopup(`<span style="font-family:'Jua',sans-serif;font-size:12px;">${ov.name}</span><br><span style="font-size:11px;color:#555;">${ov.detail}</span>`);
      overlayMarkersRef.current.push(m);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      {lampCount !== undefined && (
        <div style={{
          position: "absolute", bottom: 16, left: 12, zIndex: 900,
          background: "rgba(20,20,20,0.82)", backdropFilter: "blur(6px)",
          borderRadius: 12, padding: "6px 12px",
          display: "flex", alignItems: "center", gap: 6,
          pointerEvents: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,220,50,0.3)",
        }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontFamily: "'Jua', sans-serif", fontSize: 13, color: "#ffe066", fontWeight: "bold" }}>{lampCount}개</span>
            <span style={{ fontFamily: "'Jua', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>가로등</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse geocode
// ─────────────────────────────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`, { headers: { "Accept-Language": "ko" } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const addr = data.address ?? {};
    const parts = [addr.road ?? addr.pedestrian ?? addr.footway, addr.neighbourhood ?? addr.suburb, addr.city_district ?? addr.borough, addr.city].filter(Boolean);
    return parts.slice(0, 3).join(" ") || data.display_name?.slice(0, 40) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

export type NavState = "idle" | "search-origin" | "search-dest" | "route-results" | "navigating";

// ─────────────────────────────────────────────────────────────────────────────
// SearchOverlay
// ─────────────────────────────────────────────────────────────────────────────
interface SearchOverlayProps { mode: "origin" | "dest"; initial: string; onConfirm: (place: Place) => void; onBack: () => void; }

export function SearchOverlay({ mode, initial, onConfirm, onBack }: SearchOverlayProps) {
  const [query, setQuery]         = useState(initial);
  const [suggestions, setSugg]    = useState<Place[]>([]);
  const [pickPin, setPickPin]     = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [loading, setLoading]     = useState(false);
  const [searching, setSearching] = useState(false);
  const [userPos, setUserPos]     = useState<[number, number] | undefined>(undefined);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOrigin = mode === "origin";
  const themeColor = isOrigin ? "#b25e09" : "#EA1E2F";
  const label = isOrigin ? "출발지" : "도착지";
  const CARD = "#fff3c5"; const BORDER = "#e8d48a";

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
    navigator.geolocation?.getCurrentPosition(pos => setUserPos([pos.coords.latitude, pos.coords.longitude]), () => {});
  }, []);

  useEffect(() => {
    const local = searchPlaces(query);
    setSugg(local);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const results = await searchPlaceCandidates(query.trim());
      if (!active) return;
      setSugg(results);
      setSearching(false);
    }, 300);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  async function handleMapClick(lat: number, lng: number) {
    setPickPin({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    setQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setSugg([]);
    setLoading(true);
    try { const a = await reverseGeocode(lat, lng); setPickPin({ lat, lng, address: a }); setQuery(a); } catch { /* ok */ }
    setLoading(false);
  }

  function PawIcon({ size, color }: { size: number; color: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
        <rect x="1" y="1" width="42" height="42" rx="13" fill={color}/>
        <ellipse cx="22" cy="27" rx="8" ry="6.5" fill="rgba(255,255,255,0.85)"/>
        <ellipse cx="11" cy="21" rx="4" ry="3.5" fill="rgba(255,255,255,0.85)"/>
        <ellipse cx="33" cy="21" rx="4" ry="3.5" fill="rgba(255,255,255,0.85)"/>
        <ellipse cx="15.5" cy="15" rx="3.5" ry="3" fill="rgba(255,255,255,0.85)"/>
        <ellipse cx="28.5" cy="15" rx="3.5" ry="3" fill="rgba(255,255,255,0.85)"/>
      </svg>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col" style={{ zIndex: 100, background: "#fffaed" }}>
      <div className="flex items-center gap-3 px-3 flex-none"
        style={{ background: CARD, boxShadow: "0 2px 10px rgba(0,0,0,0.10)", paddingTop: "max(56px, env(safe-area-inset-top, 56px))", paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full active:opacity-60"
          style={{ background: "#b25e0918", border: "1px solid #b25e0928" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#b25e09" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="shrink-0 w-3 h-3 rounded-full" style={{ background: themeColor }}/>
        <span style={{ ...jua, fontSize: 13, color: "#a07030", minWidth: 32 }}>{label}</span>
        <input ref={inputRef} type="text" value={query} onChange={e => { setQuery(e.target.value); setPickPin(null); }}
          placeholder={`${label}를 검색하거나 지도를 누르세요`}
          className="flex-1 min-w-0 outline-none bg-transparent"
          style={{ ...jua, fontSize: 16, color: "#3a2a10" }}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}/>
        {searching && <div className="shrink-0 w-4 h-4 rounded-full border-2 border-[#b25e09]/30 border-t-[#b25e09] animate-spin"/>}
        {query && (
          <button onMouseDown={e => { e.preventDefault(); setQuery(""); setPickPin(null); setSugg([]); }}
            className="shrink-0 w-6 h-6 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#b0976a" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0">
          <InteractiveMap onMapClick={handleMapClick}
            markers={pickPin ? [{ lat: pickPin.lat, lng: pickPin.lng, type: "pick" }] : []}
            centerTo={pickPin ? [pickPin.lat, pickPin.lng] : userPos} zoom={17}/>
        </div>
        {loading && (
          <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full pointer-events-none" style={{ background: "rgba(178,94,9,0.88)", zIndex: 50 }}>
            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin"/>
            <span style={{ ...jua, fontSize: 11, color: "white" }}>주소 확인 중...</span>
          </div>
        )}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div key="sugg" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
              className="absolute top-0 left-0 right-0 overflow-y-auto"
              style={{ maxHeight: 300, zIndex: 60, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, background: CARD, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", border: `1px solid ${BORDER}` }}>
              {suggestions.map((p, i) => (
                <button key={i} onMouseDown={e => { e.preventDefault(); onConfirm(p); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-yellow-100 transition-colors"
                  style={{ borderBottom: i < suggestions.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div className="shrink-0"><PawIcon size={30} color={themeColor}/></div>
                  <div className="flex-1 min-w-0">
                    <p style={{ ...jua, fontSize: 15, color: "#3a2a10", margin: 0 }}>{p.name}</p>
                    <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#a07030", margin: 0, marginTop: 1 }} className="truncate">{p.address}</p>
                  </div>
                  <span style={{ color: "#c0976a", fontSize: 18 }}>›</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!pickPin && suggestions.length === 0 && (
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none" style={{ zIndex: 40 }}>
            <button className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full active:opacity-70"
              style={{ background: "#2979ff", boxShadow: "0 3px 14px rgba(41,121,255,0.35)", border: "none" }}
              onClick={() => { navigator.geolocation?.getCurrentPosition(pos => handleMapClick(pos.coords.latitude, pos.coords.longitude), () => {}); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3.5" fill="white"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="7" stroke="white" strokeWidth="2" fill="none"/>
              </svg>
              <p style={{ ...jua, fontSize: 13, color: "white", margin: 0 }}>현재위치로 설정</p>
            </button>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full"
              style={{ background: "rgba(255,243,197,0.96)", boxShadow: "0 3px 12px rgba(0,0,0,0.14)", border: `1px solid ${BORDER}` }}>
              <PawIcon size={18} color={themeColor}/>
              <p style={{ ...jua, fontSize: 13, color: "#7a5020", margin: 0 }}>지도를 눌러 위치를 선택하세요</p>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {pickPin && (
          <motion.div key="confirm" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="flex-none px-4 pt-4 pb-5" style={{ background: CARD, borderTop: `1.5px solid ${BORDER}`, boxShadow: "0 -4px 18px rgba(0,0,0,0.10)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0">
                <svg width="42" height="42" viewBox="0 0 44 44" fill="none">
                  <rect x="1" y="1" width="42" height="42" rx="13" fill={themeColor}/>
                  <ellipse cx="22" cy="27" rx="8" ry="6.5" fill="rgba(255,255,255,0.85)"/>
                  <ellipse cx="11" cy="21" rx="4" ry="3.5" fill="rgba(255,255,255,0.85)"/>
                  <ellipse cx="33" cy="21" rx="4" ry="3.5" fill="rgba(255,255,255,0.85)"/>
                  <ellipse cx="15.5" cy="15" rx="3.5" ry="3" fill="rgba(255,255,255,0.85)"/>
                  <ellipse cx="28.5" cy="15" rx="3.5" ry="3" fill="rgba(255,255,255,0.85)"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ ...jua, fontSize: 12, color: "#a07030", margin: 0 }}>{label} 선택됨</p>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#3a2a10", margin: 0, marginTop: 2, lineHeight: 1.4 }}>{pickPin.address}</p>
              </div>
            </div>
            <button onClick={() => onConfirm({ name: pickPin.address, address: pickPin.address, lat: pickPin.lat, lng: pickPin.lng })}
              className="w-full py-3.5 rounded-[14px] flex items-center justify-center gap-2 transition-opacity active:opacity-75"
              style={{ background: themeColor }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ ...jua, fontSize: 15, color: "white" }}>{label}로 설정</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RouteResultsSheet
// ─────────────────────────────────────────────────────────────────────────────
interface RouteResultsProps { origin: Place; dest: Place; onSelectRoute: (route: SafeRoute) => void; onBack: () => void; }

export function RouteResultsSheet({ origin, dest, onSelectRoute, onBack }: RouteResultsProps) {
  const routes = generateRoutes(origin, dest);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  // OSRM 실제 도보 경로 (경로 A용)
  const [osrmCoords, setOsrmCoords]   = useState<[number, number][] | null>(null);

  useEffect(() => {
    fetchWalkingRoute(origin, dest).then(coords => { if (coords) setOsrmCoords(coords); });
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  function scoreColor(s: number) {
    return s >= 90 ? "#2e7d32" : s >= 75 ? "#b25e09" : "#6b7280";
  }

  const routeMarkers: MapMarker[] = [
    { lat: origin.lat, lng: origin.lng, type: "origin" },
    { lat: dest.lat,   lng: dest.lng,   type: "dest" },
  ];

  const activeId = confirmedId ?? hoveredId;
  const activeRoute = routes.find(r => r.id === activeId) ?? routes[0];
  const multiRoutes = useMemo<MultiRouteCoord[]>(() => {
    if (confirmedId) {
      const r = routes.find(x => x.id === confirmedId);
      if (!r) return [];
      const coordsForConfirmed = confirmedId === "A" && osrmCoords
        ? osrmCoords
        : generateRouteCoords(origin, dest, routes.findIndex(x => x.id === confirmedId));
      return [{ coords: coordsForConfirmed, color: r.color, weight: 10, opacity: 1 }];
    }
    return routes.map((r, i) => ({
      coords: i === 0 && osrmCoords ? osrmCoords : generateRouteCoords(origin, dest, i),
      color: r.color,
      weight: activeId === r.id ? 10 : 5,
      opacity: activeId === r.id ? 1 : 0.5,
    }));
  }, [confirmedId, activeId, osrmCoords, origin.lat, origin.lng, dest.lat, dest.lng]);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ zIndex: 100 }}>
      <div className="relative flex-none" style={{ height: "38%" }}>
        <InteractiveMap markers={routeMarkers} multiRoutes={multiRoutes} disableClick
          policeBoxes={POLICE_BOXES} showPoliceBoxes={true}
          lampCount={activeRoute?.lampCount} />
        <button onClick={onBack}
          className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full shadow-md active:opacity-70"
          style={{ background: "white", zIndex: 20 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {osrmCoords && (
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full shadow" style={{ background: "#2e7d32", zIndex: 20 }}>
            <p style={{ ...jua, fontSize: 11, color: "white", margin: 0 }}>🗺 실제 도보경로</p>
          </div>
        )}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none" style={{ zIndex: 20 }}>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full shadow" style={{ background: "white" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: "#4a9e5c" }}/>
            <p style={{ ...jua, fontSize: 12, color: "#333", margin: 0 }} className="max-w-[80px] truncate">{origin.name}</p>
          </div>
          <span style={{ color: "#999", lineHeight: "26px" }}>→</span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full shadow" style={{ background: "white" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: "#d94040" }}/>
            <p style={{ ...jua, fontSize: 12, color: "#333", margin: 0 }} className="max-w-[80px] truncate">{dest.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto"
        style={{ background: "#f5f5f5", borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: "0 -4px 20px rgba(0,0,0,0.12)", marginTop: -20 }}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300"/></div>
        <div className="px-4 pt-1 pb-2 flex items-center justify-between">
          <div>
            <p style={{ ...jua, fontSize: 16, color: "#b25e09", margin: 0 }}>AI 추천 안전경로</p>
            <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#888", margin: 0, marginTop: 1 }}>
              {confirmedId ? "경로가 선택됐습니다" : "경로를 눌러 선택하세요"}
            </p>
          </div>
          {confirmedId && (
            <button onClick={() => setConfirmedId(null)} className="px-3 py-1 rounded-full text-xs active:opacity-70"
              style={{ ...jua, background: "#eee", color: "#666", fontSize: 12 }}>다시 선택</button>
          )}
        </div>
        <div className="px-4 pb-6 flex flex-col gap-3">
          {routes.map((r, i) => {
            const isActive = activeId === r.id;
            const isConfirmed = confirmedId === r.id;
            const isHidden = confirmedId !== null && confirmedId !== r.id;
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: isHidden ? 0 : 1, y: 0, scale: isHidden ? 0.94 : 1 }}
                transition={{ delay: confirmedId ? 0 : i * 0.08, duration: 0.25 }}
                style={{ pointerEvents: isHidden ? "none" : "auto" }}>
                <div onClick={() => { setConfirmedId(r.id); setHoveredId(r.id); }}
                  onMouseEnter={() => !confirmedId && setHoveredId(r.id)}
                  onMouseLeave={() => !confirmedId && setHoveredId(null)}
                  className="w-full text-left rounded-[18px] overflow-hidden shadow-md transition-all duration-200 cursor-pointer"
                  style={{ background: "white", outline: isConfirmed ? `3px solid ${r.color}` : isActive ? `2px solid ${r.color}80` : "2px solid transparent", opacity: confirmedId && !isConfirmed ? 0 : 1 }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: isConfirmed ? r.color : r.color + "18" }}>
                    <div className="flex items-center gap-2">
                      <p style={{ ...jua, fontSize: 14, color: isConfirmed ? "white" : r.color, margin: 0 }}>{r.label}</p>
                      {i === 0 && osrmCoords && <span style={{ ...jua, fontSize: 10, background: "rgba(255,255,255,0.25)", color: isConfirmed ? "white" : r.color, padding: "1px 6px", borderRadius: 99 }}>실제경로</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {isConfirmed && <span style={{ ...jua, fontSize: 12, color: "rgba(255,255,255,0.9)" }}>✓ 선택됨</span>}
                      <div className="px-2 py-0.5 rounded-full" style={{ background: isConfirmed ? "rgba(255,255,255,0.25)" : scoreColor(r.safetyScore) }}>
                        <p style={{ ...jua, fontSize: 11, color: "white", margin: 0 }}>안전 {r.safetyScore}점</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#555", margin: 0, marginBottom: 8 }}>{r.tagline}</p>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#888" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#888" strokeWidth="2" strokeLinecap="round"/></svg>
                        <p style={{ ...jua, fontSize: 14, color: "#333", margin: 0 }}>{r.duration}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M13 6l6 6-6 6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <p style={{ ...jua, fontSize: 14, color: "#333", margin: 0 }}>{r.distance}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.safetyTags.map(tag => (
                        <span key={tag} className="px-2.5 py-0.5 rounded-full" style={{ ...jua, fontSize: 11, background: r.color + "15", color: r.color }}>{tag}</span>
                      ))}
                    </div>
                    {isConfirmed && (
                      <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        onClick={() => onSelectRoute(r)}
                        className="mt-3 w-full py-3 rounded-[12px] flex items-center justify-center gap-2 active:opacity-80"
                        style={{ background: r.color }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="white"/></svg>
                        <span style={{ ...jua, fontSize: 15, color: "white" }}>이 경로로 안내 시작</span>
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavigationView
// ─────────────────────────────────────────────────────────────────────────────
type NavEmergencyState = null | "countdown" | "submitted" | "sos-ringing";

class NavSosAlarm {
  private ctx: AudioContext | null = null;
  private oscs: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private _running = false;
  get running() { return this._running; }
  async start() {
    if (this._running) return;
    this._running = true;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state !== "running") await this.ctx.resume();
    try { this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch { /* ok */ }
    this.masterGain = this.ctx.createGain(); this.masterGain.gain.value = 1.0; this.masterGain.connect(this.ctx.destination);
    this.lfo = this.ctx.createOscillator(); this.lfo.type = "sine"; this.lfo.frequency.value = 1.2;
    this.lfoGain = this.ctx.createGain(); this.lfoGain.gain.value = 300; this.lfo.connect(this.lfoGain);
    [{ f: 900, v: 0.6 }, { f: 1350, v: 0.35 }].forEach(({ f, v }) => {
      const osc = this.ctx!.createOscillator(); osc.type = "square"; osc.frequency.value = f;
      this.lfoGain!.connect(osc.frequency);
      const g = this.ctx!.createGain(); g.gain.value = v; osc.connect(g); g.connect(this.masterGain!);
      osc.start(); this.oscs.push(osc);
    });
    this.lfo.start();
  }
  stop() {
    if (!this._running) return; this._running = false;
    [...this.oscs, this.lfo].forEach(n => { try { n?.stop(); } catch { /* ok */ } });
    this.ctx?.close(); this.micStream?.getTracks().forEach(t => t.stop());
    this.ctx = null; this.oscs = []; this.lfo = null; this.lfoGain = null; this.masterGain = null; this.micStream = null;
  }
}
const navSosAlarm = new NavSosAlarm();

interface NavigationViewProps {
  route: SafeRoute;
  origin: Place;
  dest: Place;
  onEnd: () => void;
  onEmergency?: () => void;
  onNavigate?: (s: string) => void;
}

export function NavigationView({ route, origin, dest, onEnd, onEmergency: _onEmergency, onNavigate }: NavigationViewProps) {
  const [stepIdx, setStepIdx]           = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [started, setStarted]           = useState(false);
  const [monitoringReqSent, setMonReq]  = useState(false);
  const [emergencyState, setEmergency]  = useState<NavEmergencyState>(null);
  const [emergencyCountdown, setECount] = useState(5);
  const emergencyTimerRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // GPS
  const [userGpsPos, setUserGpsPos] = useState<[number, number] | null>(null);
  const [followGps, setFollowGps]   = useState(false);
  const [gpsError, setGpsError]     = useState(false);
  const watchIdRef                  = useRef<number | null>(null);

  // OSRM 실제 도보 경로
  const [osrmCoords, setOsrmCoords] = useState<[number, number][] | null>(null);
  const [osrmLoading, setOsrmLoading] = useState(true);

  // 날씨
  const weather = useWeather(
    userGpsPos ? userGpsPos[0] : (origin.lat + dest.lat) / 2,
    userGpsPos ? userGpsPos[1] : (origin.lng + dest.lng) / 2,
  );
  const [weatherDismissed, setWeatherDismissed] = useState(false);

  // 오버레이 토글
  const [overlayVisible, setOverlayVisible] = useState<Record<string, boolean>>({
    policeBox: true, cctv: true, trafficLight: true, safetyBell: true, restroom: false,
  });
  const [showOverlayPanel, setShowOverlayPanel] = useState(false);

  // OSRM 경로 fetch
  useEffect(() => {
    setOsrmLoading(true);
    fetchWalkingRoute(origin, dest).then(coords => {
      setOsrmCoords(coords);
      setOsrmLoading(false);
    });
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  const routeIdx = route.id === "A" ? 0 : route.id === "B" ? 1 : 2;
  const fallbackCoords = useMemo(() => generateRouteCoords(origin, dest, routeIdx), [origin.lat, origin.lng, dest.lat, dest.lng, routeIdx]);
  const navRouteCoords: [number, number][] = osrmCoords ?? fallbackCoords;

  // 안전 오버레이 생성 (경로 좌표 기반)
  const safetyOverlays = useMemo(() => generateSafetyOverlays(navRouteCoords), [navRouteCoords]);
  const visibleOverlayTypes = useMemo(() => {
    const s = new Set<string>();
    Object.entries(overlayVisible).forEach(([k, v]) => { if (v) s.add(k); });
    return s;
  }, [overlayVisible]);

  useEffect(() => {
    if (!started) return;
    if (!navigator.geolocation) return;
    setFollowGps(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => { setUserGpsPos([pos.coords.latitude, pos.coords.longitude]); setGpsError(false); },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [started]);

  function toggleFollowGps() {
    if (!userGpsPos) {
      navigator.geolocation?.getCurrentPosition(
        pos => { setUserGpsPos([pos.coords.latitude, pos.coords.longitude]); setFollowGps(true); setGpsError(false); },
        () => setGpsError(true)
      );
    } else { setFollowGps(f => !f); }
  }

  function openEmergency() {
    setECount(5); setEmergency("countdown");
    let n = 5;
    emergencyTimerRef.current = setInterval(() => {
      n -= 1; setECount(n);
      if (n <= 0) { clearInterval(emergencyTimerRef.current!); setEmergency("submitted"); }
    }, 1000);
  }
  function cancelEmergency() { if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current); navSosAlarm.stop(); setEmergency(null); setECount(5); }
  function immediateReport() { if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current); setEmergency("submitted"); }
  function activateSosBell() { navSosAlarm.start(); setEmergency("sos-ringing"); }

  useEffect(() => () => { if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current); navSosAlarm.stop(); }, []);

  const totalMin = parseInt(route.duration.replace(/[^0-9]/g, "")) || 15;

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setElapsed(s => s + 1), 60_000);
    return () => clearInterval(t);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setStepIdx(s => Math.min(route.steps.length - 1, s + 1)), 30_000);
    return () => clearInterval(t);
  }, [started, route.steps.length]);

  const remaining   = Math.max(0, totalMin - elapsed);
  const currentStep = route.steps[stepIdx] ?? route.steps[route.steps.length - 1];
  const nextStep    = route.steps[stepIdx + 1] ?? null;
  const progress    = stepIdx / Math.max(1, route.steps.length - 1);
  const isDone      = stepIdx === route.steps.length - 1 && started;

  const routeMarkers: MapMarker[] = [
    { lat: origin.lat, lng: origin.lng, type: "origin" },
    { lat: dest.lat,   lng: dest.lng,   type: "dest" },
  ];

  const snappedCoord: [number, number] | null = useMemo(() => {
    if (!userGpsPos) return null;
    let best = 0; let bestDist = Infinity;
    navRouteCoords.forEach(([lat, lng], i) => {
      const d = (lat - userGpsPos[0]) ** 2 + (lng - userGpsPos[1]) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return navRouteCoords[best];
  }, [userGpsPos, navRouteCoords]);

  const progressCoord: [number, number] = snappedCoord
    ?? navRouteCoords[Math.min(Math.floor(progress * (navRouteCoords.length - 1)), navRouteCoords.length - 1)];

  const dirArrows = ["↑","↗","→","↘","↙","←","↖","↑"];

  // 날씨 아이콘/레이블
  const wInfo = weather ? weatherCodeToInfo(weather.code, weather.wind, weather.rain) : null;
  const hasWeatherAlert = weather && weather.alerts.length > 0 && !weatherDismissed;

  const overlayKeys = Object.keys(OVERLAY_CONFIG) as OverlayKey[];

  return (
    <div className="absolute inset-0 flex flex-col" style={{ zIndex: 100 }}>

      {/* ═══ 상단 안내 바 ═══ */}
      <div className="flex-none"
        style={{ paddingTop: "max(env(safe-area-inset-top), 50px)", background: "transparent", position: "relative", zIndex: 10 }}>
        <div className="mx-3 mt-3 rounded-[20px] overflow-hidden shadow-2xl" style={{ background: "#fff9c4" }}>
          <div className="flex items-center gap-3 px-3 py-3">
            <button onClick={onEnd} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:opacity-60"
              style={{ background: "rgba(0,0,0,0.08)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#5a3e00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {started && (
              <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.07)" }}>
                <span style={{ fontSize: 22, lineHeight: 1, color: "#5a3e00" }}>{dirArrows[stepIdx % 8]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {started ? (
                <>
                  <p style={{ ...jua, fontSize: 16, color: "#3a2800", margin: 0, lineHeight: 1.25 }}>{currentStep}</p>
                  {nextStep && !isDone && <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#7a6030", margin: 0, marginTop: 2 }}>다음 ▸ {nextStep}</p>}
                  {isDone && <p style={{ ...jua, fontSize: 14, color: "#b25e09", margin: 0 }}>🎉 목적지에 도착했습니다!</p>}
                </>
              ) : (
                <>
                  <p style={{ ...jua, fontSize: 14, color: "#3a2800", margin: 0 }}>{route.label}</p>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#7a6030", margin: 0 }}>
                    {origin.name} → {dest.name}
                    {osrmLoading && <span style={{ color: "#b25e09" }}> · 경로 불러오는 중...</span>}
                    {!osrmLoading && osrmCoords && <span style={{ color: "#2e7d32" }}> · 실제 도보경로</span>}
                  </p>
                </>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {started && <p style={{ ...jua, fontSize: 22, color: "#3a2800", margin: 0, lineHeight: 1 }}>{remaining}분</p>}
              {started && <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#7a6030", margin: 0 }}>남은시간</p>}
              {wInfo && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: weather && weather.alerts.length > 0 ? "#fff3cd" : "#f5f5f5" }}>
                  <span style={{ fontSize: 12 }}>{wInfo.icon}</span>
                  <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#555" }}>{weather?.temp.toFixed(0)}°</span>
                </div>
              )}
            </div>
          </div>
          {started && (
            <div className="h-[3px]" style={{ background: "rgba(0,0,0,0.1)" }}>
              <div className="h-full transition-all duration-700" style={{ width: `${progress * 100}%`, background: route.color }}/>
            </div>
          )}
        </div>

        {/* 날씨 위험 알림 배너 */}
        <AnimatePresence>
          {hasWeatherAlert && (
            <motion.div key="weather-alert"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mx-3 mt-2 rounded-[14px] overflow-hidden shadow-lg">
              {weather!.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2"
                  style={{ background: alert.level === "danger" ? "#ffebee" : alert.level === "warning" ? "#fff8e1" : "#e8f5e9", borderBottom: i < weather!.alerts.length - 1 ? "1px solid rgba(0,0,0,0.07)" : "none" }}>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: alert.level === "danger" ? "#c62828" : alert.level === "warning" ? "#f57f17" : "#2e7d32", margin: 0, flex: 1, lineHeight: 1.4 }}>{alert.text}</p>
                  {i === 0 && (
                    <button onClick={() => setWeatherDismissed(true)} className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full active:opacity-60"
                      style={{ background: "rgba(0,0,0,0.1)", marginTop: 1 }}>
                      <span style={{ fontSize: 10, color: "#555", lineHeight: 1 }}>✕</span>
                    </button>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ 지도 ═══ */}
      <div className="flex-1 relative min-h-0">
        <InteractiveMap
          markers={routeMarkers}
          routeCoords={navRouteCoords}
          centerTo={followGps ? undefined : progressCoord}
          zoom={17}
          disableClick
          userGpsPos={userGpsPos}
          followGps={followGps}
          routeBounds={started ? navRouteCoords : undefined}
          policeBoxes={POLICE_BOXES}
          showPoliceBoxes={overlayVisible.policeBox}
          safetyOverlays={safetyOverlays}
          visibleOverlayTypes={visibleOverlayTypes}
          lampCount={route.lampCount}
        />

        {/* GPS 버튼 */}
        <button onClick={toggleFollowGps}
          className="absolute right-3 rounded-[14px] flex flex-col items-center justify-center gap-1 active:opacity-70 transition-all"
          style={{ bottom: 16, width: 46, height: 52, background: followGps ? "#2979ff" : "white", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", border: followGps ? "none" : "1.5px solid #e0e0e0", zIndex: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3.5" fill={followGps ? "white" : "#2979ff"}/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={followGps ? "white" : "#2979ff"} strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="7" stroke={followGps ? "white" : "#2979ff"} strokeWidth="2" fill="none"/>
          </svg>
          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: followGps ? "white" : "#2979ff", lineHeight: 1 }}>
            {gpsError ? "오류" : followGps ? "추적중" : "GPS"}
          </span>
        </button>

        {/* 오버레이 토글 버튼 */}
        <button onClick={() => setShowOverlayPanel(v => !v)}
          className="absolute left-3 rounded-[14px] flex flex-col items-center justify-center gap-1 active:opacity-70 transition-all"
          style={{ bottom: 16, width: 46, height: 52, background: showOverlayPanel ? "#ff8f00" : "white", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", border: showOverlayPanel ? "none" : "1.5px solid #e0e0e0", zIndex: 10 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>🗺</span>
          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: showOverlayPanel ? "white" : "#555", lineHeight: 1 }}>레이어</span>
        </button>

        {/* 오버레이 패널 */}
        <AnimatePresence>
          {showOverlayPanel && (
            <motion.div key="overlay-panel"
              initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="absolute left-3 rounded-[16px] overflow-hidden shadow-xl"
              style={{ bottom: 76, background: "white", zIndex: 10, minWidth: 170 }}>
              <div className="px-3 py-2" style={{ background: "#ff8f00" }}>
                <p style={{ ...jua, fontSize: 12, color: "white", margin: 0 }}>지도 레이어 설정</p>
              </div>
              {overlayKeys.map(key => {
                const cfg = OVERLAY_CONFIG[key];
                const isOn = overlayVisible[key];
                return (
                  <button key={key} onClick={() => setOverlayVisible(v => ({ ...v, [key]: !v[key] }))}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 active:bg-gray-50 transition-colors"
                    style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0"
                      style={{ background: isOn ? cfg.bg : "#f5f5f5" }}>
                      {cfg.emoji}
                    </div>
                    <p style={{ ...jua, fontSize: 13, color: isOn ? cfg.color : "#aaa", margin: 0, flex: 1, textAlign: "left" }}>{cfg.label}</p>
                    <div className="w-8 h-4 rounded-full relative transition-colors shrink-0" style={{ background: isOn ? cfg.color : "#ddd" }}>
                      <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all" style={{ left: isOn ? "calc(100% - 14px)" : 2 }}/>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 실제 경로 배지 */}
        {!osrmLoading && osrmCoords && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 10 }}>
            <div className="px-3 py-1 rounded-full shadow" style={{ background: "#2e7d32" }}>
              <p style={{ ...jua, fontSize: 11, color: "white", margin: 0 }}>🗺 OSRM 실제 도보경로</p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 하단 패널 ═══ */}
      <div className="flex-none" style={{ background: "white", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}>

        {/* 안내 전: 경로 요약 + 안내 시작 */}
        {!started && (
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3 mb-3 p-3 rounded-[14px]"
              style={{ background: route.color + "12", border: `1px solid ${route.color}28` }}>
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: route.color }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ ...jua, fontSize: 13, color: route.color, margin: 0 }}>{route.label}</p>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#666", margin: 0 }}>{route.tagline}</p>
              </div>
              <div className="shrink-0 px-2 py-0.5 rounded-full" style={{ background: route.color }}>
                <p style={{ ...jua, fontSize: 11, color: "white", margin: 0 }}>안전 {route.safetyScore}점</p>
              </div>
            </div>
            {/* 오버레이 요약 */}
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {overlayKeys.map(key => {
                const cfg = OVERLAY_CONFIG[key];
                const count = key === "policeBox"
                  ? POLICE_BOXES.filter(pb => {
                    const dlat = Math.abs(pb.lat - (origin.lat + dest.lat) / 2);
                    const dlng = Math.abs(pb.lng - (origin.lng + dest.lng) / 2);
                    return dlat + dlng < 0.05;
                  }).length
                  : safetyOverlays.filter(ov => {
                    const typeMap: Record<SafetyOverlayType, string> = { cctv: "cctv", "traffic-light": "trafficLight", "safety-bell": "safetyBell", restroom: "restroom" };
                    return key !== "policeBox" && typeMap[ov.type] === key;
                  }).length;
                return (
                  <div key={key} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                    <span style={{ fontSize: 11 }}>{cfg.emoji}</span>
                    <span style={{ ...jua, fontSize: 10, color: cfg.color }}>{count}</span>
                  </div>
                );
              })}
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#aaa" }}>경로 내 안전시설</span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={route.color} strokeWidth="2"/><path d="M12 7v5l3 3" stroke={route.color} strokeWidth="2" strokeLinecap="round"/></svg>
                <p style={{ ...jua, fontSize: 13, color: "#222", margin: 0 }}>{route.duration}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M13 6l6 6-6 6" stroke={route.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p style={{ ...jua, fontSize: 13, color: "#222", margin: 0 }}>{route.distance}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {route.safetyTags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full" style={{ ...jua, fontSize: 10, background: route.color + "15", color: route.color }}>{tag}</span>
                ))}
              </div>
            </div>
            <button onClick={() => { setStarted(true); setWeatherDismissed(false); }}
              className="w-full py-3.5 rounded-[14px] flex items-center justify-center gap-2 active:opacity-80"
              style={{ background: route.color }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="white"/></svg>
              <span style={{ ...jua, fontSize: 16, color: "white" }}>안내 시작</span>
            </button>
          </div>
        )}

        {/* 안내 중: 단계 목록 */}
        {started && (
          <div className="px-4 pt-2.5 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#4a9e5c" }}/>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#555", margin: 0 }} className="truncate">{origin.name}</p>
              <div className="flex-1 h-px bg-gray-200"/>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#555", margin: 0 }} className="truncate">{dest.name}</p>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#d94040" }}/>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {route.steps.map((s, i) => (
                <button key={i} onClick={() => setStepIdx(i)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full transition-all"
                  style={{ ...jua, fontSize: 11, background: i === stepIdx ? route.color : i < stepIdx ? route.color + "25" : "#f0f0f0", color: i === stepIdx ? "white" : i < stepIdx ? route.color : "#888" }}>
                  {i < stepIdx && <span style={{ fontSize: 9 }}>✓</span>}
                  {i + 1}. {s.slice(0, 8)}{s.length > 8 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 하단 4개 버튼 바 */}
        <div className="grid grid-cols-4 gap-2 px-3 pb-5 pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button onClick={openEmergency} className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70" style={{ background: "#fff0f0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#e53935" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#e53935", margin: 0 }}>긴급신고</p>
          </button>
          <button onClick={() => onNavigate?.("보안화면")} className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70" style={{ background: "#f0f4ff" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#3949ab" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#3949ab", margin: 0 }}>보안화면</p>
          </button>
          <button onClick={() => onNavigate?.("커뮤니티")} className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70" style={{ background: "#fff8f0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#f47c20" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#f47c20", margin: 0 }}>커뮤니티</p>
          </button>
          <button onClick={() => { setMonReq(true); setTimeout(() => setMonReq(false), 3000); }}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70"
            style={{ background: monitoringReqSent ? "#e8f5e9" : "#f0faf0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: monitoringReqSent ? "#2e7d32" : "#43a047" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                {monitoringReqSent
                  ? <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  : <><circle cx="12" cy="8" r="4" stroke="white" strokeWidth="2"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/></>}
              </svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: monitoringReqSent ? "#2e7d32" : "#43a047", margin: 0 }}>
              {monitoringReqSent ? "신청완료!" : "모니터링"}
            </p>
          </button>
        </div>

        {(monitoringReqSent || started) && (
          <div className="px-3 pb-4 flex flex-col gap-2">
            {monitoringReqSent && (
              <div className="px-3 py-2 rounded-[10px] flex items-center gap-2" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#2e7d32", margin: 0 }}>보호자에게 모니터링 신청이 전송됐습니다</p>
              </div>
            )}
            {started && (
              <button onClick={onEnd} className="w-full py-2.5 rounded-[12px] flex items-center justify-center gap-2 active:opacity-70"
                style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#888" strokeWidth="2" strokeLinecap="round"/></svg>
                <span style={{ ...jua, fontSize: 13, color: "#888" }}>안내 종료</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ 긴급신고 오버레이 ═══ */}
      <AnimatePresence>
        {emergencyState && (
          <motion.div key="emer-popup" className="flex items-center justify-center px-6"
            style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.75)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>

            {emergencyState === "countdown" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <div className="text-center mb-3"><span style={jua} className="text-[80px] text-[#EA1E2F] leading-none">{emergencyCountdown}</span></div>
                <p style={jua} className="text-[#EA1E2F] text-[18px] text-center leading-normal mb-1">긴급 신고 버튼을 눌렀습니다.</p>
                <p style={jua} className="text-[#333] text-[14px] text-center leading-normal mb-6">취소하지 않으면 신고가 진행됩니다.</p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency} className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70" style={{ ...jua, background: "#2F2F32" }}>취소</button>
                  <button onClick={immediateReport} className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70" style={{ ...jua, background: "#EA1E2F" }}>즉시 신고</button>
                </div>
              </motion.div>
            )}

            {emergencyState === "submitted" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <p style={jua} className="text-[#EA1E2F] text-[20px] text-center leading-normal mb-3">접수되었습니다</p>
                <p style={jua} className="text-[#333] text-[13px] text-center leading-relaxed mb-6">
                  현재 위치와 개인정보에 입력하신 정보가<br/>가장 가까운 파출소로 전송되었습니다.
                </p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency} className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70" style={{ ...jua, background: "#2F2F32" }}>취소</button>
                  <button onClick={activateSosBell} className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70" style={{ ...jua, background: "#EA1E2F" }}>SOS벨</button>
                </div>
              </motion.div>
            )}

            {emergencyState === "sos-ringing" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <div className="flex justify-center mb-4">
                  <motion.div animate={{ rotate: [0, -18, 18, -12, 12, -6, 6, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.5 }}>
                    <svg width="56" height="60" viewBox="0 0 56 60" fill="none">
                      <path d="M28 6C28 6 10 13 10 32V44H46V32C46 13 28 6 28 6Z" fill="#EA1E2F"/>
                      <rect x="22" y="1" width="12" height="6" rx="3" fill="#EA1E2F"/>
                      <path d="M20 44C20 48.418 23.582 52 28 52C32.418 52 36 48.418 36 44" stroke="#EA1E2F" strokeWidth="3" fill="none" strokeLinecap="round"/>
                    </svg>
                  </motion.div>
                </div>
                <p style={jua} className="text-[#EA1E2F] text-[18px] text-center leading-normal mb-1">SOS 벨이 울리고 있습니다.</p>
                <p style={jua} className="text-[#555] text-[13px] text-center leading-normal mb-5">인근 시민에게 도움을 요청하십시오.</p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency} className="flex-1 py-3 rounded-[10px] text-white text-[15px] active:opacity-70" style={{ ...jua, background: "#6B6B6B" }}>재생 종료</button>
                  <button onClick={() => { navSosAlarm.stop(); navSosAlarm.start(); }} className="flex-1 py-3 rounded-[10px] text-white text-[15px] active:opacity-70" style={{ ...jua, background: "#EA1E2F" }}>SOS벨 연속 재생</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
