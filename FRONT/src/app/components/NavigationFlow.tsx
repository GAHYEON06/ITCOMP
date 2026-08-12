import { useState, useRef, useEffect, useMemo } from "react";
import L from "leaflet";
import { motion, AnimatePresence } from "motion/react";
import {
  calcRouteSafety, buildWaypoints, isCurrentlyNight, getCurrentTimeLabel,
  NAMED_POLICE_STATIONS, nearestPoliceStation, getBellsInBbox, prefetchEnvData,
  setIncludeCommunity,
} from "../shared/safetyEngine";
import { imgLoadingBg, imgLoadingCharacter, LEAF_IMGS, Leaf } from "../shared/SharedUI";
import { LEAF_WRAPPERS, LEAF_INNER, LEAF_ANIM, TEXT_OPACITY, TEXT_TIMES } from "../shared/constants";

import { fetchAIBriefing, type AIBriefing } from "./aiService";

// ─── OSRM 경로 fetch (도보/주행 공통) ─────────────────────────────────────
const OSRM_FOOT   = "https://router.project-osrm.org/route/v1/foot";
const OSRM_DRIVE  = "https://router.project-osrm.org/route/v1/driving";

async function fetchOsrmRouteWith(
  base: string,
  waypoints: [number, number][],
  signal?: AbortSignal
): Promise<{ coords: [number, number][]; distanceM: number; durationS: number } | null> {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  try {
    const res = await fetch(
      `${base}/${coords}?overview=full&geometries=geojson`,
      { signal }
    );
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    return {
      coords: (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchOsrmRoute(
  waypoints: [number, number][],
  signal?: AbortSignal
): Promise<[number, number][] | null> {
  const r = await fetchOsrmRouteWith(OSRM_FOOT, waypoints, signal);
  return r ? r.coords : null;
}

export function MapComponent({ waypoints }: { waypoints: [number, number][] }) {
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapRef.current || waypoints.length < 2) return;

    const controller = new AbortController();

    const drawRoute = async () => {
      const coords = await fetchOsrmRoute(waypoints, controller.signal);

      if (!coords || coords.length === 0) {
        console.warn("경로 데이터를 가져오지 못했습니다.");
        return;
      }

      const map = mapRef.current;
      if (!map) return;

      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
      }

      const newPolyline = L.polyline(coords, {
        color: '#3b82f6',
        weight: 6,
        opacity: 0.8,
        lineJoin: 'round'
      }).addTo(map);

      polylineRef.current = newPolyline;
      map.fitBounds(newPolyline.getBounds(), { padding: [50, 50] });

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    };

    drawRoute();

    return () => {
      controller.abort();
    };
  }, [waypoints]);

  return <div id="map" style={{ width: '100%', height: '100vh' }} />;
}

async function fetchOsrmAlternatives(
  waypoints: [number, number][],
  signal?: AbortSignal
): Promise<[number, number][][]> {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  try {
    const res = await fetch(
      `${OSRM_FOOT}/${coords}?overview=full&geometries=geojson&alternatives=3`,
      { signal }
    );
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return [];
    return (data.routes as { geometry: { coordinates: [number, number][] } }[]).map(route =>
      route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
    );
  } catch { return []; }
}

async function fetchDriveRoute(
  waypoints: [number, number][],
  signal?: AbortSignal
): Promise<{ coords: [number, number][]; distanceM: number; durationS: number } | null> {
  return fetchOsrmRouteWith(OSRM_DRIVE, waypoints, signal);
}

// ─── Overpass API 공통 helper ─────────────────────────────────────────────
async function fetchOverpassNodes(
  tags: string, minLat: number, minLng: number, maxLat: number, maxLng: number,
  pad = 0.003, signal?: AbortSignal
): Promise<[number, number][]> {
  const bbox = `${minLat - pad},${minLng - pad},${maxLat + pad},${maxLng + pad}`;
  const query = `[out:json][timeout:10];node${tags}(${bbox});out body;`;
  try {
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal }
    );
    const data = await res.json();
    return (data.elements ?? []).map((e: { lat: number; lon: number }) => [e.lat, e.lon] as [number, number]);
  } catch { return []; }
}

async function fetchTrafficLights(
  minLat: number, minLng: number, maxLat: number, maxLng: number,
  signal?: AbortSignal
): Promise<[number, number][]> {
  return fetchOverpassNodes(`["highway"="traffic_signals"]`, minLat, minLng, maxLat, maxLng, 0.003, signal);
}

async function fetchPublicRestrooms(
  minLat: number, minLng: number, maxLat: number, maxLng: number,
  signal?: AbortSignal
): Promise<[number, number][]> {
  return fetchOverpassNodes(`["amenity"="toilets"]["access"!="private"]`, minLat, minLng, maxLat, maxLng, 0.005, signal);
}

// ─── 날씨 훅 (open-meteo) ─────────────────────────────────
interface WeatherData {
  temp: number; code: number; wind: number; rain: number;
  alerts: { level: "danger" | "warning" | "info"; text: string }[];
}

function buildWeatherAlerts(code: number, wind: number, rain: number): WeatherData["alerts"] {
  const a: WeatherData["alerts"] = [];
  if (code >= 95)        a.push({ level: "danger",  text: "⚡ 낙뢰 위험 — 야외 이동 자제, 건물 안으로 대피 요망" });
  else if (code >= 85)   a.push({ level: "danger",  text: "❄️ 눈소나기 — 빙판길 매우 위험, 보행 속도 줄이세요" });
  else if (code >= 71)   a.push({ level: "danger",  text: "❄️ 적설 — 미끄럼 사고 위험, 안전한 경로 선택 권장" });
  if (code >= 61 && code < 71) a.push({ level: "warning", text: "🌧️ 비 — 우천 시 노면 미끄러움, 우산 지참 권장" });
  if (code >= 80 && code < 85) a.push({ level: "warning", text: "🌧️ 소나기 — 갑작스러운 강우 주의" });
  if (code >= 51 && code < 61) a.push({ level: "info",    text: "🌦️ 이슬비 — 노면 약간 미끄러울 수 있음" });
  if (code >= 45 && code < 51) a.push({ level: "warning", text: "🌫️ 안개 — 시야 불량, 차량 조심" });
  if (wind >= 20)        a.push({ level: "warning", text: `💨 강풍 ${Math.round(wind)}km/h — 간판·낙하물 주의` });
  if (rain > 10)         a.push({ level: "info",    text: `☔ 강수량 ${rain.toFixed(1)}mm/h` });
  return a;
}

function weatherIcon(code: number): string {
  if (code >= 95) return "⛈️";
  if (code >= 85) return "🌨️";
  if (code >= 71) return "❄️";
  if (code >= 80) return "🌧️";
  if (code >= 61) return "🌧️";
  if (code >= 51) return "🌦️";
  if (code >= 45) return "🌫️";
  if (code >= 3)  return "☁️";
  return "☀️";
}

function useWeather(lat: number, lng: number): WeatherData | null {
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
        const cur = json.current ?? {};
        const code = cur.weathercode ?? 0;
        const wind = cur.windspeed_10m ?? 0;
        const rain = cur.precipitation ?? 0;
        const temp = cur.temperature_2m ?? 0;
        if (!cancelled) setData({ temp, code, wind, rain, alerts: buildWeatherAlerts(code, wind, rain) });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [lat, lng]);
  return data;
}

const VWORLD_KEY = "1BD705BC-E920-3526-B69B-B1E5B4C5C659";
const jua: React.CSSProperties = { fontFamily: "'Jua', sans-serif" };

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PLACES: Place[] = [
  { name: "강남역",          address: "서울 강남구 강남대로 396",         lat: 37.4979, lng: 127.0276 },
  { name: "강북구청",        address: "서울 강북구 오현로 49",             lat: 37.6397, lng: 127.0254 },
  { name: "강동구청",        address: "서울 강동구 성내로 25",             lat: 37.5304, lng: 127.1237 },
  { name: "강서구청",        address: "서울 강서구 화곡로 302",            lat: 37.5509, lng: 126.8495 },
  { name: "강남세브란스병원", address: "서울 강남구 언주로 211",            lat: 37.4899, lng: 127.0707 },
  { name: "고려대학교",      address: "서울 성북구 안암로 145",            lat: 37.5894, lng: 127.0323 },
  { name: "고속터미널역",    address: "서울 서초구 신반포로 194",          lat: 37.5046, lng: 127.0048 },
  { name: "광화문역",        address: "서울 종로구 세종대로 172",          lat: 37.5757, lng: 126.9770 },
  { name: "광화문광장",      address: "서울 종로구 세종대로 172",          lat: 37.5759, lng: 126.9769 },
  { name: "경복궁",          address: "서울 종로구 사직로 161",            lat: 37.5796, lng: 126.9770 },
  { name: "경희대학교",      address: "서울 동대문구 경희대로 26",          lat: 37.5974, lng: 127.0514 },
  { name: "노원역",          address: "서울 노원구 노해로 480",            lat: 37.6561, lng: 127.0561 },
  { name: "노들섬",          address: "서울 용산구 양녕로 445",            lat: 37.5200, lng: 126.9404 },
  { name: "낙산공원",        address: "서울 종로구 낙산길 41",              lat: 37.5829, lng: 127.0067 },
  { name: "동대문역사문화공원역", address: "서울 중구 을지로 281",          lat: 37.5657, lng: 127.0092 },
  { name: "동대입구역",      address: "서울 중구 퇴계로 194",              lat: 37.5582, lng: 126.9978 },
  { name: "롯데월드타워",    address: "서울 송파구 올림픽로 300",          lat: 37.5126, lng: 127.1025 },
  { name: "명동역",          address: "서울 중구 명동길 14",               lat: 37.5636, lng: 126.9832 },
  { name: "명동성당",        address: "서울 중구 명동길 74",               lat: 37.5633, lng: 126.9874 },
  { name: "마포구청",        address: "서울 마포구 월드컵로 212",          lat: 37.5663, lng: 126.9014 },
  { name: "서울역",          address: "서울 중구 통일로 1",                lat: 37.5547, lng: 126.9707 },
  { name: "서울시청",        address: "서울 중구 세종대로 110",            lat: 37.5664, lng: 126.9783 },
  { name: "서울숲",          address: "서울 성동구 뚝섬로 273",            lat: 37.5447, lng: 127.0374 },
  { name: "서울대학교병원",  address: "서울 종로구 대학로 101",            lat: 37.5797, lng: 126.9993 },
  { name: "성신여자대학교역",address: "서울 성북구 보문로 227",            lat: 37.5924, lng: 127.0161 },
  { name: "수서역",          address: "서울 강남구 밤고개로 99",            lat: 37.4852, lng: 127.1067 },
  { name: "신촌역",          address: "서울 서대문구 신촌로 83",            lat: 37.5551, lng: 126.9368 },
  { name: "신림역",          address: "서울 관악구 남부순환로 1666",        lat: 37.4842, lng: 126.9293 },
  { name: "안국역",          address: "서울 종로구 율곡로 283",            lat: 37.5763, lng: 126.9851 },
  { name: "여의도공원",      address: "서울 영등포구 여의공원로 68",        lat: 37.5241, lng: 126.9246 },
  { name: "연세대학교",      address: "서울 서대문구 연세로 50",            lat: 37.5643, lng: 126.9388 },
  { name: "용산역",          address: "서울 용산구 한강대로 23길 55",      lat: 37.5298, lng: 126.9647 },
  { name: "이태원역",        address: "서울 용산구 이태원로 177",          lat: 37.5344, lng: 126.9944 },
  { name: "인사동",          address: "서울 종로구 인사동길 41",            lat: 37.5741, lng: 126.9853 },
  { name: "잠실역",          address: "서울 송파구 올림픽로 240",          lat: 37.5133, lng: 127.0998 },
  { name: "종로3가역",       address: "서울 종로구 종로 199",              lat: 37.5714, lng: 126.9920 },
  { name: "창덕궁",          address: "서울 종로구 율곡로 99",              lat: 37.5792, lng: 126.9910 },
  { name: "충무로역",        address: "서울 중구 퇴계로 152",              lat: 37.5613, lng: 126.9948 },
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
    p.name.toLowerCase().includes(lq) ||
    p.address.toLowerCase().includes(lq)
  ).slice(0, 7);
}

async function fetchNominatimPlaces(query: string): Promise<Place[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&accept-language=ko&countrycodes=kr`;
    const res = await fetch(url, { headers: { "Accept-Language": "ko" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item: { display_name: string; lat: string; lon: string }) => {
      const parts = item.display_name.split(",");
      const name = parts[0].trim();
      const address = parts.slice(0, 3).join(",").trim();
      return { name, address, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
    });
  } catch {
    return [];
  }
}

export interface InfrastructurePoint {
  type: 'police' | 'bell' | 'light';
  lat: number;
  lng: number;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function generateRouteCoords(
  origin: Place, 
  dest: Place
): Promise<[number, number][]> {
  const url = `${OSRM_FOOT}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      return [[origin.lat, origin.lng], [dest.lat, dest.lng]];
    }

    return data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
  } catch (error) {
    console.error('OSRM 경로 조회 실패:', error);
    return [[origin.lat, origin.lng], [dest.lat, dest.lng]];
  }
}

export interface SafeRoute {
  id: string;
  label: string;
  tagline: string;
  duration: string;
  distance: string;
  safetyScore: number;
  safetyTags: string[];
  steps: string[];
  color: string;
  factors: {
    police: number;
    bell: number;
    lighting: number;
    crowd: number;
    time: number;
    composite: number;
  };
  isSafest: boolean;
  isFastest: boolean;
}

export interface DriveRoute {
  id: string;
  label: string;
  tagline: string;
  duration: string;
  distance: string;
  color: string;
  tags: string[];
  steps: string[];
  fuelEst: string;
  tollEst: string;
  parking: string;
  isFastest: boolean;
  isCheapest: boolean;
  isTaxi: boolean;
  coords: [number, number][];
}

// ⭐️ 완전히 방어 코드가 작성된 generateRoutes
export async function generateRoutes(
  origin: Place, 
  dest: Place, 
  infrastructures: InfrastructurePoint[] = []
): Promise<SafeRoute[]> {
  try {
    const coords = await generateRouteCoords(origin, dest);

    let policeCount = 0;
    let bellCount = 0;
    let lightCount = 0;

    const safeInfrastructures = Array.isArray(infrastructures) ? infrastructures : [];

    if (Array.isArray(coords) && coords.length > 0) {
      coords.forEach(([lat, lng]) => {
        safeInfrastructures.forEach((item) => {
          if (!item || typeof item.lat !== 'number' || typeof item.lng !== 'number') return;

          const dist = getDistanceKm(lat, lng, item.lat, item.lng);
          if (dist <= 0.1) {
            if (item.type === 'police') policeCount++;
            if (item.type === 'bell') bellCount++;
            if (item.type === 'light') lightCount++;
          }
        });
      });
    }

    const night = isCurrentlyNight();
    const policeFactorA = Math.min(98, Math.max(30, (policeCount + 2) * 25));
    const bellFactorA = Math.min(98, Math.max(30, (bellCount + 3) * 15));
    const lightingFactorA = Math.min(98, Math.max(30, (lightCount + 4) * 12));
    const nightPenalty = night ? 12 : 0;

    const scoreA = Math.min(98, Math.max(20, Math.round(policeFactorA * 0.40 + bellFactorA * 0.35 + lightingFactorA * 0.25 - nightPenalty)));
    const scoreB = Math.min(92, Math.max(15, Math.round(scoreA * 0.88)));
    const scoreC = Math.min(85, Math.max(10, Math.round(scoreA * 0.75)));

    // ⭐️ [수정 핵심] 각 경로별 factors 객체 정의
    const factorsA = {
      police: policeFactorA,
      bell: bellFactorA,
      lighting: lightingFactorA,
      crowd: 70,
      time: night ? 50 : 85,
      composite: scoreA,
    };

    const factorsB = {
      ...factorsA,
      lighting: Math.min(98, lightingFactorA + 10),
      composite: scoreB,
    };

    const factorsC = {
      ...factorsA,
      police: Math.max(20, policeFactorA - 20),
      bell: Math.max(20, bellFactorA - 15),
      composite: scoreC,
    };

    let totalDistKm = 0;
    if (Array.isArray(coords) && coords.length > 1) {
      for (let i = 0; i < coords.length - 1; i++) {
        totalDistKm += getDistanceKm(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
      }
    }
    const durationMinA = Math.max(3, Math.round(totalDistKm * 12));
    const durationMinB = Math.max(2, Math.round(totalDistKm * 11));
    const durationMinC = Math.max(2, Math.round(totalDistKm * 10));

    const aiBriefing = await fetchAIBriefing(
      origin.name,
      dest.name,
      night,
      policeCount,
      bellCount,
      scoreA
    );

    return [
  {
    id: "A",
    label: "추천 안전경로",
    tagline: aiBriefing.tagline,
    duration: `약 ${durationMinA}분`,
    distance: `${totalDistKm.toFixed(1)}km`,
    safetyScore: factorsA.composite,
    safetyTags: aiBriefing.safetyTags,
    color: "#2e7d32",
    factors: factorsA,
    isSafest: true,
    isFastest: false,
    steps: [
      `${origin.name} 출발`,
      `실제 안전 인프라 통과 (파출소 ${policeCount}개, 비상벨 ${bellCount}개 감지)`,
      `${dest.name} 도착`,
    ],
  },
  {
    id: "B",
    label: "대로변 우회경로",
    tagline: "조명이 밝고 유동인구가 많은 대로변 우선",
    duration: `약 ${durationMinB}분`,
    distance: `${(totalDistKm * 1.08).toFixed(1)}km`,
    safetyScore: factorsB.composite,
    safetyTags: ["밝은 길", "대로변 위주", "유동인구 많음"],
    color: "#1565c0",
    factors: factorsB,
    isSafest: false,
    isFastest: false,
    steps: [
      `${origin.name} 출발`,
      "가로등 밀집 및 유동인구 많은 대로변 진입",
      `${dest.name} 도착`,
    ],
  },
  {
    id: "C",
    label: "최단 경로",
    tagline: "안전 점수보다 빠른 도착을 우선시하는 경로",
    duration: `약 ${durationMinC}분`,
    distance: `${(totalDistKm * 0.95).toFixed(1)}km`,
    safetyScore: factorsC.composite,
    safetyTags: ["최단 시간", "골목길 포함"],
    color: "#e65100",
    factors: factorsC,
    isSafest: false,
    isFastest: true,
    steps: [
      `${origin.name} 출발`,
      "최단 거리 직선 경로 및 골목길 통과",
      `${dest.name} 도착`,
    ],
  },
];
  } catch (error) {
    console.error("경로 생성 오류:", error);
    return [
      {
        id: "A",
        label: "안전경로",
        tagline: "안전 인프라 연동 도보 경로",
        duration: "약 15분",
        distance: "1.2km",
        safetyScore: 85,
        safetyTags: ["파출소 인근", "비상벨 구역", "안전 우선"],
        color: "#2e7d32",
        factors: { police: 80, bell: 70, lighting: 80, crowd: 50, time: 80, composite: 85 },
        isSafest: true,
        isFastest: false,
        steps: [`${origin.name} 출발`, "안전 경로 이동", `${dest.name} 도착`],
      }
    ];
  }
}

export async function fetchDriveRouteCoords(
  origin: Place, 
  dest: Place
): Promise<{ coords: [number, number][]; distanceM: number; durationS: number } | null> {
  const url = `${OSRM_DRIVE}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;

    const route = data.routes[0];
    return {
      coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
    };
  } catch (error) {
    console.error("OSRM 자동차 경로 조회 실패:", error);
    return null;
  }
}

export async function generateDriveRoutes(
  origin: Place, 
  dest: Place
): Promise<DriveRoute[]> {
  const osrmData = await fetchDriveRouteCoords(origin, dest);

  const coords: [number, number][] = osrmData?.coords || [
    [origin.lat, origin.lng], 
    [dest.lat, dest.lng]
  ];
  
  const distanceKm = osrmData ? (osrmData.distanceM / 1000) : 1;
  const durationMin = osrmData ? Math.max(1, Math.round(osrmData.durationS / 60)) : 5;
  const fuelEstAmount = Math.round((distanceKm / 12) * 1600);
  const night = isCurrentlyNight();

  return [
    {
      id: "DA",
      label: "실시간 안전경로 🚦",
      tagline: `CCTV·주요 대로 우선 경유${night ? " · 야간 조명 양호" : ""}`,
      duration: `약 ${durationMin}분`,
      distance: `${distanceKm.toFixed(1)}km`,
      color: "#1565c0",
      tags: ["실시간 도로 반영", "대로 우선", night ? "야간 조명 양호" : "CCTV 구역"],
      steps: [
        `${origin.name} 출발 — 대로 진입`,
        `실제 도로망 이동 (${distanceKm.toFixed(1)}km 구간)`,
        "CCTV 및 가로등 밀집 대로 경유",
        `${dest.name} 도착`,
      ],
      fuelEst: `약 ${fuelEstAmount.toLocaleString()}원`,
      tollEst: "약 0원",
      parking: "목적지 인근 공영주차장",
      isFastest: true,
      isCheapest: false,
      isTaxi: false,
      coords,
    },
    {
      id: "DB",
      label: "택시 안전모드 🚕",
      tagline: "실시간 위치 공유 · 경로 이탈 자동 감지",
      duration: `약 ${durationMin + 2}분`,
      distance: `${(distanceKm * 1.02).toFixed(1)}km`,
      color: "#e65100",
      tags: ["위치 공유", "이탈 감지", "안심 귀가"],
      steps: [
        `${origin.name} 출발 — 택시 탑승`,
        "실시간 위치 공유 시작",
        "경로 이탈 자동 감지 중",
        `${dest.name} 도착 · 안전 완료`,
      ],
      fuelEst: "택시비 별도",
      tollEst: "미터기 포함",
      parking: "하차 구역",
      isFastest: false,
      isCheapest: false,
      isTaxi: true,
      coords,
    },
    {
      id: "DC",
      label: "일반경로 🛣️",
      tagline: "통행료 없는 일반도로 우회",
      duration: `약 ${durationMin + 4}분`,
      distance: `${(distanceKm * 1.08).toFixed(1)}km`,
      color: "#6a1b9a",
      tags: ["통행료 없음", "일반도로", "신호 다수"],
      steps: [
        `${origin.name} 출발`,
        "시내 일반도로 진입",
        "주요 일반 도로 따라 이동",
        `${dest.name} 도착`,
      ],
      fuelEst: `약 ${Math.round(fuelEstAmount * 1.08).toLocaleString()}원`,
      tollEst: "0원 (무료)",
      parking: "목적지 인근 주차장",
      isFastest: false,
      isCheapest: true,
      isTaxi: false,
      coords,
    },
  ];
}

function makeCustomImageIcon(iconUrl: string) {
  return L.icon({
    iconUrl: iconUrl,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -42],
  });
}

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

function makeIcon(type: MapMarker["type"], customColor?: string) {
  const color = customColor ?? (type === "origin" ? "#4a9e5c" : type === "dest" ? "#d94040" : "#c47a3a");
  return L.divIcon({
    html: makePawSvg(color),
    className: "",
    iconSize: [44, 54],
    iconAnchor: [22, 54],
    popupAnchor: [0, -54],
  });
}

function makeClusterIcon(count: number, color: string) {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-family:'Jua',sans-serif;font-size:14px;color:white;font-weight:bold;">${count}</div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

interface MultiRouteCoord {
  coords: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  id?: string;
}

export interface InfraMarker {
  lat: number;
  lng: number;
  type: "police" | "bell" | "traffic" | "restroom";
  name?: string;
  address?: string;
  phone?: string;
}

interface InteractiveMapProps {
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerClick?: (marker: MapMarker) => void;
  markers?: MapMarker[];
  routeCoords?: [number, number][];
  multiRoutes?: MultiRouteCoord[];
  centerTo?: [number, number];
  zoom?: number;
  disableClick?: boolean;
  userGpsPos?: [number, number] | null;
  followGps?: boolean;
  followZoom?: number;
  routeBounds?: [number, number][];
  infraMarkers?: InfraMarker[];
  lampCount?: number;
}

function makeGpsDot(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2979ff;border:3px solid white;box-shadow:0 0 0 4px rgba(41,121,255,0.3),0 2px 6px rgba(0,0,0,0.3);"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function makeInfraIcon(type: InfraMarker["type"]): L.DivIcon {
  const cfg: Record<string, { bg: string; text: string; size: number }> = {
    police:   { bg: "#1565c0", text: "🚔", size: 26 },
    bell:     { bg: "#2e7d32", text: "🔔", size: 20 },
    traffic:  { bg: "#e65100", text: "🚦", size: 20 },
    restroom: { bg: "#00695c", text: "🚻", size: 20 },
  };
  const c = cfg[type] ?? cfg.bell;
  return L.divIcon({
    html: `<div style="width:${c.size}px;height:${c.size}px;border-radius:50%;background:${c.bg};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:${Math.round(c.size*0.55)}px;">${c.text}</div>`,
    className: "",
    iconSize: [c.size, c.size],
    iconAnchor: [c.size / 2, c.size / 2],
  });
}

export function InteractiveMap({ onMapClick, onMarkerClick, markers = [], routeCoords, multiRoutes, centerTo, zoom = 16, disableClick, userGpsPos, followGps, followZoom, routeBounds, infraMarkers, lampCount }: InteractiveMapProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<L.Map | null>(null);
  const markersRef     = useRef<L.Marker[]>([]);
  const routeRef       = useRef<L.Polyline[]>([]);
  const multiRoutesRef = useRef<{ outline: L.Polyline; poly: L.Polyline }[]>([]);
  const gpsMarkerRef   = useRef<L.Marker | null>(null);
  const infraMarkersRef = useRef<L.Marker[]>([]);
  const userZoomedRef = useRef(false);
  const progZoomRef = useRef(false);

  function fitBoundsSafe(bounds: L.LatLngBounds, options?: L.FitBoundsOptions) {
    if (userZoomedRef.current) return;
    progZoomRef.current = true;
    mapRef.current?.fitBounds(bounds, options);
    setTimeout(() => { progZoomRef.current = false; }, 800);
  }

  function setViewSafe(center: L.LatLngExpression, z?: number, options?: L.ZoomPanOptions) {
    if (userZoomedRef.current) return;
    progZoomRef.current = true;
    mapRef.current?.setView(center, z, options);
    setTimeout(() => { progZoomRef.current = false; }, 800);
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: centerTo ?? [37.5665, 126.9780],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
      { maxZoom: 19 }
    ).addTo(map);

    mapRef.current = map;

    const triggerResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    triggerResize();
    requestAnimationFrame(triggerResize);
    const timer1 = setTimeout(triggerResize, 200);
    const timer2 = setTimeout(triggerResize, 500);

    const resizeObserver = new ResizeObserver(() => {
      triggerResize();
    });
    resizeObserver.observe(containerRef.current);

    const onZoomStart = () => { if (!progZoomRef.current) userZoomedRef.current = true; };
    map.on("zoomstart", onZoomStart);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      resizeObserver.disconnect();
      try { map.stop(); } catch { /* ignore */ }
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (disableClick || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [onMapClick, disableClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = markers.map(m => {
        const icon = (m.clusterCount && m.clusterCount > 1)
          ? makeClusterIcon(m.clusterCount, m.color ?? "#c47a3a")
          : m.icon
          ? makeCustomImageIcon(m.icon)
          : makeIcon(m.type, m.color);
        const lMarker = L.marker([m.lat, m.lng], { icon, zIndexOffset: 1000 }).addTo(map);
        if (onMarkerClick) lMarker.on("click", () => onMarkerClick(m));
        return lMarker;
      });
    } catch { /* ignore */ }
  }, [markers, onMarkerClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeRef.current.forEach(p => p.remove());
    routeRef.current = [];

    if (routeCoords && routeCoords.length > 1) {
      const validCoords = routeCoords.map(c => {
        if (Array.isArray(c)) {
          return Math.abs(c[0]) > 90 ? [c[1], c[0]] : [c[0], c[1]];
        }
        return [c.lat, c.lng];
      });

      map.invalidateSize();

      const outline = L.polyline(validCoords, { color: "#ffffff", weight: 14, opacity: 0.9 }).addTo(map);
      const poly = L.polyline(validCoords, { color: "#1a7a2e", weight: 10, opacity: 1 }).addTo(map);
      poly.bringToFront();

      routeRef.current = [outline, poly];

      const bounds = L.polyline(validCoords).getBounds();
      if (bounds.isValid()) {
        fitBoundsSafe(bounds, { padding: [50, 50] });
      }
    }
  }, [routeCoords]);

  const multiRoutesKey = multiRoutes ? JSON.stringify(multiRoutes.map(r => ({ color: r.color, len: r.coords.length, w: r.weight, id: r.id }))) : "";
  const prevMultiCountRef = useRef(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !multiRoutes) return;

    multiRoutesRef.current.forEach(({ outline, poly }) => {
      outline.remove();
      poly.remove();
    });
    multiRoutesRef.current = [];

    if (multiRoutes.length > 0) {
      map.invalidateSize();

      let allValidCoords: [number, number][] = [];

      multiRoutes.forEach(r => {
        if (!r.coords || r.coords.length < 2) return;

        const validCoords: [number, number][] = r.coords.map(c => {
          if (Array.isArray(c)) {
            return (Math.abs(c[0]) > 90 ? [c[1], c[0]] : [c[0], c[1]]) as [number, number];
          }
          return [c.lat, c.lng] as [number, number];
        });

        allValidCoords = allValidCoords.concat(validCoords);

        const baseWeight = r.weight ?? 7;
        const outline = L.polyline(validCoords, { color: "#ffffff", weight: baseWeight + 5, opacity: 1.0 }).addTo(map);
        const poly = L.polyline(validCoords, {
          color: r.color,
          weight: baseWeight,
          opacity: r.opacity ?? 1,
        }).addTo(map);

        poly.bringToFront();

        const onMouseOver = () => {
          outline.bringToFront();
          poly.bringToFront();
          poly.setStyle({ weight: baseWeight + 3, opacity: 1 });
        };

        const onMouseOut = () => {
          poly.setStyle({ weight: baseWeight, opacity: r.opacity ?? 1 });
        };

        outline.on("mouseover", onMouseOver);
        poly.on("mouseover", onMouseOver);
        outline.on("mouseout", onMouseOut);
        poly.on("mouseout", onMouseOut);

        multiRoutesRef.current.push({ outline, poly });
      });

      if (prevMultiCountRef.current === 0 && multiRoutes.length > 0) {
        userZoomedRef.current = false;
      }

      if (allValidCoords.length > 1) {
        const bounds = L.polyline(allValidCoords).getBounds();
        if (bounds.isValid()) {
          fitBoundsSafe(bounds, { padding: [40, 40] });
        }
      }
    }
    prevMultiCountRef.current = multiRoutes.length;
  }, [multiRoutesKey]);

  const infraKey = infraMarkers
    ? infraMarkers.map(m => `${m.type}:${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join("|")
    : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    infraMarkersRef.current.forEach(m => m.remove());
    infraMarkersRef.current = [];
    if (!infraMarkers || infraMarkers.length === 0) return;

    const CELL = 0.00027;
    const cells = new Map<string, InfraMarker[]>();
    for (const im of infraMarkers) {
      const key = `${Math.round(im.lat / CELL)},${Math.round(im.lng / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(im);
    }

    for (const group of cells.values()) {
      const priority = ["police", "bell", "traffic", "restroom"];
      const sorted = [...group].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
      const primary = sorted[0];

      const lat = group.reduce((s, x) => s + x.lat, 0) / group.length;
      const lng = group.reduce((s, x) => s + x.lng, 0) / group.length;

      let icon: L.DivIcon;
      if (group.length > 1) {
        const cfg = { police: { bg: "#1565c0", text: "🚔" }, bell: { bg: "#2e7d32", text: "🔔" }, traffic: { bg: "#e65100", text: "🚦" }, restroom: { bg: "#00695c", text: "🚻" } };
        const c = cfg[primary.type] ?? cfg.bell;
        icon = L.divIcon({
          html: `<div style="position:relative;width:28px;height:28px">
            <div style="width:28px;height:28px;border-radius:50%;background:${c.bg};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white">${c.text}</div>
            <div style="position:absolute;top:-4px;right:-4px;background:#EA1E2F;color:white;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:1.5px solid white">${group.length}</div>
          </div>`,
          className: "", iconAnchor: [14, 14],
        });
      } else {
        icon = makeInfraIcon(primary.type);
      }

      const m = L.marker([lat, lng], {
        icon,
        zIndexOffset: primary.type === "police" ? 800 : 200,
      }).addTo(map);

      const popupLines = sorted.map(im => {
        if (im.type === "police" && im.name) {
          const phone = im.phone ? ` <a href="tel:${im.phone}" style="color:#1565c0">☎ ${im.phone}</a>` : "";
          const addr  = im.address ? `<div style="font-size:10px;color:#888">${im.address}</div>` : "";
          return `<div style="margin-bottom:4px"><b style="font-family:'Jua',sans-serif;font-size:12px;color:#1565c0">🚔 ${im.name}</b>${addr}${phone}</div>`;
        }
        if (im.type === "bell") return `<div style="font-family:'Jua',sans-serif;font-size:12px;color:#2e7d32">🔔 안전벨</div>`;
        if (im.type === "traffic") return `<div style="font-family:'Jua',sans-serif;font-size:12px;color:#e65100">🚦 신호등</div>`;
        if (im.type === "restroom") return `<div style="font-family:'Jua',sans-serif;font-size:12px;color:#00695c">🚻 공공화장실</div>`;
        return "";
      }).join("");
      m.bindPopup(popupLines, { maxWidth: 220 });

      infraMarkersRef.current.push(m);
    }
  }, [infraKey]);

  // 1. centerTo 위치 변경 감지 및 지도 이동
const c0 = centerTo?.[0];
const c1 = centerTo?.[1];
const multiRoutesCount = multiRoutes?.length ?? 0;

useEffect(() => {
  if (!mapRef.current || !centerTo) return;
  if (multiRoutesCount > 0) return;
  if (followGps) return;

  setViewSafe(centerTo, zoom, { animate: true });
}, [c0, c1, zoom, followGps, multiRoutesCount]);

// 2. 경로 바운드에 맞춰 지도 영역 조정 (fitBounds)
const didFitRef = useRef(false);
const prevBoundsRef = useRef(routeBounds);

useEffect(() => {
  if (!mapRef.current || !routeBounds || routeBounds.length < 2) {
    didFitRef.current = false; // 경로가 사라지면 다음 경로를 위해 플래그 초기화
    return;
  }

  // 경로 데이터가 이전과 달라졌다면 플래그 초기화
  if (prevBoundsRef.current !== routeBounds) {
    didFitRef.current = false;
    prevBoundsRef.current = routeBounds;
  }

  if (didFitRef.current) return;
  didFitRef.current = true;

  const bounds = L.latLngBounds(routeBounds.map((c) => L.latLng(c[0], c[1])));
  fitBoundsSafe(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
}, [routeBounds]);

// 3. 사용자 GPS 위치 마커 표시 및 위치 추적
const lastPanRef = useRef<[number, number] | null>(null);

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!userGpsPos) {
    gpsMarkerRef.current?.remove();
    gpsMarkerRef.current = null;
    return;
  }

  if (!gpsMarkerRef.current) {
    gpsMarkerRef.current = L.marker(userGpsPos, {
      icon: makeGpsDot(),
      zIndexOffset: 2000,
    }).addTo(map);
  } else {
    gpsMarkerRef.current.setLatLng(userGpsPos);
  }

  if (followGps) {
    const [lat, lng] = userGpsPos;
    const prev = lastPanRef.current;
    const moved =
      !prev || Math.abs(lat - prev[0]) + Math.abs(lng - prev[1]) > 0.000027;

    if (moved) {
      lastPanRef.current = userGpsPos;
      if (followZoom !== undefined) {
        map.flyTo([lat, lng], followZoom, {
          animate: true,
          duration: 1.0,
          easeLinearity: 0.5,
        });
      } else {
        map.panTo([lat, lng], {
          animate: true,
          duration: 0.8,
          easeLinearity: 0.5,
        });
      }
    }
  } else {
    // GPS 추적 off 시 마지막 위치 기록 초기화 -> 다시 켰을 때 즉시 추적 시작
    lastPanRef.current = null;
  }
}, [userGpsPos, followGps, followZoom]);

return (
  <div
    className="absolute inset-0 overflow-hidden"
    style={{ width: "100%", height: "100%" }}
  >
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
    {lampCount !== undefined && (
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 12,
          zIndex: 900,
          background: "rgba(30,30,30,0.82)",
          backdropFilter: "blur(6px)",
          borderRadius: 12,
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,220,50,0.3)",
        }}
      >
        <span style={{ fontSize: 16 }}>💡</span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              fontFamily: "'Jua', sans-serif",
              fontSize: 13,
              color: "#ffe066",
              fontWeight: "bold",
            }}
          >
            {lampCount}개
          </span>
          <span
            style={{
              fontFamily: "'Jua', sans-serif",
              fontSize: 10,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            가로등
          </span>
        </div>
      </div>
    )}
  </div>
);
}
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`;
    const res = await fetch(url, { headers: { "Accept-Language": "ko" } });
    if (!res.ok) throw new Error("fail");
    const data = await res.json();
    const addr = data.address ?? {};
    const parts = [addr.road ?? addr.pedestrian ?? addr.footway, addr.neighbourhood ?? addr.suburb, addr.city_district ?? addr.borough, addr.city].filter(Boolean);
    return parts.slice(0, 3).join(" ") || data.display_name?.slice(0, 40) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export type NavState = "idle" | "search-origin" | "search-dest" | "route-results" | "navigating";

interface MapMarker {
  lat: number;
  lng: number;
  type: string;
  color?: string;
  icon?: string;
  clusterCount?: number;
}

interface SearchOverlayProps {
  mode: "origin" | "dest";
  initial: string;
  onConfirm: (place: Place) => void;
  onBack: () => void;
}

export function SearchOverlay({ mode, initial, onConfirm, onBack }: SearchOverlayProps) {
  const [query, setQuery]             = useState(initial);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [pickPin, setPickPin]         = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [searching, setSearching]     = useState(false);
  const [userPos, setUserPos]         = useState<[number, number] | undefined>(undefined);
  const inputRef                      = useRef<HTMLInputElement>(null);
  const searchTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOrigin = mode === "origin";
  const themeColor = isOrigin ? "#b25e09" : "#EA1E2F";
  const label = isOrigin ? "출발지" : "도착지";

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      );
    }
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof searchPlaces === "function") {
      const local = searchPlaces(query);
      setSuggestions(local || []);
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = query.trim();
    if (q.length < 2) { setSearching(false); return; }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        if (typeof fetchNominatimPlaces === "function") {
          const remote = await fetchNominatimPlaces(q);
          setSuggestions(prev => {
            const names = new Set(prev.map(p => p.name));
            return [...prev, ...(remote || []).filter(p => !names.has(p.name))].slice(0, 8);
          });
        }
      } catch (err) {
        console.error("Search fetch error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query]);

  async function handleMapClick(lat: number, lng: number) {
    const tempAddress = `선택한 위치 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    setPickPin({ lat, lng, address: tempAddress });
    setQuery(tempAddress);
    setSuggestions([]);
    setLoading(true);

    try {
      if (typeof reverseGeocode === "function") {
        const address = await reverseGeocode(lat, lng);
        const finalAddress = address || tempAddress;
        setPickPin({ lat, lng, address: finalAddress });
        setQuery(finalAddress);
      }
    } catch (err) {
      console.error("Reverse geocode error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSetCurrentLocation() {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 위치 서비스를 지원하지 않습니다.");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserPos([latitude, longitude]);
        await handleMapClick(latitude, longitude);
      },
      (error) => {
        setLoading(false);
        console.error("GPS Error:", error);
        alert("현재 위치를 가져올 수 없습니다. 위치 권한 설정을 확인해 주세요.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  function confirmPin() {
    if (!pickPin) return;
    onConfirm({ name: pickPin.address, address: pickPin.address, lat: pickPin.lat, lng: pickPin.lng });
  }

  function confirmSuggestion(p: Place) {
    onConfirm(p);
  }

  const markers: MapMarker[] = pickPin ? [{ lat: pickPin.lat, lng: pickPin.lng, type: "pick" }] : [];
  const centerTo: [number, number] | undefined = pickPin ? [pickPin.lat, pickPin.lng] : undefined;

  const CARD   = "#fff3c5";
  const BORDER = "#e8d48a";
  const juaStyle = typeof jua !== "undefined" ? jua : {};

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
        style={{
          background: CARD,
          boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
          paddingTop: "max(56px, env(safe-area-inset-top, 56px))",
          paddingBottom: 12,
          borderBottom: `1px solid ${BORDER}`,
        }}>
        <button onClick={onBack} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full active:opacity-60"
          style={{ background: "#b25e0918", border: "1px solid #b25e0928" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="#b25e09" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="shrink-0 w-3 h-3 rounded-full" style={{ background: themeColor }}/>
        <span style={{ ...juaStyle, fontSize: 13, color: "#a07030", minWidth: 32 }}>{label}</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setPickPin(null); }}
          placeholder={`${label}를 검색하거나 지도를 누르세요`}
          className="flex-1 min-w-0 outline-none bg-transparent"
          style={{ ...juaStyle, fontSize: 16, color: "#3a2a10" }}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
        {searching && (
          <div className="shrink-0 w-4 h-4 rounded-full border-2 border-[#b25e09]/30 border-t-[#b25e09] animate-spin" />
        )}
        {query && (
          <button onMouseDown={e => { e.preventDefault(); setQuery(""); setPickPin(null); setSuggestions([]); }}
            className="shrink-0 w-6 h-6 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#b0976a" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0" style={{ isolation: "isolate" }}>
          <InteractiveMap onMapClick={handleMapClick} markers={markers} centerTo={centerTo ?? userPos} zoom={17}/>
        </div>

        {loading && (
          <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full pointer-events-none"
            style={{ background: "rgba(178,94,9,0.88)", zIndex: 1000 }}>
            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin"/>
            <span style={{ ...juaStyle, fontSize: 11, color: "white" }}>위치 확인 중...</span>
          </div>
        )}

        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div key="sugg"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
              className="absolute top-0 left-0 right-0 overflow-y-auto"
              style={{ maxHeight: 300, zIndex: 1000, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, background: CARD, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", border: `1px solid ${BORDER}` }}>
              {suggestions.map((p, i) => (
                <button key={i} onMouseDown={e => { e.preventDefault(); confirmSuggestion(p); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-yellow-100 transition-colors"
                  style={{ borderBottom: i < suggestions.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div className="shrink-0"><PawIcon size={30} color={themeColor}/></div>
                  <div className="flex-1 min-w-0">
                    <p style={{ ...juaStyle, fontSize: 15, color: "#3a2a10", margin: 0 }}>{p.name}</p>
                    <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#a07030", margin: 0, marginTop: 1 }} className="truncate">{p.address}</p>
                  </div>
                  <span style={{ color: "#c0976a", fontSize: 18 }}>›</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!pickPin && suggestions.length === 0 && (
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none" style={{ zIndex: 1000 }}>
            <button
              className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full active:opacity-70 disabled:opacity-50 transition-all"
              style={{ background: "#2979ff", boxShadow: "0 3px 14px rgba(41,121,255,0.35)", border: "none" }}
              disabled={loading}
              onClick={handleSetCurrentLocation}
            >
              {loading ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3.5" fill="white"/>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="12" r="7" stroke="white" strokeWidth="2" fill="none"/>
                </svg>
              )}
              <p style={{ ...juaStyle, fontSize: 13, color: "white", margin: 0 }}>
                {loading ? "위치 찾는 중..." : "현재위치로 설정"}
              </p>
            </button>

            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full"
              style={{ background: "rgba(255,243,197,0.96)", boxShadow: "0 3px 12px rgba(0,0,0,0.14)", border: `1px solid ${BORDER}` }}>
              <PawIcon size={18} color={themeColor}/>
              <p style={{ ...juaStyle, fontSize: 13, color: "#7a5020", margin: 0 }}>지도를 눌러 위치를 선택하세요</p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {pickPin && (
          <motion.div key="confirm"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="flex-none px-4 pt-4 pb-5"
            style={{ background: CARD, borderTop: `1.5px solid ${BORDER}`, boxShadow: "0 -4px 18px rgba(0,0,0,0.10)", zIndex: 1001 }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0"><PawIcon size={42} color={themeColor}/></div>
              <div className="flex-1 min-w-0">
                <p style={{ ...juaStyle, fontSize: 12, color: "#a07030", margin: 0 }}>{label} 선택됨</p>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#3a2a10", margin: 0, marginTop: 2, lineHeight: 1.4 }}>{pickPin.address}</p>
              </div>
            </div>
            <button
              onClick={confirmPin}
              className="w-full py-3.5 rounded-[14px] flex items-center justify-center gap-2 transition-opacity active:opacity-75"
              style={{ background: themeColor }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ ...juaStyle, fontSize: 15, color: "white" }}>{label}로 설정</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwipeableSheet({ children }: { children: React.ReactNode }) {
  const SNAP_OPEN   = 38;
  const SNAP_PEEK   = 60;
  const SNAP_CLOSED = 80;

  const [snapY, setSnapY]     = useState(SNAP_OPEN);
  const [dragging, setDragging] = useState(false);
  const startY    = useRef(0);
  const startSnap = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true);
    startY.current    = e.clientY;
    startSnap.current = snapY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dy  = e.clientY - startY.current;
    const pct = startSnap.current + (dy / window.innerHeight) * 100;
    setSnapY(Math.max(SNAP_OPEN, Math.min(SNAP_CLOSED, pct)));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    const snaps   = [SNAP_OPEN, SNAP_PEEK, SNAP_CLOSED];
    const nearest = snaps.reduce((a, b) => Math.abs(a - snapY) < Math.abs(b - snapY) ? a : b);
    setSnapY(nearest);
  }

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0,
      top: `${snapY}%`,
      background: "#f5f5f5",
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
      transition: dragging ? "none" : "top 0.32s cubic-bezier(0.32,0.72,0,1)",
      zIndex: 20, display: "flex", flexDirection: "column",
    }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ flexShrink: 0, cursor: "ns-resize", touchAction: "none", paddingBottom: 4, position: "relative" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#ccc" }} />
        </div>
        <div style={{ position: "absolute", right: 14, top: 8, display: "flex", gap: 6 }}>
          {snapY > SNAP_OPEN && (
            <button onClick={() => setSnapY(SNAP_OPEN)}
              style={{ background: "rgba(46,125,50,0.12)", border: "none", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#2e7d32" }}>목록 ↑</span>
            </button>
          )}
          {snapY < SNAP_CLOSED && (
            <button onClick={() => setSnapY(SNAP_CLOSED)}
              style={{ background: "rgba(0,0,0,0.07)", border: "none", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#666" }}>지도 ↓</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}
        className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {children}
      </div>
    </div>
  );
}

// ─── RouteResultsSheet Component ──────────────────────────────────────────────
interface RouteResultsProps {
  origin: Place;
  dest: Place;
  onSelectRoute: (route: SafeRoute, travelMode: "walk" | "drive") => void;
  onBack: () => void;
}

export function RouteResultsSheet({ origin, dest, onSelectRoute, onBack }: RouteResultsProps) {
  type TravelMode = "walk" | "drive";
  const [travelMode, setTravelMode] = useState<TravelMode>("walk");
  const [modeLoading, setModeLoading] = useState(false);
  const [modeLoadingType, setModeLoadingType] = useState<TravelMode>("walk");
  const [showBackDialog, setShowBackDialog] = useState(false);

  function switchMode(m: TravelMode) {
    if (m === travelMode || modeLoading) return;
    setModeLoadingType(m);
    setModeLoading(true);
    setTimeout(() => { setTravelMode(m); setModeLoading(false); }, 1200);
  }

  const [communityOn, setCommunityOn] = useState(true);
  const [routes, setRoutes] = useState<SafeRoute[]>([]);

  useEffect(() => {
    let isMounted = true;
    generateRoutes(origin, dest, []).then(res => {
      if (isMounted) setRoutes(res);
    });
    return () => { isMounted = false; };
  }, [origin, dest]);

  function toggleCommunity() {
    const next = !communityOn;
    setCommunityOn(next);
    setIncludeCommunity(next);
    setConfirmedId(null);
  }

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const [realCoords, setRealCoords] = useState<([number, number][] | null)[]>([null, null, null]);
  const [realMeta, setRealMeta] = useState<({ distanceM: number; durationS: number } | null)[]>([null, null, null]);
  const [trafficLights, setTrafficLights] = useState<[number, number][]>([]);
  const [routeLoading, setRouteLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const [driveRoutes, setDriveRoutes] = useState<DriveRoute[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const driveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    generateDriveRoutes(origin, dest).then(r => setDriveRoutes(r));
  }, [origin, dest]);

  useEffect(() => {
    if (travelMode !== "drive") return;
    driveAbortRef.current?.abort();
    const ctrl = new AbortController();
    driveAbortRef.current = ctrl;
    setDriveLoading(true);

    const midLat = (origin.lat + dest.lat) / 2;
    const midLng = (origin.lng + dest.lng) / 2;
    const generalWP: [number, number] = [midLat + 0.007, midLng + 0.011];
    const scenicWP:  [number, number] = [midLat - 0.011, midLng - 0.007];

    Promise.all([
      fetchDriveRoute([[origin.lat, origin.lng], [dest.lat, dest.lng]], ctrl.signal),
      fetchDriveRoute([[origin.lat, origin.lng], generalWP, [dest.lat, dest.lng]], ctrl.signal),
      fetchDriveRoute([[origin.lat, origin.lng], scenicWP,  [dest.lat, dest.lng]], ctrl.signal),
    ]).then(([da, db, dc]) => {
      if (ctrl.signal.aborted) return;
      setDriveRoutes(prev => prev.map((r, i) => {
        const res = [da, db, dc][i];
        if (!res) return r;
        const distKm  = (res.distanceM / 1000).toFixed(1);
        const durMin  = Math.max(1, Math.round(res.durationS * 1.25 / 60));
        const fuelEst = `약 ${Math.round(res.distanceM / 1000 * 130)}원`;
        const tollEst = i === 0 ? "약 0원" : "0원 (무료)";
        return { ...r, coords: res.coords, distance: `${distKm}km`, duration: `약 ${durMin}분`, fuelEst, tollEst };
      }));
      setDriveLoading(false);
    }).catch(() => { if (!ctrl.signal.aborted) setDriveLoading(false); });

    return () => ctrl.abort();
  }, [travelMode, origin.lat, origin.lng, dest.lat, dest.lng]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRouteLoading(true);
    setRealCoords([null, null, null]);
    setRealMeta([null, null, null]);

    const minLat = Math.min(origin.lat, dest.lat);
    const maxLat = Math.max(origin.lat, dest.lat);
    const minLng = Math.min(origin.lng, dest.lng);
    const maxLng = Math.max(origin.lng, dest.lng);

    const midLat = (origin.lat + dest.lat) / 2;
    const midLng = (origin.lng + dest.lng) / 2;

    const [polLat, polLng] = nearestPoliceStation(midLat, midLng);
    const safeWP: [number, number] = [
      midLat + (polLat - midLat) * 0.3,
      midLng + (polLng - midLng) * 0.3,
    ];

    const dLat = dest.lat - origin.lat;
    const dLng = dest.lng - origin.lng;
    const len   = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
    const balancedWP: [number, number] = [
      midLat + (-dLng / len) * 0.0036,
      midLng + ( dLat / len) * 0.0036,
    ];

    Promise.all([
      fetchOsrmRouteWith(OSRM_FOOT, [[origin.lat, origin.lng], safeWP,     [dest.lat, dest.lng]], ctrl.signal),
      fetchOsrmRouteWith(OSRM_FOOT, [[origin.lat, origin.lng], balancedWP,  [dest.lat, dest.lng]], ctrl.signal),
      fetchOsrmRouteWith(OSRM_FOOT, [[origin.lat, origin.lng],              [dest.lat, dest.lng]], ctrl.signal),
      fetchTrafficLights(minLat, minLng, maxLat, maxLng, ctrl.signal),
      prefetchEnvData(minLat, minLng, maxLat, maxLng, ctrl.signal),
    ]).then(([routeA, routeB, routeC, lights]) => {
      if (ctrl.signal.aborted) return;

      const fallback = routeC ?? routeB ?? routeA;
      const resolved = [
        routeA ?? fallback,
        routeB ?? fallback,
        routeC ?? fallback,
      ];

      setRealCoords(resolved.map(r => r?.coords ?? null));
      setRealMeta(resolved.map(r =>
        r ? { distanceM: r.distanceM, durationS: r.durationS } : null
      ));
      setTrafficLights(lights as [number, number][]);
      setRouteLoading(false);
    }).catch(() => setRouteLoading(false));

    return () => ctrl.abort();
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  const routeMarkers: MapMarker[] = [
    { lat: origin.lat, lng: origin.lng, type: "origin" },
    { lat: dest.lat,   lng: dest.lng,   type: "dest" },
  ];

  const infraMarkers = useMemo<InfraMarker[]>(() => {
    const minLat = Math.min(origin.lat, dest.lat);
    const maxLat = Math.max(origin.lat, dest.lat);
    const minLng = Math.min(origin.lng, dest.lng);
    const maxLng = Math.max(origin.lng, dest.lng);
    const PAD = 0.05;

    const police: InfraMarker[] = NAMED_POLICE_STATIONS
      .filter(p =>
        p.lat >= minLat - PAD && p.lat <= maxLat + PAD &&
        p.lng >= minLng - PAD && p.lng <= maxLng + PAD
      )
      .map(p => ({ lat: p.lat, lng: p.lng, type: "police" as const, name: p.name, address: p.address, phone: p.phone }));

    const bells: InfraMarker[] = getBellsInBbox(minLat, minLng, maxLat, maxLng, 0.2)
      .map(([lat, lng]) => ({ lat, lng, type: "bell" as const }));

    const lights: InfraMarker[] = trafficLights
      .map(([lat, lng]) => ({ lat, lng, type: "traffic" as const }));

    return [...police, ...bells, ...lights];
  }, [origin.lat, origin.lng, dest.lat, dest.lng, trafficLights]);

  const activeId = confirmedId ?? hoveredId;
  const multiRoutes = useMemo<MultiRouteCoord[]>(() => {
    if (routeLoading || realCoords.every(c => c === null)) return [];

    const getCoords = (i: number): [number, number][] =>
      realCoords[i] ?? realCoords.find(c => c !== null) ?? [];

    if (confirmedId) {
      const r = routes.find(x => x.id === confirmedId);
      if (!r) return [];
      const idx = routes.findIndex(x => x.id === confirmedId);
      const coords = getCoords(idx);
      if (coords.length < 2) return [];
      return [{ coords, color: r.color, weight: 9, opacity: 1 }];
    }
    return routes.map((r, i) => {
      const coords = getCoords(i);
      if (coords.length < 2) return null;
      return {
        coords,
        color: r.color,
        weight: activeId === r.id ? 8 : 5,
        opacity: activeId === r.id ? 1.0 : 0.65,
      };
    }).filter((r): r is MultiRouteCoord => r !== null);
  }, [confirmedId, activeId, realCoords, routeLoading, routes]);

  const [driveHoveredId, setDriveHoveredId]     = useState<string | null>(null);
  const [driveConfirmedId, setDriveConfirmedId] = useState<string | null>(null);
  const driveActiveId = driveConfirmedId ?? driveHoveredId;

  const driveMultiRoutes = useMemo<MultiRouteCoord[]>(() => {
    if (driveConfirmedId) {
      const r = driveRoutes.find(x => x.id === driveConfirmedId);
      if (!r) return [];
      return [{ coords: r.coords, color: r.color, weight: 7, opacity: 1 }];
    }
    return driveRoutes.map((r) => ({
      coords: r.coords,
      color: r.color,
      weight: driveActiveId === r.id ? 6 : 3,
      opacity: driveActiveId === r.id ? 0.9 : 0.35,
    }));
  }, [driveConfirmedId, driveActiveId, driveRoutes]);

  return (
    <div className="absolute inset-0" style={{ zIndex: 100 }}>
      <style>{`
        @keyframes score-glow {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>

      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <InteractiveMap
          markers={routeMarkers}
          multiRoutes={travelMode === "drive" ? driveMultiRoutes : multiRoutes}
          infraMarkers={travelMode === "walk" ? infraMarkers : undefined}
          disableClick
        />
      </div>

      <button onClick={() => setShowBackDialog(true)}
        className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full shadow-md active:opacity-70"
        style={{ background: "white", zIndex: 50 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div 
        className="flex items-center justify-between px-4 pb-3 shadow-md bg-white"
        style={{ paddingTop: "max(env(safe-area-inset-top), 64px)", borderBottom: "1px solid #eaeaea" }}
      >
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#333" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <div className="flex gap-2 items-center text-sm font-bold">
          <span className="text-green-600">{origin.name}</span>
          <span>→</span>
          <span className="text-red-600">{dest.name}</span>
        </div>
        <div className="w-9" />
      </div>

      <SwipeableSheet>
        <div className="px-4 pb-2 pt-1 flex gap-2">
          <button
            onClick={() => switchMode("walk")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[14px] transition-all active:scale-95"
            style={{
              background: travelMode === "walk" ? "#2e7d32" : "white",
              border: travelMode === "walk" ? "none" : "1.5px solid #e0e0e0",
              boxShadow: travelMode === "walk" ? "0 3px 12px rgba(46,125,50,0.35)" : "none",
            }}
          >
            <span style={{ fontSize: 18 }}>🚶</span>
            <span style={{ ...jua, fontSize: 14, color: travelMode === "walk" ? "white" : "#666" }}>도보</span>
          </button>
          <button
            onClick={() => switchMode("drive")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[14px] transition-all active:scale-95"
            style={{
              background: travelMode === "drive" ? "#1565c0" : "white",
              border: travelMode === "drive" ? "none" : "1.5px solid #e0e0e0",
              boxShadow: travelMode === "drive" ? "0 3px 12px rgba(21,101,192,0.35)" : "none",
            }}
          >
            <span style={{ fontSize: 18 }}>🚗</span>
            <span style={{ ...jua, fontSize: 14, color: travelMode === "drive" ? "white" : "#666" }}>주행</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {travelMode === "walk" && (
            <motion.div key="walk-routes"
              initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50">
                <div className="text-xs text-gray-500 font-bold mb-1">AI 추천 경로 3개 선택 가능</div>
                {routes.map((r) => {
                  const isSelected = confirmedId === r.id;
                  const isTopScore = r.isSafest || r.safetyScore === Math.max(...routes.map(x => x.safetyScore));
                  const f = r.factors;
                  const fEx = f as typeof f & { cctv?: number; crime?: number; community?: number };
                  const factorRows = [
                    { label: "파출소", icon: "🚔", value: f.police ?? 80 },
                    { label: "가로등", icon: "💡", value: f.lighting ?? 80 },
                    { label: "CCTV", icon: "📹", value: fEx.cctv ?? f.bell ?? 70 },
                    { label: "유동인구", icon: "👥", value: f.crowd ?? 50 },
                    { label: "범죄역산", icon: "🛡️", value: fEx.crime ?? 60 },
                    { label: "시간대", icon: "🕐", value: f.time ?? 80 },
                    { label: "커뮤니티", icon: "📍", value: fEx.community ?? f.bell ?? 70 },
                  ];

                  return (
                    <div
                      key={r.id}
                      onClick={() => setConfirmedId(r.id)}
                      className="rounded-[24px] overflow-hidden bg-white shadow-md border transition-all cursor-pointer"
                      style={{
                        borderColor: isSelected ? r.color : "#f0f0f0",
                        boxShadow: isSelected ? `0 8px 20px ${r.color}25` : "0 2px 8px rgba(0,0,0,0.05)",
                      }}
                    >
                      {/* 상단 컬러 헤더 영역 */}
                      <div className="p-4 text-white relative" style={{ background: r.color }}>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1 pr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-lg leading-tight">{r.label}</span>
                              {isTopScore && (
                                <span className="bg-white/25 text-white font-bold text-[11px] px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                                  ⭐ AI추천
                                </span>
                              )}
                              {isSelected && (
                                <span className="text-white font-bold text-[11px]">✓ 선택됨</span>
                              )}
                            </div>
                            <p className="text-xs text-white/80 font-medium">{r.tagline}</p>
                          </div>

                          {/* 안전점수 원형 배지 */}
                          <div className="w-16 h-16 rounded-full border-2 border-white/60 bg-white/15 backdrop-blur-md flex flex-col items-center justify-center shrink-0">
                            <span className="text-2xl font-black leading-none text-white">{r.safetyScore}</span>
                            <span className="text-[9px] font-bold text-white/80 mt-0.5">안전점수</span>
                          </div>
                        </div>

                        {/* 헤더 하단 게이지 바 */}
                        <div className="w-full h-1.5 bg-white/25 rounded-full mt-3.5 overflow-hidden">
                          <div
                            className="h-full bg-white/90 rounded-full transition-all duration-500"
                            style={{ width: `${r.safetyScore}%` }}
                          />
                        </div>
                      </div>

                      {/* 바디 영역 */}
                      <div className="p-4 flex flex-col gap-3.5">
                        <div className="flex items-center gap-3 text-sm font-bold text-gray-800">
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60 text-xs font-extrabold">
                            <span>🚶</span>
                            <span>도보</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">🕒</span>
                            <span>{r.duration}</span>
                          </div>
                          <span className="text-gray-300">→</span>
                          <div className="text-gray-700 font-extrabold">{r.distance}</div>
                        </div>

                        {/* ZIP_R0 AI 안전 분석 세부 항목 */}
                        <div className="flex flex-col gap-1.5 pt-1">
                          <span className="text-[11px] font-bold text-gray-400 mb-0.5">ZIP_R0 AI 안전 분석</span>
                          {factorRows.map((row) => (
                            <div key={row.label} className="flex items-center gap-2 text-xs">
                              <div className="w-20 flex items-center gap-1.5 font-bold text-gray-700 shrink-0">
                                <span className="text-sm">{row.icon}</span>
                                <span>{row.label}</span>
                              </div>
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${row.value}%`,
                                    background: row.value >= 70 ? r.color : row.value >= 50 ? "#f59e0b" : "#ef4444",
                                  }}
                                />
                              </div>
                              <span className="w-6 text-right font-bold text-gray-400 text-[11px]">
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 태그 영역 */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {r.safetyTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* 선택 시 안내 시작 버튼 */}
                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRoute(r, travelMode);
                            }}
                            className="w-full py-3.5 mt-1 rounded-xl text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                            style={{ background: r.color }}
                          >
                            <span>🚶</span>
                            <span>도보 안내 시작</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {travelMode === "drive" && (
            <motion.div key="drive-routes"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22 }}>
              <div className="p-4 flex flex-col gap-3">
                {driveRoutes.map((r) => {
                  const isSelected = driveConfirmedId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setDriveConfirmedId(r.id)}
                      className="p-4 rounded-2xl bg-white shadow-sm border-2 cursor-pointer"
                      style={{ borderColor: isSelected ? r.color : "transparent" }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-base" style={{ color: r.color }}>{r.label}</span>
                        <span className="text-sm font-bold text-blue-600">{r.duration}</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{r.tagline}</p>
                      {isSelected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const sr: SafeRoute = {
                              id: r.id, label: r.label, tagline: r.tagline,
                              duration: r.duration, distance: r.distance,
                              safetyScore: 80, safetyTags: r.tags,
                              color: r.color, isSafest: false, isFastest: r.isFastest,
                              steps: r.steps,
                              factors: { police: 50, bell: 50, lighting: 70, crowd: 60, time: 70, composite: 65 },
                            };
                            onSelectRoute(sr, "drive");
                          }}
                          className="w-full py-2.5 rounded-xl text-white font-bold text-sm shadow-md mt-2"
                          style={{ background: r.color }}
                        >
                          {r.isTaxi ? "택시 안내 시작" : "주행 안내 시작"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SwipeableSheet>
    </div>
  );
}

// ─── NavigationView Component ────────────────────────────────────────────────
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
  onBackToRoutes?: () => void;
  onEmergency?: () => void;
  onNavigate?: (s: string) => void;
  travelMode?: "walk" | "drive";
}

const OBSTACLES = [
  { id: 1, type: "공사중", desc: "전방 50m 도로 공사", icon: "🚧" },
  { id: 2, type: "야간 주의", desc: "가로등 없는 구역", icon: "🌑" },
  { id: 3, type: "CCTV 없음", desc: "음영 구역 통과", icon: "📵" },
];

export function NavigationView({ route, origin, dest, onEnd, onBackToRoutes, onEmergency, onNavigate, travelMode = "walk" }: NavigationViewProps) {
  const [stepIdx, setStepIdx]       = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [started, setStarted]       = useState(false);
  const [monitoringReqSent, setMonitoringReqSent] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showObstacles, setShowObstacles] = useState(false);
  const [emergencyState, setEmergencyState] = useState<NavEmergencyState>(null);
  const [emergencyCountdown, setEmergencyCountdown] = useState(5);
  const emergencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [realWalkCoords, setRealWalkCoords] = useState<[number, number][] | null>(null);
  const [walkRouteLoading, setWalkRouteLoading] = useState(true);

  const [userGpsPos, setUserGpsPos]   = useState<[number, number] | null>(null);
  const [followGps, setFollowGps]     = useState(false);
  const [gpsError, setGpsError]       = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const midLat = (origin.lat + dest.lat) / 2;
  const midLng = (origin.lng + dest.lng) / 2;
  const weather = useWeather(
    userGpsPos ? userGpsPos[0] : midLat,
    userGpsPos ? userGpsPos[1] : midLng,
  );
  const [weatherDismissed, setWeatherDismissed] = useState(false);

  const isTaxiMode = travelMode === "drive" && route.id === "DB";

  useEffect(() => {
    const ctrl = new AbortController();
    setWalkRouteLoading(true);

    const fetchRoute = async () => {
      try {
        let coords: [number, number][] | null = null;
        if (travelMode === "drive") {
          const result = await fetchDriveRoute([[origin.lat, origin.lng], [dest.lat, dest.lng]], ctrl.signal);
          coords = result ? result.coords : null;
        } else if (route.id === "A") {
          const alts = await fetchOsrmAlternatives([[origin.lat, origin.lng], [dest.lat, dest.lng]], ctrl.signal);
          coords = alts[1] ?? alts[0] ?? null;
          if (!coords) coords = await fetchOsrmRoute([[origin.lat, origin.lng], [dest.lat, dest.lng]], ctrl.signal);
        } else {
          coords = await fetchOsrmRoute([[origin.lat, origin.lng], [dest.lat, dest.lng]], ctrl.signal);
        }
        if (!ctrl.signal.aborted) {
          setRealWalkCoords(coords);
          setWalkRouteLoading(false);
        }
      } catch {
        if (!ctrl.signal.aborted) setWalkRouteLoading(false);
      }
    };

    fetchRoute();
    return () => ctrl.abort();
  }, [origin.lat, origin.lng, dest.lat, dest.lng, route.id, travelMode]);

  const navInfraMarkers = useMemo<InfraMarker[]>(() => {
    const minLat = Math.min(origin.lat, dest.lat);
    const maxLat = Math.max(origin.lat, dest.lat);
    const minLng = Math.min(origin.lng, dest.lng);
    const maxLng = Math.max(origin.lng, dest.lng);
    const PAD = 0.05;
    return NAMED_POLICE_STATIONS
      .filter(p =>
        p.lat >= minLat - PAD && p.lat <= maxLat + PAD &&
        p.lng >= minLng - PAD && p.lng <= maxLng + PAD
      )
      .map(p => ({ lat: p.lat, lng: p.lng, type: "police" as const, name: p.name, address: p.address, phone: p.phone }));
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  useEffect(() => {
    if (!started) return;
    if (!navigator.geolocation) return;
    setFollowGps(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        setUserGpsPos([pos.coords.latitude, pos.coords.longitude]);
        setGpsError(false);
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [started]);

  function toggleFollowGps() {
    if (!userGpsPos) {
      navigator.geolocation?.getCurrentPosition(
        pos => { setUserGpsPos([pos.coords.latitude, pos.coords.longitude]); setFollowGps(true); setGpsError(false); },
        () => setGpsError(true)
      );
    } else {
      setFollowGps(f => !f);
    }
  }

  function openEmergency() {
    setEmergencyCountdown(5);
    setEmergencyState("countdown");
    let n = 5;
    emergencyTimerRef.current = setInterval(() => {
      n -= 1;
      setEmergencyCountdown(n);
      if (n <= 0) { clearInterval(emergencyTimerRef.current!); setEmergencyState("submitted"); }
    }, 1000);
  }
  function cancelEmergency() {
    if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
    navSosAlarm.stop();
    setEmergencyState(null);
    setEmergencyCountdown(5);
  }
  function immediateReport() {
    if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
    setEmergencyState("submitted");
  }
  function activateSosBell() { navSosAlarm.start(); setEmergencyState("sos-ringing"); }

  useEffect(() => () => { if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current); navSosAlarm.stop(); }, []);

  const totalMin = parseInt(route.duration.replace(/[^0-9]/g, "")) || 15;

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setElapsed(s => s + 1), 60_000);
    return () => clearInterval(t);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      setStepIdx(s => Math.min(route.steps.length - 1, s + 1));
    }, 30_000);
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

  const navRouteCoords: [number, number][] = realWalkCoords ?? [
    [origin.lat, origin.lng],
    [dest.lat, dest.lng]
  ];

  const snappedIdx: number | null = useMemo(() => {
    if (!userGpsPos) return null;
    let best = 0;
    let bestDist = Infinity;
    navRouteCoords.forEach(([lat, lng], i) => {
      const d = (lat - userGpsPos[0]) ** 2 + (lng - userGpsPos[1]) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }, [userGpsPos, navRouteCoords]);

  const progressIdx = snappedIdx
    ?? Math.min(Math.floor(progress * (navRouteCoords.length - 1)), navRouteCoords.length - 1);

  const progressCoord: [number, number] = navRouteCoords[progressIdx] ?? [origin.lat, origin.lng];

  const traveledCoords = navRouteCoords.slice(0, progressIdx + 1);
  const remainingCoords = navRouteCoords.slice(progressIdx);

  const navMultiRoutes: MultiRouteCoord[] = started
    ? [
        { coords: traveledCoords.length > 1 ? traveledCoords : navRouteCoords.slice(0, 2), color: "#aaaaaa", weight: 5, opacity: 0.5 },
        { coords: remainingCoords.length > 1 ? remainingCoords : navRouteCoords.slice(-2), color: route.color, weight: 7, opacity: 0.95 },
      ]
    : [{ coords: navRouteCoords, color: route.color, weight: 6, opacity: 0.85 }];

  const dirArrows = ["↑","↗","→","↘","↙","←","↖","↑"];

  return (
    <div className="absolute inset-0 flex flex-col" style={{ zIndex: 100 }}>
      <AnimatePresence>
        {showExitDialog && (
          <motion.div key="nav-exit-dialog"
            className="absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 10100, background: "rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}>
            <motion.div
              className="mx-6 rounded-[22px] overflow-hidden shadow-2xl w-full"
              style={{ background: "white", maxWidth: 320 }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.18 }}>
              <div className="px-5 pt-5 pb-4 flex flex-col items-center gap-1">
                <span style={{ fontSize: 36 }}>🐾</span>
                <p style={{ ...jua, fontSize: 17, color: "#333", margin: 0, marginTop: 6, textAlign: "center" }}>안내를 종료하시겠어요?</p>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#888", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                  경로를 다시 확인하거나<br/>홈으로 돌아갈 수 있어요
                </p>
              </div>
              <div className="px-4 pb-5 flex flex-col gap-2">
                <button
                  onClick={() => { setShowExitDialog(false); if (onBackToRoutes) onBackToRoutes(); else onEnd(); }}
                  className="w-full py-3 rounded-[14px] flex items-center justify-center gap-2 active:opacity-75"
                  style={{ background: "#2e7d32" }}>
                  <span style={{ fontSize: 16 }}>🗺️</span>
                  <span style={{ ...jua, fontSize: 15, color: "white" }}>경로를 다시 볼게요</span>
                </button>
                <button
                  onClick={() => { setShowExitDialog(false); onEnd(); }}
                  className="w-full py-3 rounded-[14px] flex items-center justify-center gap-2 active:opacity-75"
                  style={{ background: "#f5f5f5" }}>
                  <span style={{ fontSize: 16 }}>🏠</span>
                  <span style={{ ...jua, fontSize: 15, color: "#555" }}>홈으로 돌아가기</span>
                </button>
                <button
                  onClick={() => setShowExitDialog(false)}
                  className="w-full py-2 active:opacity-60">
                  <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#bbb" }}>계속 안내받기</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-none"
        style={{ paddingTop: "max(env(safe-area-inset-top), 50px)", background: "transparent", position: "relative", zIndex: 10 }}>
        <div className="mx-3 mt-3 rounded-[20px] overflow-hidden shadow-2xl"
          style={{ background: "#fff9c4" }}>
          <div className="flex items-center gap-3 px-3 py-3">
            <button onClick={() => setShowExitDialog(true)}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:opacity-60"
              style={{ background: "rgba(0,0,0,0.08)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M15 6l-6 6 6 6" stroke="#5a3e00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {started && (
              <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.07)" }}>
                <span style={{ fontSize: 22, lineHeight: 1, color: "#5a3e00" }}>{dirArrows[stepIdx % 8]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {started ? (
                <>
                  <p style={{ ...jua, fontSize: 16, color: "#3a2800", margin: 0, lineHeight: 1.25 }}>{currentStep}</p>
                  {nextStep && !isDone && (
                    <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#7a6030", margin: 0, marginTop: 2 }}>
                      다음 ▸ {nextStep}
                    </p>
                  )}
                  {isDone && <p style={{ ...jua, fontSize: 14, color: "#b25e09", margin: 0 }}>🎉 목적지에 도착했습니다!</p>}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span style={{ fontSize: 13 }}>{travelMode === "drive" ? "🚗" : "🚶"}</span>
                    <p style={{ ...jua, fontSize: 14, color: "#3a2800", margin: 0 }}>{route.label}</p>
                  </div>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#7a6030", margin: 0 }}>
                    {origin.name} → {dest.name}
                  </p>
                </>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {started && (
                <>
                  <p style={{ ...jua, fontSize: 22, color: "#3a2800", margin: 0, lineHeight: 1 }}>{remaining}분</p>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#7a6030", margin: 0 }}>남은시간</p>
                </>
              )}
              {weather && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ background: weather.alerts.length > 0 ? "#fff3cd" : "rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 12 }}>{weatherIcon(weather.code)}</span>
                  <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#555" }}>{weather.temp.toFixed(0)}°C</span>
                </div>
              )}
            </div>
          </div>
          {started && (
            <div className="h-[3px]" style={{ background: "rgba(0,0,0,0.1)" }}>
              <div className="h-full transition-all duration-700"
                style={{ width: `${progress * 100}%`, background: route.color }}/>
            </div>
          )}
        </div>

        <AnimatePresence>
          {weather && weather.alerts.length > 0 && !weatherDismissed && (
            <motion.div key="weather-nav"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="mx-3 mt-2 rounded-[14px] overflow-hidden shadow-lg">
              {weather.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2"
                  style={{ background: alert.level === "danger" ? "#ffebee" : alert.level === "warning" ? "#fff8e1" : "#e8f5e9", borderBottom: i < weather.alerts.length - 1 ? "1px solid rgba(0,0,0,0.07)" : "none" }}>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: alert.level === "danger" ? "#c62828" : alert.level === "warning" ? "#e65100" : "#2e7d32", margin: 0, flex: 1, lineHeight: 1.4 }}>{alert.text}</p>
                  {i === 0 && (
                    <button onClick={() => setWeatherDismissed(true)} className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full active:opacity-60"
                      style={{ background: "rgba(0,0,0,0.12)", marginTop: 1, border: "none" }}>
                      <span style={{ fontSize: 10, color: "#555" }}>✕</span>
                    </button>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isTaxiMode && started && (
            <motion.div key="taxi-banner"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="mx-3 mt-2 rounded-[14px] shadow-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#fff3e0" }}>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <p style={{ ...jua, fontSize: 12, color: "#e65100", margin: 0, flex: 1 }}>📍 위치 공유 중 — 보호자에게 실시간 전송</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0" style={{ isolation: "isolate" }}>
          <InteractiveMap
            markers={routeMarkers}
            multiRoutes={navMultiRoutes}
            centerTo={followGps ? undefined : progressCoord}
            zoom={started ? 19 : 17}
            disableClick
            userGpsPos={userGpsPos}
            followGps={followGps}
            followZoom={started && followGps ? 19 : undefined}
            routeBounds={started ? undefined : navRouteCoords}
            infraMarkers={navInfraMarkers}
          />
        </div>

        {walkRouteLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full pointer-events-none"
            style={{ background: travelMode === "drive" ? "rgba(21,101,192,0.92)" : "rgba(46,125,50,0.92)", zIndex: 1000, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}>
            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin"/>
            <span style={{ ...jua, fontSize: 11, color: "white" }}>
              {travelMode === "drive" ? "🚗 주행 경로 계산 중..." : "🚶 실제 도보 경로 계산 중..."}
            </span>
          </div>
        )}
        {!walkRouteLoading && realWalkCoords && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full pointer-events-none"
            style={{ background: "rgba(255,255,255,0.95)", zIndex: 1000, boxShadow: "0 2px 8px rgba(0,0,0,0.18)", border: `1.5px solid ${route.color}` }}>
            <span style={{ fontSize: 12 }}>{travelMode === "drive" ? "🚗" : "🚶"}</span>
            <span style={{ ...jua, fontSize: 10, color: route.color }}>{travelMode === "drive" ? "실제 주행 경로" : "실제 도보 경로"}</span>
          </div>
        )}

        <button
          onClick={toggleFollowGps}
          className="absolute right-3 rounded-[14px] flex flex-col items-center justify-center gap-1 active:opacity-70 transition-all"
          style={{
            bottom: 16,
            width: 46,
            height: 52,
            background: followGps ? "#2979ff" : "white",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            border: followGps ? "none" : "1.5px solid #e0e0e0",
            zIndex: 1000,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3.5" fill={followGps ? "white" : "#2979ff"}/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={followGps ? "white" : "#2979ff"} strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="7" stroke={followGps ? "white" : "#2979ff"} strokeWidth="2" fill="none"/>
          </svg>
          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: followGps ? "white" : "#2979ff", lineHeight: 1 }}>
            {gpsError ? "오류" : followGps ? "추적중" : "GPS"}
          </span>
        </button>
      </div>

      <div className="flex-none" style={{ background: "white", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}>
        {showObstacles && (
          <div className="absolute right-3 rounded-[14px] overflow-hidden shadow-xl"
            style={{ bottom: "100%", marginBottom: 8, background: "white", width: 210, zIndex: 5 }}>
            <div className="px-3 py-2" style={{ background: "#e53935" }}>
              <p style={{ ...jua, fontSize: 13, color: "white", margin: 0 }}>⚠️ 경로 내 장애물</p>
            </div>
            {OBSTACLES.map((ob, i) => (
              <div key={ob.id} className="flex items-start gap-2.5 px-3 py-2"
                style={{ borderBottom: i < OBSTACLES.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                <span style={{ fontSize: 16, lineHeight: 1.3 }}>{ob.icon}</span>
                <div>
                  <p style={{ ...jua, fontSize: 12, color: "#c62828", margin: 0 }}>{ob.type}</p>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#666", margin: 0 }}>{ob.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!started && (
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3 mb-3 p-3 rounded-[14px]"
              style={{ background: route.color + "12", border: `1px solid ${route.color}28` }}>
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: route.color }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ ...jua, fontSize: 13, color: route.color, margin: 0 }}>{route.label}</p>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#666", margin: 0 }}>{route.tagline}</p>
              </div>
              <div className="shrink-0 px-2 py-0.5 rounded-full" style={{ background: route.color }}>
                <p style={{ ...jua, fontSize: 11, color: "white", margin: 0 }}>안전 {route.safetyScore}점</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: travelMode === "drive" ? "#e3f2fd" : "#e8f5e9", border: travelMode === "drive" ? "1px solid #90caf9" : "1px solid #a5d6a7" }}>
                <span style={{ fontSize: 12 }}>{travelMode === "drive" ? "🚗" : "🚶"}</span>
                <p style={{ ...jua, fontSize: 11, color: travelMode === "drive" ? "#1565c0" : "#2e7d32", margin: 0 }}>{travelMode === "drive" ? "주행" : "도보"}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke={route.color} strokeWidth="2"/>
                  <path d="M12 7v5l3 3" stroke={route.color} strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p style={{ ...jua, fontSize: 13, color: "#222", margin: 0 }}>{route.duration}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h18M13 6l6 6-6 6" stroke={route.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ ...jua, fontSize: 13, color: "#222", margin: 0 }}>{route.distance}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {route.safetyTags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full"
                    style={{ ...jua, fontSize: 10, background: route.color + "15", color: route.color }}>{tag}</span>
                ))}
              </div>
            </div>
            {walkRouteLoading && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-[10px]"
                style={{ background: travelMode === "drive" ? "#e3f2fd" : "#e8f5e9", border: travelMode === "drive" ? "1px solid #90caf9" : "1px solid #a5d6a7" }}>
                <div className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin shrink-0"
                  style={{ color: travelMode === "drive" ? "#1565c0" : "#2e7d32" }}/>
                <p style={{ ...jua, fontSize: 11, color: travelMode === "drive" ? "#1565c0" : "#2e7d32", margin: 0 }}>
                  {travelMode === "drive" ? "실제 주행 경로를 지도에 표시 중..." : "실제 도보 경로를 지도에 표시 중..."}
                </p>
              </div>
            )}
            <button onClick={() => setStarted(true)}
              className="w-full py-3.5 rounded-[14px] flex items-center justify-center gap-2 active:opacity-80"
              style={{ background: route.color }}>
              <span style={{ fontSize: 18 }}>{travelMode === "drive" ? "🚗" : "🚶"}</span>
              <span style={{ ...jua, fontSize: 16, color: "white" }}>{travelMode === "drive" ? "주행 안내 시작" : "도보 안내 시작"}</span>
            </button>
          </div>
        )}

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
                  style={{
                    ...jua, fontSize: 11,
                    background: i === stepIdx ? route.color : i < stepIdx ? route.color + "25" : "#f0f0f0",
                    color: i === stepIdx ? "white" : i < stepIdx ? route.color : "#888",
                  }}>
                  {i < stepIdx && <span style={{ fontSize: 9 }}>✓</span>}
                  {i + 1}. {s.slice(0, 8)}{s.length > 8 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 px-3 pb-5 pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button onClick={openEmergency}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70"
            style={{ background: "#fff0f0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#e53935" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#e53935", margin: 0 }}>긴급신고</p>
          </button>

          <button onClick={() => onNavigate?.("보안화면")}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70"
            style={{ background: "#f0f4ff" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#3949ab" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#3949ab", margin: 0 }}>보안화면</p>
          </button>

          <button onClick={() => onNavigate?.("커뮤니티")}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70"
            style={{ background: "#fff8f0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#f47c20" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ ...jua, fontSize: 10, color: "#f47c20", margin: 0 }}>커뮤니티</p>
          </button>

          <button
            onClick={() => { setMonitoringReqSent(true); setTimeout(() => setMonitoringReqSent(false), 3000); }}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-[13px] active:opacity-70"
            style={{ background: monitoringReqSent ? "#e8f5e9" : "#f0faf0" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: monitoringReqSent ? "#2e7d32" : "#43a047" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                {monitoringReqSent
                  ? <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  : <><circle cx="12" cy="8" r="4" stroke="white" strokeWidth="2"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/></>
                }
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
              <div className="px-3 py-2 rounded-[10px] flex items-center gap-2"
                style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L19 7" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#2e7d32", margin: 0 }}>
                  보호자에게 모니터링 신청이 전송됐습니다
                </p>
              </div>
            )}
            {started && (
              <button onClick={onEnd}
                className="w-full py-2.5 rounded-[12px] flex items-center justify-center gap-2 active:opacity-70"
                style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={{ ...jua, fontSize: 13, color: "#888" }}>안내 종료</span>
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {emergencyState && (
          <motion.div
            key="emer-popup"
            className="flex items-center justify-center px-6"
            style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.75)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>

            {emergencyState === "countdown" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <div className="text-center mb-3">
                  <span style={jua} className="text-[80px] text-[#EA1E2F] leading-none">{emergencyCountdown}</span>
                </div>
                <p style={jua} className="text-[#EA1E2F] text-[18px] tracking-[0.5px] text-center leading-normal mb-1">
                  긴급 신고 버튼을 눌렀습니다.
                </p>
                <p style={jua} className="text-[#333] text-[14px] tracking-[0.3px] text-center leading-normal mb-6">
                  취소하지 않으면 신고가 진행됩니다.
                </p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency}
                    className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70"
                    style={{ ...jua, background: "#2F2F32" }}>취소</button>
                  <button onClick={immediateReport}
                    className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70"
                    style={{ ...jua, background: "#EA1E2F" }}>즉시 신고</button>
                </div>
              </motion.div>
            )}

            {emergencyState === "submitted" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <p style={jua} className="text-[#EA1E2F] text-[20px] tracking-[0.5px] text-center leading-normal mb-3">
                  접수되었습니다
                </p>
                <p style={jua} className="text-[#333] text-[13px] tracking-[0.3px] text-center leading-relaxed mb-6">
                  현재 위치와 개인정보에 입력하신 정보가<br />가장 가까운 파출소로 전송되었습니다.
                </p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency}
                    className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70"
                    style={{ ...jua, background: "#2F2F32" }}>취소</button>
                  <button onClick={activateSosBell}
                    className="flex-1 py-3 rounded-[10px] text-white text-[16px] active:opacity-70"
                    style={{ ...jua, background: "#EA1E2F" }}>SOS벨</button>
                </div>
              </motion.div>
            )}

            {emergencyState === "sos-ringing" && (
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl">
                <div className="flex justify-center mb-4">
                  <motion.div animate={{ rotate: [0, -18, 18, -12, 12, -6, 6, 0] }}
                    transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.5 }}>
                    <svg width="56" height="60" viewBox="0 0 56 60" fill="none">
                      <path d="M28 6C28 6 10 13 10 32V44H46V32C46 13 28 6 28 6Z" fill="#EA1E2F" />
                      <rect x="22" y="1" width="12" height="6" rx="3" fill="#EA1E2F" />
                      <path d="M20 44C20 48.418 23.582 52 28 52C32.418 52 36 48.418 36 44" stroke="#EA1E2F" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  </motion.div>
                </div>
                <p style={jua} className="text-[#EA1E2F] text-[18px] tracking-[0.5px] text-center leading-normal mb-1">
                  SOS 벨이 울리고 있습니다.
                </p>
                <p style={jua} className="text-[#555] text-[13px] tracking-[0.2px] text-center leading-normal mb-5">
                  인근 시민에게 도움을 요청하십시오.
                </p>
                <div className="flex gap-3">
                  <button onClick={cancelEmergency}
                    className="flex-1 py-3 rounded-[10px] text-white text-[15px] active:opacity-70"
                    style={{ ...jua, background: "#6B6B6B" }}>재생 종료</button>
                  <button onClick={() => { navSosAlarm.stop(); navSosAlarm.start(); }}
                    className="flex-1 py-3 rounded-[10px] text-white text-[15px] active:opacity-70"
                    style={{ ...jua, background: "#EA1E2F" }}>SOS벨 연속 재생</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}