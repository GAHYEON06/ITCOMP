/**
 * ZIP_R0 AI Safe Navigation Engine v2
 *
 * W(e) = D(e) × (1 + α × R(e))
 * R(e) = min(1, w1·R_static + w2·R_dynamic + w3·R_community)
 *
 * v2 실제 데이터 소스:
 *  - 가로등/CCTV: OpenStreetMap Overpass API (실시간)
 *  - 범죄 위험도: OSM 토지이용 + 시간대 가중치
 *  - 커뮤니티 위험 신고: 백엔드 API (실시간)
 */

import safeBellGridRaw from "../../imports/safe_bell_grid.json";
import { getCommunityPins } from "./communityStore";

// ─── 실시간 환경 데이터 캐시 ──────────────────────────────────────────────────

interface EnvCache {
  lamps:    [number, number][];     // 가로등
  cctv:     [number, number][];     // CCTV
  landUse:  { lat: number; lng: number; type: string }[]; // OSM 토지이용
  apiDangers: { lat: number; lng: number; category: string; created_at: string }[];
  bbox:     [number, number, number, number] | null; // [minLat, minLng, maxLat, maxLng]
  fetchedAt: number;
}

let _envCache: EnvCache = {
  lamps: [], cctv: [], landUse: [], apiDangers: [], bbox: null, fetchedAt: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/** Overpass 단일 노드 쿼리 */
async function overpassNodes(
  tags: string, minLat: number, minLng: number, maxLat: number, maxLng: number,
  pad = 0.003, signal?: AbortSignal
): Promise<[number, number][]> {
  const bbox = `${minLat - pad},${minLng - pad},${maxLat + pad},${maxLng + pad}`;
  const q = `[out:json][timeout:8];node${tags}(${bbox});out body;`;
  try {
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal, headers: { "Accept": "application/json" } }
    );
    const data = await res.json();
    return (data.elements ?? []).map((e: { lat: number; lon: number }) => [e.lat, e.lon] as [number, number]);
  } catch { return []; }
}

/** Overpass 영역(way) 쿼리 — 토지이용 */
async function overpassLandUse(
  minLat: number, minLng: number, maxLat: number, maxLng: number,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; type: string }[]> {
  const bbox = `${minLat - 0.01},${minLng - 0.01},${maxLat + 0.01},${maxLng + 0.01}`;
  const q = `[out:json][timeout:8];
    way["landuse"~"^(industrial|commercial|retail|residential|recreation_ground|park)$"](${bbox});
    out center;`;
  try {
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal }
    );
    const data = await res.json();
    return (data.elements ?? [])
      .filter((e: { center?: { lat: number; lon: number }; tags?: { landuse: string } }) => e.center)
      .map((e: { center: { lat: number; lon: number }; tags: { landuse: string } }) => ({
        lat: e.center.lat, lng: e.center.lon, type: e.tags.landuse ?? "unknown",
      }));
  } catch { return []; }
}

/** 커뮤니티 API에서 위험 신고 가져오기 */
async function fetchApiDangers(signal?: AbortSignal) {
  const BASE = "https://undercoat-rundown-pantry.ngrok-free.dev";
  const token = localStorage.getItem("zipro_token");
  try {
    const res = await fetch(`${BASE}/community/posts?limit=200`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "ngrok-skip-browser-warning": "true",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts ?? [])
      .filter((p: { lat: number | null; lng: number | null; category: string; created_at: string }) =>
        p.lat != null && p.lng != null && ["공사", "어두움", "고장", "기타"].includes(p.category)
      )
      .map((p: { lat: number; lng: number; category: string; created_at: string }) => ({
        lat: p.lat, lng: p.lng, category: p.category, created_at: p.created_at,
      }));
  } catch { return []; }
}

/**
 * 경로 bbox를 받아 Overpass + 커뮤니티 API 데이터를 병렬 fetch해 캐시에 저장
 * NavigationFlow에서 경로 계산 전 한 번 호출
 */
export async function prefetchEnvData(
  minLat: number, minLng: number, maxLat: number, maxLng: number,
  signal?: AbortSignal
): Promise<void> {
  const now = Date.now();
  const sameBbox = _envCache.bbox &&
    Math.abs(_envCache.bbox[0] - minLat) < 0.005 &&
    Math.abs(_envCache.bbox[2] - maxLat) < 0.005;
  if (sameBbox && now - _envCache.fetchedAt < CACHE_TTL_MS) return; // 캐시 유효

  const [lamps, cctv, landUse, apiDangers] = await Promise.allSettled([
    overpassNodes(`["highway"="street_lamp"]`, minLat, minLng, maxLat, maxLng, 0.003, signal),
    overpassNodes(`["man_made"="surveillance"]`, minLat, minLng, maxLat, maxLng, 0.003, signal),
    overpassLandUse(minLat, minLng, maxLat, maxLng, signal),
    fetchApiDangers(signal),
  ]);

  _envCache = {
    lamps:      lamps.status === "fulfilled"      ? lamps.value      : [],
    cctv:       cctv.status === "fulfilled"       ? cctv.value       : [],
    landUse:    landUse.status === "fulfilled"    ? landUse.value    : [],
    apiDangers: apiDangers.status === "fulfilled" ? apiDangers.value : [],
    bbox: [minLat, minLng, maxLat, maxLng],
    fetchedAt: now,
  };
}

/** 현재 캐시된 환경 데이터 접근자 */
export function getEnvCache(): Readonly<EnvCache> { return _envCache; }

// 커뮤니티 신고 포함 여부 전역 플래그
let _includeCommunity = true;
export function setIncludeCommunity(v: boolean) { _includeCommunity = v; }
export function getIncludeCommunity() { return _includeCommunity; }

// ─── 실제 데이터 기반 보조 함수 ───────────────────────────────────────────

// ── 서울 파출소/지구대 실제 데이터 (이름·주소·전화 포함) ──
export interface PoliceStation { name: string; address: string; phone: string; lat: number; lng: number; }

export const NAMED_POLICE_STATIONS: PoliceStation[] = [
  // 종로구
  { name: "광화문파출소",    address: "서울 종로구 세종대로 209",        phone: "02-720-3112", lat: 37.5753, lng: 126.9769 },
  { name: "혜화파출소",      address: "서울 종로구 혜화로 130",          phone: "02-742-3112", lat: 37.5824, lng: 127.0018 },
  { name: "청운파출소",      address: "서울 종로구 자하문로 86",         phone: "02-720-3113", lat: 37.5826, lng: 126.9705 },
  { name: "종로파출소",      address: "서울 종로구 종로 199",            phone: "02-720-3114", lat: 37.5714, lng: 126.9892 },
  { name: "창신파출소",      address: "서울 종로구 창신길 5",            phone: "02-742-3113", lat: 37.5781, lng: 127.0100 },
  { name: "이화파출소",      address: "서울 종로구 이화장길 61",         phone: "02-764-3112", lat: 37.5784, lng: 127.0019 },
  // 중구
  { name: "명동파출소",      address: "서울 중구 명동길 30",             phone: "02-752-3112", lat: 37.5635, lng: 126.9851 },
  { name: "남대문파출소",    address: "서울 중구 퇴계로 10",             phone: "02-752-3113", lat: 37.5558, lng: 126.9726 },
  { name: "을지로파출소",    address: "서울 중구 을지로 281",            phone: "02-2266-3112",lat: 37.5664, lng: 126.9921 },
  { name: "황학파출소",      address: "서울 중구 황학로 3",              phone: "02-2267-3112",lat: 37.5705, lng: 127.0143 },
  { name: "충무로파출소",    address: "서울 중구 퇴계로 152",            phone: "02-2265-3112",lat: 37.5613, lng: 126.9948 },
  { name: "서울역파출소",    address: "서울 중구 통일로 1",              phone: "02-752-3115", lat: 37.5547, lng: 126.9707 },
  // 용산구
  { name: "이태원파출소",    address: "서울 용산구 이태원로 177",        phone: "02-793-3112", lat: 37.5344, lng: 126.9944 },
  { name: "한강로파출소",    address: "서울 용산구 한강대로 23길 55",    phone: "02-794-3112", lat: 37.5355, lng: 126.9690 },
  { name: "원효파출소",      address: "서울 용산구 원효로 97",           phone: "02-712-3112", lat: 37.5377, lng: 126.9617 },
  { name: "후암파출소",      address: "서울 용산구 후암로 59",           phone: "02-795-3112", lat: 37.5454, lng: 126.9779 },
  { name: "보광파출소",      address: "서울 용산구 보광로 49",           phone: "02-795-3113", lat: 37.5257, lng: 127.0034 },
  // 마포구
  { name: "합정파출소",      address: "서울 마포구 양화로 104",          phone: "02-322-3112", lat: 37.5498, lng: 126.9141 },
  { name: "서교파출소",      address: "서울 마포구 와우산로 162",        phone: "02-336-3112", lat: 37.5521, lng: 126.9226 },
  { name: "아현파출소",      address: "서울 마포구 마포대로 133",        phone: "02-711-3112", lat: 37.5585, lng: 126.9476 },
  { name: "상암파출소",      address: "서울 마포구 월드컵로 212",        phone: "02-374-3112", lat: 37.5663, lng: 126.9014 },
  { name: "도화파출소",      address: "서울 마포구 도화길 40",           phone: "02-718-3112", lat: 37.5430, lng: 126.9501 },
  // 서대문구
  { name: "신촌파출소",      address: "서울 서대문구 신촌로 83",         phone: "02-312-3112", lat: 37.5556, lng: 126.9363 },
  { name: "홍은파출소",      address: "서울 서대문구 홍은중앙로 21",     phone: "02-378-3112", lat: 37.5956, lng: 126.9374 },
  { name: "연희파출소",      address: "서울 서대문구 연세로 50",         phone: "02-337-3112", lat: 37.5643, lng: 126.9388 },
  { name: "남가좌파출소",    address: "서울 서대문구 가재울로 2",        phone: "02-302-3112", lat: 37.5742, lng: 126.9171 },
  // 강남구
  { name: "강남파출소",      address: "서울 강남구 강남대로 396",        phone: "02-549-3112", lat: 37.4979, lng: 127.0276 },
  { name: "역삼파출소",      address: "서울 강남구 역삼로 104",          phone: "02-552-3112", lat: 37.5010, lng: 127.0380 },
  { name: "대치파출소",      address: "서울 강남구 테헤란로 507",        phone: "02-553-3112", lat: 37.4959, lng: 127.0622 },
  { name: "도곡파출소",      address: "서울 강남구 논현로 428",          phone: "02-573-3112", lat: 37.4885, lng: 127.0422 },
  { name: "압구정파출소",    address: "서울 강남구 압구정로 162",        phone: "02-546-3112", lat: 37.5272, lng: 127.0321 },
  { name: "개포파출소",      address: "서울 강남구 개포로 617",          phone: "02-572-3112", lat: 37.4764, lng: 127.0538 },
  // 서초구
  { name: "방배파출소",      address: "서울 서초구 방배로 219",          phone: "02-587-3112", lat: 37.4848, lng: 126.9905 },
  { name: "서초파출소",      address: "서울 서초구 서초대로 188",        phone: "02-584-3112", lat: 37.4836, lng: 127.0078 },
  { name: "반포파출소",      address: "서울 서초구 신반포로 194",        phone: "02-535-3112", lat: 37.5046, lng: 127.0048 },
  { name: "양재파출소",      address: "서울 서초구 강남대로 359",        phone: "02-575-3112", lat: 37.4845, lng: 127.0336 },
  // 송파구
  { name: "잠실파출소",      address: "서울 송파구 올림픽로 240",        phone: "02-421-3112", lat: 37.5133, lng: 127.0998 },
  { name: "가락파출소",      address: "서울 송파구 가락로 23",           phone: "02-401-3112", lat: 37.4939, lng: 127.1228 },
  { name: "문정파출소",      address: "서울 송파구 문정로 65",           phone: "02-402-3112", lat: 37.4803, lng: 127.1212 },
  { name: "거여파출소",      address: "서울 송파구 거마로 69",           phone: "02-403-3112", lat: 37.4892, lng: 127.1469 },
  // 영등포구
  { name: "여의도파출소",    address: "서울 영등포구 여의공원로 68",     phone: "02-782-3112", lat: 37.5241, lng: 126.9246 },
  { name: "영등포파출소",    address: "서울 영등포구 영중로 5",          phone: "02-678-3112", lat: 37.5271, lng: 126.9021 },
  { name: "신길파출소",      address: "서울 영등포구 신길로 113",        phone: "02-848-3112", lat: 37.5113, lng: 126.9232 },
  // 관악구
  { name: "신림파출소",      address: "서울 관악구 남부순환로 1666",     phone: "02-872-3112", lat: 37.4842, lng: 126.9293 },
  { name: "봉천파출소",      address: "서울 관악구 봉천로 200",          phone: "02-877-3112", lat: 37.4777, lng: 126.9519 },
  { name: "서울대파출소",    address: "서울 관악구 관악로 1",            phone: "02-885-3112", lat: 37.4603, lng: 126.9519 },
  // 성동구
  { name: "왕십리파출소",    address: "서울 성동구 왕십리로 222",        phone: "02-2299-3112",lat: 37.5573, lng: 127.0441 },
  { name: "성수파출소",      address: "서울 성동구 뚝섬로 273",          phone: "02-462-3112", lat: 37.5447, lng: 127.0374 },
  { name: "금호파출소",      address: "서울 성동구 금호로 55",           phone: "02-2295-3112",lat: 37.5551, lng: 127.0222 },
  // 광진구
  { name: "건대파출소",      address: "서울 광진구 능동로 120",          phone: "02-453-3112", lat: 37.5404, lng: 127.0708 },
  { name: "자양파출소",      address: "서울 광진구 자양로 82",           phone: "02-455-3112", lat: 37.5348, lng: 127.0812 },
  { name: "중곡파출소",      address: "서울 광진구 중곡동 100",          phone: "02-453-3113", lat: 37.5619, lng: 127.0819 },
  // 노원구
  { name: "노원파출소",      address: "서울 노원구 노해로 480",          phone: "02-934-3112", lat: 37.6561, lng: 127.0561 },
  { name: "상계파출소",      address: "서울 노원구 동일로 1499",         phone: "02-936-3112", lat: 37.6627, lng: 127.0654 },
  { name: "중계파출소",      address: "서울 노원구 중계로 233",          phone: "02-937-3112", lat: 37.6403, lng: 127.0737 },
  // 강북구
  { name: "미아파출소",      address: "서울 강북구 오현로 49",           phone: "02-983-3112", lat: 37.6397, lng: 127.0254 },
  { name: "수유파출소",      address: "서울 강북구 수유로 5",            phone: "02-986-3112", lat: 37.6485, lng: 127.0141 },
  // 도봉구
  { name: "도봉파출소",      address: "서울 도봉구 도봉로 552",          phone: "02-954-3112", lat: 37.6694, lng: 127.0470 },
  { name: "창동파출소",      address: "서울 도봉구 시루봉로 103",        phone: "02-956-3112", lat: 37.6528, lng: 127.0453 },
  // 동대문구
  { name: "청량리파출소",    address: "서울 동대문구 왕산로 222",        phone: "02-966-3112", lat: 37.5824, lng: 127.0478 },
  { name: "회기파출소",      address: "서울 동대문구 경희대로 26",       phone: "02-968-3112", lat: 37.5974, lng: 127.0514 },
  { name: "전농파출소",      address: "서울 동대문구 천호대로 346",      phone: "02-2217-3112",lat: 37.5729, lng: 127.0565 },
  // 중랑구
  { name: "면목파출소",      address: "서울 중랑구 면목로 32",           phone: "02-2205-3112",lat: 37.5850, lng: 127.0830 },
  { name: "망우파출소",      address: "서울 중랑구 망우로 327",          phone: "02-437-3112", lat: 37.6021, lng: 127.0967 },
  // 성북구
  { name: "길음파출소",      address: "서울 성북구 도봉로 341",          phone: "02-989-3112", lat: 37.6007, lng: 127.0198 },
  { name: "돈암파출소",      address: "서울 성북구 보문로 227",          phone: "02-927-3112", lat: 37.5924, lng: 127.0161 },
  { name: "정릉파출소",      address: "서울 성북구 정릉로 232",          phone: "02-913-3112", lat: 37.6111, lng: 126.9972 },
  // 은평구
  { name: "불광파출소",      address: "서울 은평구 불광로 200",          phone: "02-383-3112", lat: 37.6133, lng: 126.9289 },
  { name: "연신내파출소",    address: "서울 은평구 통일로 857",          phone: "02-385-3112", lat: 37.6192, lng: 126.9218 },
  { name: "녹번파출소",      address: "서울 은평구 은평로 57",           phone: "02-385-3113", lat: 37.6029, lng: 126.9269 },
  // 강서구
  { name: "화곡파출소",      address: "서울 강서구 화곡로 302",          phone: "02-2604-3112",lat: 37.5509, lng: 126.8495 },
  { name: "개화파출소",      address: "서울 강서구 개화동로 200",        phone: "02-2662-3112",lat: 37.5742, lng: 126.8076 },
  { name: "방화파출소",      address: "서울 강서구 방화대로 200",        phone: "02-2660-3112",lat: 37.5716, lng: 126.8311 },
  // 양천구
  { name: "목동파출소",      address: "서울 양천구 목동동로 257",        phone: "02-2697-3112",lat: 37.5270, lng: 126.8782 },
  { name: "신정파출소",      address: "서울 양천구 신정이펜하우스로 48", phone: "02-2698-3112",lat: 37.5204, lng: 126.8677 },
  // 구로구
  { name: "구로파출소",      address: "서울 구로구 구로동로 236",        phone: "02-852-3112", lat: 37.4955, lng: 126.8853 },
  { name: "개봉파출소",      address: "서울 구로구 개봉로 142",          phone: "02-2616-3112",lat: 37.4982, lng: 126.8586 },
  // 금천구
  { name: "독산파출소",      address: "서울 금천구 독산로 261",          phone: "02-895-3112", lat: 37.4648, lng: 126.8980 },
  { name: "시흥파출소",      address: "서울 금천구 시흥대로 101",        phone: "02-895-3113", lat: 37.4491, lng: 126.9041 },
  // 동작구
  { name: "사당파출소",      address: "서울 동작구 사당로 211",          phone: "02-598-3112", lat: 37.4768, lng: 126.9815 },
  { name: "노량진파출소",    address: "서울 동작구 노량진로 93",         phone: "02-815-3112", lat: 37.5134, lng: 126.9414 },
  { name: "상도파출소",      address: "서울 동작구 상도로 215",          phone: "02-823-3112", lat: 37.4993, lng: 126.9506 },
  // 강동구
  { name: "천호파출소",      address: "서울 강동구 성내로 25",           phone: "02-470-3112", lat: 37.5304, lng: 127.1237 },
  { name: "암사파출소",      address: "서울 강동구 암사동 493",          phone: "02-474-3112", lat: 37.5527, lng: 127.1301 },
  { name: "길동파출소",      address: "서울 강동구 고분로 85",           phone: "02-475-3112", lat: 37.5402, lng: 127.1432 },
];

// 좌표 배열 (하위 호환)
export const POLICE_STATIONS: [number, number][] = NAMED_POLICE_STATIONS.map(p => [p.lat, p.lng]);

// ── 비상벨 밀도 격자 (safe_bell_grid.json: [lat, lng, density(0~1)][]) ──
export const BELL_GRID = safeBellGridRaw as [number, number, number][];
export const BELL_CELL = 0.005; // 격자 셀 크기 (≈500m)

/** 가장 가까운 파출소 좌표 반환 */
export function nearestPoliceStation(lat: number, lng: number): [number, number] {
  let best = POLICE_STATIONS[0];
  let bestD = Infinity;
  for (const [plat, plng] of POLICE_STATIONS) {
    const d = (plat - lat) ** 2 + (plng - lng) ** 2;
    if (d < bestD) { bestD = d; best = [plat, plng]; }
  }
  return best;
}

/** 경계 박스 내 비상벨 셀 (density 임계값 이상) */
export function getBellsInBbox(
  minLat: number, minLng: number, maxLat: number, maxLng: number,
  minDensity = 0.1
): [number, number, number][] {
  const margin = BELL_CELL;
  return BELL_GRID.filter(([lat, lng, d]) =>
    d >= minDensity &&
    lat >= minLat - margin && lat <= maxLat + margin &&
    lng >= minLng - margin && lng <= maxLng + margin
  );
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────

/** Haversine 거리 계산 (m) */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 가장 가까운 파출소까지의 거리 (m) */
function nearestPoliceDistM(lat: number, lng: number): number {
  let minD = Infinity;
  for (const [plat, plng] of POLICE_STATIONS) {
    const d = haversineM(lat, lng, plat, plng);
    if (d < minD) minD = d;
  }
  return minD;
}

/** 비상벨 격자 밀도 (0~1) — 가장 가까운 격자 셀 참조 */
function bellDensityAt(lat: number, lng: number): number {
  const cellLat = Math.round(lat / BELL_CELL) * BELL_CELL;
  const cellLng = Math.round(lng / BELL_CELL) * BELL_CELL;
  // 정확히 일치하는 셀 → 인접 셀(9개) 중 가장 가까운 것
  let best = 0;
  let bestDist = Infinity;
  for (const [blat, blng, density] of BELL_GRID) {
    const dlat = blat - cellLat;
    const dlng = blng - cellLng;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestDist) { bestDist = d; best = density; }
    if (bestDist < 0.0001) break; // 충분히 가까우면 조기 종료
  }
  return best;
}

// ─── 일몰 시간 (한국 위도 기준) ──────────────────────────────────────────

function getSunsetHour(): number {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  // 하지(172일) 기준 ±1.8h 변동, 한국 평균 일몰 18:30
  return 18.5 + Math.cos(((dayOfYear - 172) / 365) * 2 * Math.PI) * 1.8;
}

export function isCurrentlyNight(): boolean {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return hour >= getSunsetHour() + 0.5 || hour < 6;
}

export function getCurrentTimeLabel(): string {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const sunset = getSunsetHour();
  if (hour >= 23 || hour < 5) return "심야";
  if (hour >= sunset + 1)     return "야간";
  if (hour >= sunset - 0.5)   return "황혼";
  if (hour >= 18)              return "저녁";
  if (hour >= 7)               return "주간";
  return "이른아침";
}

// ─── R_dynamic ────────────────────────────────────────────────────────────

function rDynamic(lat: number, lng: number): number {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const sunset = getSunsetHour();

  // 유동인구 시뮬레이션 (시간대별)  — 통신사 실시간 API 없으므로 비상벨 밀도와 시간대로 추정
  // 비상벨이 많은 곳 = 유동인구 대책 지역 → 낮에는 안전, 밤에는 주의
  const bellDensity = bellDensityAt(lat, lng);
  const basePopScore = 20 + bellDensity * 60; // 0~80 명 추정

  // 시간대별 유동인구 배율
  let popMultiplier = 1.0;
  if (hour >= 7 && hour < 10)       popMultiplier = 1.3;  // 출근
  else if (hour >= 12 && hour < 14) popMultiplier = 1.2;  // 점심
  else if (hour >= 17 && hour < 20) popMultiplier = 1.4;  // 퇴근
  else if (hour >= 23 || hour < 5)  popMultiplier = 0.15; // 심야
  else if (hour >= 20)               popMultiplier = 0.5;  // 저녁
  else if (hour < 7)                 popMultiplier = 0.3;  // 새벽

  const pop = basePopScore * popMultiplier;

  // Sigmoid 유동인구 위험도 (적을수록 위험)
  const pCrowd = 1.0 / (1.0 + Math.exp(0.05 * (pop - 20)));

  // 야간 가중치 β
  const isNight = hour >= sunset + 0.5 || hour < 6;
  const betaNight = isNight ? 1.5 : 1.0;

  // 기상 (현재 시간 기반 계절 추정 — 실제 날씨 API 없으므로 고정 1.0)
  const gammaWeather = 1.0;

  return Math.max(0, Math.min(1, pCrowd * betaNight * gammaWeather));
}

// ─── 실제 Overpass 데이터 기반 근접 카운트 ───────────────────────────────

/** 반경 r미터 이내의 점 배열 개수 */
function countNearby(points: [number, number][], lat: number, lng: number, rM: number): number {
  let count = 0;
  for (const [plat, plng] of points) {
    if (haversineM(lat, lng, plat, plng) <= rM) count++;
  }
  return count;
}

/**
 * OSM 토지이용 기반 범죄 위험 점수 (0~1)
 * industrial=고위험, commercial=중위험, residential=저위험, park/recreation=낮음
 * 야간에는 상업지구도 위험도 상승
 */
function landUseCrimeRisk(lat: number, lng: number): number {
  const cache = _envCache;
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  const isNight = hour >= 22 || hour < 6;

  if (cache.landUse.length === 0) {
    // 캐시 없으면 bell density로 폴백
    const bellDensity = bellDensityAt(lat, lng);
    return 0.1 + (1 - bellDensity) * 0.1;
  }

  // 반경 200m 이내 토지이용 찾기
  let nearest: string | null = null;
  let nearestD = Infinity;
  for (const lu of cache.landUse) {
    const d = haversineM(lat, lng, lu.lat, lu.lng);
    if (d < nearestD) { nearestD = d; nearest = lu.type; }
  }

  if (nearest === null || nearestD > 300) {
    return 0.1; // 분류 안 된 지역: 중간 위험
  }

  const BASE: Record<string, number> = {
    industrial:       0.35,
    commercial:       0.20,
    retail:           0.18,
    residential:      0.12,
    recreation_ground: 0.15,
    park:             0.10,
  };
  const base = BASE[nearest] ?? 0.15;

  // 야간 상업/공업지구 위험도 상승
  if (isNight && (nearest === "industrial" || nearest === "commercial" || nearest === "retail")) {
    return Math.min(0.5, base * 1.6);
  }
  return base;
}

// ─── R_static (실제 가로등 + CCTV + OSM 토지이용) ─────────────────────────

function rStatic(lat: number, lng: number): number {
  const cache = _envCache;

  // ① 실제 가로등 (Overpass street_lamp) — 50m 이내 개수로 점수화
  let lampScore: number;
  if (cache.lamps.length > 0) {
    const lampsNearby = countNearby(cache.lamps, lat, lng, 50);
    lampScore = Math.min(0.25, lampsNearby * 0.06); // 5개 이상이면 최대치
  } else {
    // 캐시 없으면 비상벨 밀도로 폴백
    lampScore = Math.min(0.2, bellDensityAt(lat, lng) * 0.2);
  }

  // ② 실제 CCTV (Overpass surveillance) — 100m 이내 개수로 점수화
  let cctvScore: number;
  if (cache.cctv.length > 0) {
    const cctvNearby = countNearby(cache.cctv, lat, lng, 100);
    cctvScore = Math.min(0.2, cctvNearby * 0.07);
  } else {
    cctvScore = Math.min(0.15, bellDensityAt(lat, lng) * 0.15);
  }

  // ③ 파출소 근접 점수
  const policeDist = nearestPoliceDistM(lat, lng);
  const sPolice = policeDist <= 300 ? 0.3 : policeDist <= 700 ? 0.15 : 0;

  // ④ OSM 토지이용 기반 범죄 위험도 (높을수록 위험)
  const sCrime = landUseCrimeRisk(lat, lng);

  return Math.max(0, Math.min(1, sCrime - lampScore - cctvScore - sPolice));
}

// ─── R_community (로컬 스토어 + 백엔드 API 통합) ─────────────────────────

const PIN_WEIGHTS: Record<string, number> = {
  공사: 0.35,
  어두움: 0.28,
  고장: 0.22,
  기타: 0.15,
  전체: 0.10,
  검색: 0.10,
};
// 24시간 반감기 (커뮤니티 신고는 시간이 지날수록 위험도 감소)
const DECAY_HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_MS;

function rCommunity(lat: number, lng: number, radiusM = 200): number {
  if (!_includeCommunity) return 0; // 미포함 모드
  const now = Date.now();
  let score = 0;

  // ① 로컬 스토어 핀 (즉시 반영 — 사용자가 방금 등록한 것 포함)
  for (const pin of getCommunityPins()) {
    if (pin.lat === undefined || pin.lng === undefined) continue;
    const dist = haversineM(lat, lng, pin.lat, pin.lng);
    if (dist > radiusM) continue;
    const vi = PIN_WEIGHTS[pin.category] ?? 0.1;
    const ageMs = now - pin.id;
    const decay = Math.exp(-DECAY_LAMBDA * Math.max(0, ageMs));
    score += vi * decay * (1 - dist / radiusM); // 거리 가중치 추가
  }

  // ② 백엔드 API 데이터 (prefetchEnvData로 가져온 실제 DB 신고)
  for (const danger of _envCache.apiDangers) {
    const dist = haversineM(lat, lng, danger.lat, danger.lng);
    if (dist > radiusM) continue;
    const vi = PIN_WEIGHTS[danger.category] ?? 0.1;
    const ageMs = now - new Date(danger.created_at).getTime();
    const decay = Math.exp(-DECAY_LAMBDA * Math.max(0, ageMs));
    score += vi * decay * (1 - dist / radiusM);
  }

  return Math.min(0.6, score);
}

// ─── 종합 위험 점수 R(e) ─────────────────────────────────────────────────

const W1 = 0.4, W2 = 0.4, W3 = 0.2;

function edgeRisk(lat: number, lng: number): number {
  const rs = rStatic(lat, lng);
  const rd = rDynamic(lat, lng);
  const rc = rCommunity(lat, lng);
  return Math.min(1, W1 * rs + W2 * rd + W3 * rc);
}

// ─── 경로 안전 점수 (세부 항목 포함) ─────────────────────────────────────

export interface SafetyFactors {
  police: number;    // 파출소 근접도 점수 (0-100, 높을수록 안전)
  bell: number;      // 비상벨/CCTV 밀도 (0-100)
  lighting: number;  // 가로등 추정 (0-100)
  crowd: number;     // 유동인구 추정 (0-100)
  time: number;      // 시간대 안전도 (0-100)
  composite: number; // 종합 안전 점수 (0-100, 100=최안전)
}

/** 경로 waypoint 배열의 평균 안전 점수 계산 (실제 Overpass + API 데이터 반영) */
export function calcRouteSafety(waypoints: [number, number][]): SafetyFactors {
  if (waypoints.length === 0) return { police: 50, bell: 50, lighting: 50, crowd: 50, time: 50, composite: 50 };

  const cache = _envCache;
  const hasRealLamps = cache.lamps.length > 0;
  const hasRealCctv  = cache.cctv.length > 0;
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  let popMult = 1.0;
  if (hour >= 7 && hour < 10)       popMult = 1.3;
  else if (hour >= 17 && hour < 20) popMult = 1.4;
  else if (hour >= 23 || hour < 5)  popMult = 0.1;
  else if (hour >= 20)              popMult = 0.4;
  else if (hour < 7)                popMult = 0.25;

  let totalPolice = 0, totalLighting = 0, totalCctv = 0, totalCrowd = 0, totalCrime = 0;

  for (const [lat, lng] of waypoints) {
    // 파출소 (하드코딩 실제 데이터)
    const policeDist = nearestPoliceDistM(lat, lng);
    const policeScore = policeDist <= 300 ? 100 :
      policeDist <= 1000 ? 100 - (policeDist - 300) / 7 :
      Math.max(10, 50 - (policeDist - 1000) / 40);

    // 가로등 (실제 Overpass or 비상벨 폴백)
    const lightScore = hasRealLamps
      ? Math.min(100, countNearby(cache.lamps, lat, lng, 50) * 20)
      : bellDensityAt(lat, lng) * 85 + 15;

    // CCTV (실제 Overpass or 비상벨 폴백)
    const cctvScore = hasRealCctv
      ? Math.min(100, countNearby(cache.cctv, lat, lng, 100) * 25)
      : bellDensityAt(lat, lng) * 100;

    // 유동인구 (비상벨 밀도 + 시간대)
    const bell = bellDensityAt(lat, lng);
    const crowdScore = Math.min(100, (20 + bell * 60) * popMult);

    // 범죄 위험도 역산 (100 - risk*100)
    const crimeRisk = landUseCrimeRisk(lat, lng);
    const crimeSafeScore = Math.max(0, 100 - crimeRisk * 200);

    totalPolice   += policeScore;
    totalLighting += lightScore;
    totalCctv     += cctvScore;
    totalCrowd    += crowdScore;
    totalCrime    += crimeSafeScore;
  }

  const n = waypoints.length;
  const police   = Math.round(totalPolice / n);
  const lighting = Math.round(totalLighting / n);
  const cctv     = Math.round(totalCctv / n);
  const crowd    = Math.round(totalCrowd / n);
  const crime    = Math.round(totalCrime / n);

  // 시간대 점수
  const sunset = getSunsetHour();
  const timeScore =
    (hour >= 23 || hour < 5) ? 25 :
    hour >= sunset + 1        ? 45 :
    hour >= sunset - 0.5      ? 65 :
    hour >= 18                ? 78 :
    hour >= 7                 ? 100 : 82;

  // 종합 안전점수: 공식 역산
  const avgRisk = waypoints.reduce((sum, [lat, lng]) => sum + edgeRisk(lat, lng), 0) / n;
  const composite = Math.round((1 - avgRisk) * 100);

  return {
    police,
    bell:     Math.round((lighting + cctv) / 2),  // bell 항목 = 가로등+CCTV 평균으로 재매핑
    lighting,
    crowd,
    time:     timeScore,
    composite,
    // 추가 세부 항목 (타입 확장)
    cctv,
    crime,
  } as SafetyFactors & { cctv: number; crime: number };
}

/** W(e) 최종 비용 계산 (Dijkstra 가중치용) */
export function edgeWeight(distM: number, lat: number, lng: number, alpha = 1.2): number {
  const R = edgeRisk(lat, lng);
  return distM * (1 + alpha * R);
}

/** 경로 타입별 waypoint 오프셋 생성 */
export function buildWaypoints(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  routeType: "safe" | "balanced" | "fast",
  n = 8
): [number, number][] {
  const points: [number, number][] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let lat = originLat + (destLat - originLat) * t;
    let lng = originLng + (destLng - originLng) * t;

    if (routeType === "safe") {
      // 안전경로: 파출소 방향으로 최대 8% 편향 (너무 빙 돌지 않도록 제한)
      let closestLat = originLat, closestLng = originLng, closestD = Infinity;
      for (const [plat, plng] of POLICE_STATIONS) {
        const d = haversineM(lat, lng, plat, plng);
        if (d < closestD) { closestD = d; closestLat = plat; closestLng = plng; }
      }
      const bias = Math.sin(t * Math.PI) * 0.08;
      const distToPolice = haversineM(lat, lng, closestLat, closestLng);
      if (distToPolice > 100) {
        lat += (closestLat - lat) * bias;
        lng += (closestLng - lng) * bias;
      }
    } else if (routeType === "balanced") {
      // 균형 경로: 아주 약간의 편차
      const bias = Math.sin(t * Math.PI) * 0.03;
      lat += bias * Math.sign(destLat - originLat);
      lng -= bias * Math.sign(destLng - originLng);
    }
    // fast: 직선

    points.push([lat, lng]);
  }
  return points;
}
