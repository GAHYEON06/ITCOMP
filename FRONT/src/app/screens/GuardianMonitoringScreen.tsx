import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import imgProfileBear from "@/imports/Community메인/36603cc534ed944df658c1944648282faded2339.png";
import imgBearNew from "@/imports/image-12.png";
import imgBearFace from "@/imports/image-19.png";
import {
  jua,
  VWORLD_KEY,
  STATUS_META,
  NOTIF_META,
} from "../shared/constants";
import { Screen, Ward } from "../shared/types";
import { SubHeader, TapInput } from "../shared/SharedUI";
import {
  monitoringApi,
  ApiWard,
  normalizeWards,
  normalizeWard,
  ApiActiveSafeRoute,
  ApiSafeRouteHistoryItem,
  ApiEmergencyAudio,
  supabase,
} from "../api/client";

let _nextWardId = 4;
let _nextNotifId = 100;

// 긴급 모드를 화면 이탈 후에도 유지하기 위한 모듈 수준 저장소
const _wardEmergencyState: Record<number, boolean> = {};
export function newWardId() {
  return _nextWardId++;
}
export function newNotifId() {
  return _nextNotifId++;
}

// 경로 색상 (빨간색 계열)
const ROUTE_COLORS = ["#EA1E2F", "#ff5252", "#aaa"];
const ROUTE_LABELS = ["안전경로", "균형경로", "최단경로"];

// OSRM으로 실제 경로 좌표 가져오기
async function fetchWalkingRoute(
  from: [number, number],
  to: [number, number],
): Promise<[number, number][][] | null> {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  // 공용 OSRM 서버가 foot 프로필을 제공하지 않는 경우 driving 프로필로 경로 형태만 폴백한다.
  for (const profile of ["foot", "driving"]) {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&alternatives=3`,
        { signal: AbortSignal.timeout(8000) },
      );
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes?.length) continue;
      return data.routes.map(
        (r: {
          geometry: { coordinates: [number, number][] };
        }) =>
          r.geometry.coordinates.map(
            ([lng, lat]: [number, number]) =>
              [lat, lng] as [number, number],
          ),
      );
    } catch {}
  }
  return null;
}

function addMapBaseLayer(map: L.Map): () => void {
  const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  );
  const hasVworldKey = Boolean(
    VWORLD_KEY &&
    !/^(undefined|null|your[_-]?key)$/i.test(VWORLD_KEY),
  );
  if (!hasVworldKey) {
    osm.addTo(map);
    return () => undefined;
  }
  const vworld = L.tileLayer(
    `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
    { maxZoom: 19 },
  );
  let fellBack = false;
  const useOsm = () => {
    if (fellBack) return;
    fellBack = true;
    map.removeLayer(vworld);
    osm.addTo(map);
  };
  vworld.on("tileerror", useOsm).addTo(map);
  return () => vworld.off("tileerror", useOsm);
}

type EmergencyAction = "audio" | "location" | "112";

// 안심경로 타임라인 항목 — 화면에 표시할 형태 (API 원본 ApiSafeRouteHistoryItem을 포맷팅해서 만든다)
type TimelineItem = {
  date: string;
  from: string;
  to: string;
  active: boolean;
};

// 진행중인 안심경로 — API 응답(ApiActiveSafeRoute)과 필드가 동일하므로 그대로 별칭 사용
// (API: GET /api/v1/monitoring/wards/{ward_id}/safe-route/active)
type ActiveSafeRoute = ApiActiveSafeRoute;

// SOS 음성 파일 — 화면에 표시할 형태 (API 원본 ApiEmergencyAudio를 매핑해서 만든다)
// (API: GET /api/v1/monitoring/emergency/{emergency_id}/audio)
type EmergencyAudio = {
  audioUrl: string;
  recordedAt: string;
  durationSec: number;
};

// ApiSafeRouteHistoryItem[] → TimelineItem[] 포맷 변환
function toTimelineItems(
  items: ApiSafeRouteHistoryItem[],
): TimelineItem[] {
  const fmt = (iso?: string | null) =>
    iso
      ? new Date(iso)
          .toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
          .replace(/\. /g, ".")
          .replace(/,/g, " /")
      : "";
  return (items ?? []).map((it) => ({
    date:
      it.status === "in_progress"
        ? `${fmt(it.started_at)} 안심경로 시작`
        : `${fmt(it.ended_at ?? it.started_at)} 안심경로 종료`,
    from: it.from_address,
    to: it.to_address,
    active: it.status === "in_progress",
  }));
}

// ApiEmergencyAudio → EmergencyAudio 매핑
function toEmergencyAudio(
  a: ApiEmergencyAudio | null,
): EmergencyAudio | null {
  if (!a) return null;
  return {
    audioUrl: a.audio_url,
    recordedAt: a.recorded_at,
    durationSec: a.duration_sec,
  };
}

// ── Redesigned Live Tracking View ────────────────────────────────────────────
export function LiveTrackingView({
  ward,
  onBack,
}: {
  ward: Ward;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const wardMarkerRef = useRef<L.Marker | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const safeRouteLayersRef = useRef<L.Layer[]>([]); // 출발/도착 마커 + 안심경로 폴리라인

  const [livePos, setLivePos] = useState<
    [number, number] | null
  >(null);
  const [liveAddress, setLiveAddress] = useState(ward.address);
  const [updatedAt, setUpdatedAt] = useState<string>("—");
  const [routes, setRoutes] = useState<[number, number][][]>(
    [],
  );
  const [selectedRoute, setSelectedRoute] = useState<number>(0);
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [following, setFollowing] = useState(true);
  const [locError, setLocError] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<
    string | null
  >(null);

  // 안심경로(출발/도착/경유) — 하드코딩 제거, API로 조회
  const [activeSafeRoute, setActiveSafeRoute] =
    useState<ActiveSafeRoute | null>(null);
  const [timelineItems, setTimelineItems] = useState<
    TimelineItem[]
  >([]);

  // Sheet & emergency state — 긴급 모드는 화면 이탈 후 복귀해도 유지
  const [isEmergency, setIsEmergencyRaw] = useState(
    () => _wardEmergencyState[ward.id] ?? false,
  );
  const [sheetOpen, setSheetOpen] = useState(
    () => _wardEmergencyState[ward.id] ?? false,
  );
  function setIsEmergency(v: boolean) {
    _wardEmergencyState[ward.id] = v;
    setIsEmergencyRaw(v);
  }
  const [activeAction, setActiveAction] =
    useState<EmergencyAction | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRouteConfirm, setShowRouteConfirm] =
    useState(false);
  const [endStep, setEndStep] = useState<1 | 2>(1);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [activeEmergencyId, setActiveEmergencyId] = useState<
    string | null
  >(null);
  const [emergencyAudio, setEmergencyAudio] =
    useState<EmergencyAudio | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showResolvedBanner, setShowResolvedBanner] =
    useState(false);
  const [showForceStopAlert, setShowForceStopAlert] =
    useState(false);

  // Sheet drag
  const touchStartY = useRef(0);
  function onHandleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onHandleTouchEnd(e: React.TouchEvent) {
    const delta =
      touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(delta) > 40) setSheetOpen(delta > 0);
  }

  function haversine(
    [lat1, lng1]: [number, number],
    [lat2, lng2]: [number, number],
  ) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = ward.currentLat
      ? [ward.currentLat, ward.currentLng ?? ward.homeLng]
      : [ward.homeLat, ward.homeLng];

    const map = L.map(containerRef.current, {
      center,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });
    const removeTileErrorListener = addMapBaseLayer(map);

    // 출발지/도착지/경유 경로는 더 이상 하드코딩하지 않고 activeSafeRoute state로부터 그린다
    // (아래 별도 useEffect — [activeSafeRoute] 참고)

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    map.on("dragstart", () => setFollowing(false));

    return () => {
      removeTileErrorListener();
      try {
        map.stop();
      } catch {}
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
      wardMarkerRef.current = null;
      routeLayersRef.current = [];
    };
  }, []);

  // 안심경로(출발/도착/경유 좌표 및 타임라인) API 조회 — 하드코딩 제거
  // 백엔드: GET /api/v1/wards/{ward_id}/safe-route/active
  //         GET /api/v1/wards/{ward_id}/safe-route/history
  useEffect(() => {
    // 1. 실제 존재하고 존재하는 ID 값 추출 (ward.id, ward.ward_id, ward.user_id 중 사용 중인 실제 컬럼명)
    const actualWardId =
      ward?.id || ward?.ward_id || ward?.user_id;

    // 2. ID가 없거나 유효하지 않으면 요청 완전 차단 (404 방지)
    if (!actualWardId || actualWardId === "undefined") {
      return;
    }

    let cancelled = false;

    // 3. 실제 ID 값으로 API 요청
    monitoringApi
      .getActiveSafeRoute(actualWardId)
      .then((res) => {
        if (!cancelled) setActiveSafeRoute(res ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveSafeRoute(null);
      });

    monitoringApi
      .getSafeRouteHistory(actualWardId)
      .then((items) => {
        if (!cancelled)
          setTimelineItems(toTimelineItems(items));
      })
      .catch(() => {
        if (!cancelled) setTimelineItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [ward?.id, ward?.ward_id, ward?.user_id]);

  // monitoring_location_logs는 ward_id가 없고 session_id만 있으므로,
  // 먼저 monitoring_sessions에서 이 피보호자의 "진행중" 세션 id를 찾는다.
  // ⚠️ 컬럼명(ward_id, status 값 'active', 정렬 기준 created_at)은 실제 스키마에 맞춰 확인/수정 필요
  useEffect(() => {
    if (!ward.user_id) return;
    let cancelled = false;

    supabase
      .from("monitoring_sessions")
      .select("id")
      .eq("ward_id", ward.user_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("세션 조회 실패:", error);
          setActiveSessionId(null);
          return;
        }
        setActiveSessionId(data?.id ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [ward.user_id]);

  // activeSafeRoute가 준비되면 지도 위에 출발/도착 마커 + 경유 경로를 그린다
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 이전 레이어 정리
    safeRouteLayersRef.current.forEach((l) => l.remove());
    safeRouteLayersRef.current = [];
    if (!activeSafeRoute) return;

    const DEPARTURE_POS: [number, number] = [
      activeSafeRoute.departure.lat,
      activeSafeRoute.departure.lng,
    ];
    const ARRIVAL_POS: [number, number] = [
      activeSafeRoute.arrival.lat,
      activeSafeRoute.arrival.lng,
    ];
    // 백엔드 자체 경로 알고리즘 결과(waypoints)를 우선 사용, 없으면 출발-도착 직선으로 폴백
    const ROUTE_PATH: [number, number][] =
      activeSafeRoute.waypoints?.length >= 2
        ? activeSafeRoute.waypoints
        : [DEPARTURE_POS, ARRIVAL_POS];

    const startIcon = L.divIcon({
      html: `<div style="position:relative;width:32px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(46,125,50,0.5))">
        <svg width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16c0 11.5 16 22 16 22s16-10.5 16-22C32 7.16 24.84 0 16 0z" fill="#2e7d32"/>
          <circle cx="16" cy="16" r="6.5" fill="white"/>
          <circle cx="16" cy="16" r="3" fill="#2e7d32"/>
        </svg>
      </div>`,
      className: "",
      iconAnchor: [16, 34],
    });
    const startMarker = L.marker(DEPARTURE_POS, {
      icon: startIcon,
    })
      .addTo(map)
      .bindTooltip(
        activeSafeRoute.departure.name ||
          activeSafeRoute.departure.address,
        { direction: "top", offset: [0, -30] },
      );

    const endIcon = L.divIcon({
      html: `<div style="position:relative;width:32px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(234,30,47,0.5))">
        <svg width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16c0 11.5 16 22 16 22s16-10.5 16-22C32 7.16 24.84 0 16 0z" fill="#EA1E2F"/>
          <circle cx="16" cy="16" r="6.5" fill="white"/>
          <circle cx="16" cy="16" r="3" fill="#EA1E2F"/>
        </svg>
      </div>`,
      className: "",
      iconAnchor: [16, 34],
    });
    const endMarker = L.marker(ARRIVAL_POS, { icon: endIcon })
      .addTo(map)
      .bindTooltip(
        activeSafeRoute.arrival.name ||
          activeSafeRoute.arrival.address,
        { direction: "top", offset: [0, -30] },
      );

    const outline = L.polyline(ROUTE_PATH, {
      color: "#fff",
      weight: 8,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    const line = L.polyline(ROUTE_PATH, {
      color: "#1976d2",
      weight: 5,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    const midPos: [number, number] =
      ROUTE_PATH[Math.floor(ROUTE_PATH.length / 2)];
    const routePinIcon = L.divIcon({
      html: `<div style="position:relative;width:28px;height:36px;overflow:visible">
        <div style="position:absolute;left:14px;top:14px;width:32px;height:32px;margin-left:-16px;margin-top:-16px;border-radius:50%;background:rgba(25,118,210,0.18);animation:rippleRing 2s ease-out infinite 0s;pointer-events:none"></div>
        <div style="position:absolute;left:14px;top:14px;width:52px;height:52px;margin-left:-26px;margin-top:-26px;border-radius:50%;background:rgba(25,118,210,0.11);animation:rippleRing 2s ease-out infinite 0.6s;pointer-events:none"></div>
        <div style="position:absolute;left:14px;top:14px;width:72px;height:72px;margin-left:-36px;margin-top:-36px;border-radius:50%;background:rgba(25,118,210,0.06);animation:rippleRing 2s ease-out infinite 1.2s;pointer-events:none"></div>
        <svg width="28" height="36" viewBox="0 0 28 36" style="position:relative;z-index:1;filter:drop-shadow(0 3px 8px rgba(25,118,210,0.5))">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 9.77 14 22 14 22S28 23.77 28 14C28 6.27 21.73 0 14 0z" fill="#1976d2"/>
          <circle cx="14" cy="14" r="5.5" fill="white"/>
          <circle cx="14" cy="14" r="3" fill="#1976d2"/>
        </svg>
      </div>`,
      className: "",
      iconAnchor: [14, 36],
    });
    const midMarker = L.marker(midPos, {
      icon: routePinIcon,
      zIndexOffset: 900,
    }).addTo(map);

    safeRouteLayersRef.current = [
      startMarker,
      endMarker,
      outline,
      line,
      midMarker,
    ];
    map.fitBounds(L.latLngBounds(ROUTE_PATH), {
      padding: [80, 80],
      maxZoom: 17,
    });
  }, [activeSafeRoute]);

  // 위치 데이터 1건을 state + 지도 마커에 반영 (초기조회/폴링/SSE 공통 사용)
  const applyLocationUpdate = useCallback(
    (loc: {
      latitude: number;
      longitude: number;
      address?: string;
      created_at?: string;
    }) => {
      if (!loc || loc.latitude == null || loc.longitude == null)
        return;
      const pos: [number, number] = [
        loc.latitude,
        loc.longitude,
      ];
      setLivePos(pos);
      setLiveAddress(loc.address || ward.address);
      setUpdatedAt(
        loc.created_at
          ? new Date(loc.created_at).toLocaleTimeString(
              "ko-KR",
              { hour: "2-digit", minute: "2-digit" },
            )
          : "방금 전",
      );
      setLocError(false);
      setLoadingLoc(false);

      const map = mapRef.current;
      if (map) {
        const wardIcon = L.divIcon({
          html: `<div style="position:relative;width:28px;height:36px;overflow:visible">
          <div style="position:absolute;left:14px;top:14px;width:32px;height:32px;margin-left:-16px;margin-top:-16px;border-radius:50%;background:rgba(234,30,47,0.18);animation:rippleRing 2s ease-out infinite 0s;pointer-events:none"></div>
          <div style="position:absolute;left:14px;top:14px;width:52px;height:52px;margin-left:-26px;margin-top:-26px;border-radius:50%;background:rgba(234,30,47,0.11);animation:rippleRing 2s ease-out infinite 0.6s;pointer-events:none"></div>
          <div style="position:absolute;left:14px;top:14px;width:72px;height:72px;margin-left:-36px;margin-top:-36px;border-radius:50%;background:rgba(234,30,47,0.06);animation:rippleRing 2s ease-out infinite 1.2s;pointer-events:none"></div>
          <svg width="28" height="36" viewBox="0 0 28 36" style="position:relative;z-index:1;filter:drop-shadow(0 3px 8px rgba(66,133,244,0.5))">
            <path d="M14 0C6.27 0 0 6.27 0 14c0 9.77 14 22 14 22S28 23.77 28 14C28 6.27 21.73 0 14 0z" fill="#4285F4"/>
            <circle cx="14" cy="14" r="5.5" fill="white"/>
            <circle cx="14" cy="14" r="3" fill="#4285F4"/>
          </svg>
        </div>`,
          className: "",
          iconAnchor: [14, 36],
        });
        if (wardMarkerRef.current) {
          wardMarkerRef.current.setLatLng(pos);
        } else {
          wardMarkerRef.current = L.marker(pos, {
            icon: wardIcon,
            zIndexOffset: 1000,
          }).addTo(map);
        }
        if (following)
          map.panTo(pos, { animate: true, duration: 1 });
      }
    },
    [ward.address, following],
  );

  // Supabase Realtime만 사용: activeSessionId가 확정되면
  // (1) 최신 위치 로그 1건을 먼저 조회해 초기 표시하고
  // (2) 이후 INSERT되는 로그를 실시간으로 구독한다.

  useEffect(() => {
    if (!ward.user_id) {
      setLoadingLoc(false);
      setLocError(true);
      return;
    }
    if (!activeSessionId) return; // 세션 조회가 아직 끝나지 않음 (로딩 유지)

    let cancelled = false;

    // (1) 최초 1건 조회
    supabase
      .from("monitoring_location_logs")
      .select("latitude, longitude, logged_at")
      .eq("session_id", activeSessionId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLocError(true);
          setLoadingLoc(false);
          return;
        }
        applyLocationUpdate({
          latitude: data.latitude,
          longitude: data.longitude,
          created_at: data.logged_at, // logged_at → created_at 매핑
        });
      });

    // (2) 실시간 구독
    const channel = supabase
      .channel(`location-logs-${activeSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "monitoring_location_logs",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            latitude: number;
            longitude: number;
            logged_at?: string;
          };
          applyLocationUpdate({
            latitude: row.latitude,
            longitude: row.longitude,
            created_at: row.logged_at, // logged_at → created_at 매핑
          });
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        console.log("위치 로그 realtime 상태:", status);
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setLocError(true);
          setLoadingLoc(false);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [ward.user_id, activeSessionId, applyLocationUpdate]);

  // activeSessionId가 확정되면 해당 세션의 위치 로그만 실시간 구독해서
  // 지도 마커(applyLocationUpdate)를 갱신한다.
  // ⚠️ latitude/longitude/address/created_at 컬럼명도 실제 스키마에 맞춰 확인 필요
  // SOS 발생 감지: emergency_logs에 새 행이 INSERT되면 긴급 모드로 전환
  // ⚠️ 이 테이블엔 id/status 컬럼이 없어 "해제" 이벤트는 이 채널로 감지 불가.
  //    해제는 기존 REST 흐름(종료 모달 → monitoringApi.resolveEmergency)에서 로컬로만 처리됨.
  useEffect(() => {
    if (!activeSessionId) return;

    const channel = supabase
      .channel(`emergency-logs-${activeSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emergency_logs",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            session_id: string;
            latitude: string;
            longitude: string;
            address?: string;
            audio_url?: string;
            created_at: string;
            expires_at?: string;
          };

          // 고유 id가 없으므로 session_id + created_at으로 임시 식별자 구성
          const syntheticId = `${row.session_id}_${row.created_at}`;
          setActiveEmergencyId(syntheticId);
          setIsEmergency(true);
          setSheetOpen(true);

          const lat = parseFloat(row.latitude);
          const lng = parseFloat(row.longitude);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            applyLocationUpdate({
              latitude: lat,
              longitude: lng,
              address: row.address,
              created_at: row.created_at,
            });
          }

          // audio_url이 로그에 이미 포함되어 있으므로 별도 REST 조회 없이 바로 세팅
          setEmergencyAudio(
            row.audio_url
              ? {
                  audioUrl: row.audio_url,
                  recordedAt: row.created_at,
                  durationSec: 0,
                }
              : null,
          );
        },
      )
      .subscribe((status) => {
        console.log("긴급상황 realtime 상태:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSessionId, applyLocationUpdate]);

  // 활성 안심경로의 도착지를 우선 사용해 현재 위치에서 실제 목적지까지의 경로·ETA를 계산한다.
  const routeDestination: [number, number] | null =
    activeSafeRoute
      ? [
          activeSafeRoute.arrival.lat,
          activeSafeRoute.arrival.lng,
        ]
      : ward.homeLat && ward.homeLng
        ? [ward.homeLat, ward.homeLng]
        : null;

  useEffect(() => {
    const from =
      livePos ??
      (ward.currentLat
        ? ([
            ward.currentLat,
            ward.currentLng ?? ward.homeLng,
          ] as [number, number])
        : null);
    if (!from || !routeDestination) return;
    const to = routeDestination;
    setLoadingRoutes(true);

    fetchWalkingRoute(from, to)
      .then((allRoutes) => {
        if (!allRoutes || allRoutes.length === 0) {
          // OSRM 실패 시 직선 경로
          setRoutes([[from, to]]);
          return;
        }
        const limited = allRoutes.slice(0, 3);
        setRoutes(limited);

        // 지도에 경로 그리기
        const map = mapRef.current;
        if (!map) return;
        routeLayersRef.current.forEach((p) => p.remove());
        routeLayersRef.current = [];

        limited.forEach((coords, i) => {
          const color = ROUTE_COLORS[i] ?? "#EA1E2F";
          const isSelected = i === selectedRoute;
          const outline = L.polyline(coords, {
            color: "#fff",
            weight: isSelected ? 16 : 10,
            opacity: 0.85,
          }).addTo(map);
          const poly = L.polyline(coords, {
            color,
            weight: isSelected ? 12 : 6,
            opacity: isSelected ? 1 : 0.4,
          }).addTo(map);
          poly.bringToFront();

          const onOver = () => {
            outline.bringToFront();
            poly.bringToFront();
            poly.setStyle({ weight: 12, opacity: 1 });
          };
          const onOut = () => {
            poly.setStyle({
              weight: isSelected ? 12 : 6,
              opacity: isSelected ? 1 : 0.4,
            });
          };
          outline.on("mouseover", onOver);
          poly.on("mouseover", onOver);
          outline.on("mouseout", onOut);
          poly.on("mouseout", onOut);

          routeLayersRef.current.push(outline, poly);
        });

        // 전체 경로가 보이도록 fitBounds
        const allCoords = limited.flatMap((c) => c);
        if (allCoords.length > 1) {
          map.fitBounds(L.latLngBounds(allCoords), {
            padding: [50, 50],
            maxZoom: 17,
          });
        }
      })
      .finally(() => setLoadingRoutes(false));
  }, [
    livePos,
    ward.currentLat,
    ward.currentLng,
    ward.homeLat,
    ward.homeLng,
    activeSafeRoute?.arrival.lat,
    activeSafeRoute?.arrival.lng,
  ]);

  // 경로 선택 시 지도 스타일 업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routes.length === 0) return;
    routeLayersRef.current.forEach((p) => p.remove());
    routeLayersRef.current = [];

    routes.forEach((coords, i) => {
      const color = ROUTE_COLORS[i] ?? "#EA1E2F";
      const isSelected = i === selectedRoute;
      const outline = L.polyline(coords, {
        color: "#fff",
        weight: isSelected ? 16 : 10,
        opacity: 0.85,
      }).addTo(map);
      const poly = L.polyline(coords, {
        color,
        weight: isSelected ? 12 : 6,
        opacity: isSelected ? 1 : 0.4,
      }).addTo(map);
      poly.bringToFront();

      const onOver = () => {
        outline.bringToFront();
        poly.bringToFront();
        poly.setStyle({ weight: 12, opacity: 1 });
      };
      const onOut = () => {
        poly.setStyle({
          weight: isSelected ? 12 : 6,
          opacity: isSelected ? 1 : 0.4,
        });
      };
      outline.on("mouseover", onOver);
      poly.on("mouseover", onOver);
      outline.on("mouseout", onOut);
      poly.on("mouseout", onOut);

      routeLayersRef.current.push(outline, poly);
    });

    if (wardMarkerRef.current)
      wardMarkerRef.current.bringToFront();
  }, [selectedRoute, routes]);

  const currentPos =
    livePos ??
    (ward.currentLat
      ? ([ward.currentLat, ward.currentLng ?? ward.homeLng] as [
          number,
          number,
        ])
      : null);
  const distanceToDestination =
    currentPos && routeDestination
      ? haversine(currentPos, routeDestination)
      : null;

  const selectedRouteDistance =
    routes[selectedRoute]?.length &&
    routes[selectedRoute].length > 1
      ? routes[selectedRoute]
          .slice(1)
          .reduce(
            (sum, point, index) =>
              sum +
              haversine(routes[selectedRoute][index], point),
            0,
          )
      : null;

  // OSRM이 현재 위치부터 다시 계산한 경로 거리(우선)로 ETA를 표시한다.
  const etaDistance =
    selectedRouteDistance ?? distanceToDestination;
  const etaMinutes =
    etaDistance != null
      ? Math.max(1, Math.round(etaDistance / 75))
      : null;
  const etaTimeStr =
    etaMinutes != null
      ? (() => {
          const t = new Date(Date.now() + etaMinutes * 60000);
          return t.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        })()
      : null;

  // 출발/도착 주소 — activeSafeRoute API 응답을 우선 사용
  const departureAddr =
    activeSafeRoute?.departure.address ??
    (liveAddress !== "위치 정보 없음"
      ? liveAddress
      : "출발지 확인 중");
  const arrivalAddr =
    activeSafeRoute?.arrival.address ?? "도착지 확인 중";

  const SHEET_MID_H = isEmergency ? 320 : 232;
  const SHEET_FULL_H = "72vh";

  const emergencyGrid: {
    id: EmergencyAction;
    label: string;
  }[] = [
    { id: "audio", label: "음성파일\n확인하기" },
    { id: "location", label: "위치\n확인하기" },
    { id: "112", label: "112\n신고하기" },
  ];

  const shareLiveLocation = useCallback(async () => {
    if (!currentPos) return;
    const url = `${window.location.origin}/monitoring/live?ward=${encodeURIComponent(String(ward.user_id ?? ward.id))}&lat=${encodeURIComponent(String(currentPos[0]))}&lng=${encodeURIComponent(String(currentPos[1]))}`;
    const text = `${ward.name}님의 실시간 위치 확인 링크입니다.\n${url}`;
    try {
      await navigator.clipboard?.writeText(url);
    } catch {}
    try {
      if (navigator.share)
        await navigator.share({
          title: `${ward.name}님 실시간 위치`,
          text,
          url,
        });
      else
        window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    } catch {}
  }, [currentPos, ward.id, ward.name, ward.user_id]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#e8e8e8",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes livePulse {
          0%   { transform: scale(1);   opacity: .5; }
          70%  { transform: scale(3);   opacity: 0;  }
          100% { transform: scale(3);   opacity: 0;  }
        }
        @keyframes rippleRing {
          0%   { transform: scale(0.4); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        @keyframes forceStopBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Map ── */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />

      {/* ── Re-center button ── */}
      {!following && currentPos && (
        <button
          onClick={() => {
            mapRef.current?.panTo(currentPos, {
              animate: true,
            });
            setFollowing(true);
          }}
          style={{
            position: "absolute",
            right: 16,
            zIndex: 500,
            bottom: sheetOpen
              ? `calc(${SHEET_FULL_H} + 12px)`
              : `${SHEET_MID_H + 12}px`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 24,
            background: "white",
            boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
            border: "none",
            cursor: "pointer",
            transition:
              "bottom 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="3" fill="#1976d2" />
            <circle
              cx="12"
              cy="12"
              r="8"
              stroke="#1976d2"
              strokeWidth="2"
            />
            <path
              d="M12 2V5M12 19V22M2 12H5M19 12H22"
              stroke="#1976d2"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{ ...jua, fontSize: 12, color: "#1976d2" }}
          >
            따라가기
          </span>
        </button>
      )}

      {/* ══════════════════════════════════════════════
          NORMAL MODE — floating ETA card
      ══════════════════════════════════════════════ */}
      {!isEmergency && (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 16,
            right: 16,
            zIndex: 1000,
            background: "#F9F1DE",
            borderRadius: 20,
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            padding: "10px 16px 14px",
          }}
        >
          {/* Nav row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            {/* 닫기 */}
            <button
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                color: "#222",
                padding: "0 2px",
                flexShrink: 0,
              }}
            >
              ×
            </button>

            {/* 중앙 버튼 그룹 */}
            <div
              style={{
                flex: 1,
                display: "flex",
                gap: 5,
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => setIsEmergency(true)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 16,
                  border: "1px solid #d0d0d0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#888",
                  fontFamily: "system-ui",
                }}
              >
                🚨 긴급 테스트
              </button>
              <button
                onClick={() => {
                  setShowForceStopAlert(true);
                  setTimeout(() => {
                    setShowForceStopAlert(false);
                    onBack();
                  }, 2200);
                }}
                style={{
                  padding: "3px 10px",
                  borderRadius: 16,
                  border: "1px solid #f48fb1",
                  background: "#fff0f3",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#c62828",
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                🛑 강제 종료
              </button>
            </div>

            {/* 도움말 */}
            <button
              style={{
                padding: "4px 10px",
                borderRadius: 16,
                border: "1px solid #d0d0d0",
                background: "white",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span
                style={{ ...jua, fontSize: 12, color: "#555" }}
              >
                도움말
              </span>
            </button>
          </div>

          {/* ETA + bear row */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
            }}
          >
            {/* Left: text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "system-ui",
                  fontSize: 11,
                  color: "#aaa",
                  margin: 0,
                }}
              >
                도착예정시간
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 5,
                  margin: "2px 0 12px",
                }}
              >
                <span
                  style={{
                    ...jua,
                    fontSize: 30,
                    color: "#111",
                    lineHeight: 1,
                  }}
                >
                  {etaMinutes != null
                    ? `${etaMinutes}분`
                    : "계산 중"}
                </span>
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 14,
                    color: "#555",
                  }}
                >
                  ({etaTimeStr ?? "—"})
                </span>
              </div>

              {/* Progress track */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                }}
              >
                {/* 출발 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#1976d2",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M2 5.5l2 2 4-4"
                        stroke="white"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span
                    style={{
                      fontFamily: "system-ui",
                      fontSize: 9,
                      color: "#666",
                    }}
                  >
                    출발
                  </span>
                </div>

                {/* Line 출발→중간지점 */}
                <div
                  style={{
                    flex: 0.55,
                    height: 2,
                    background: "#b0bec5",
                    marginTop: 9,
                    minWidth: 12,
                  }}
                />

                {/* 중간지점 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "#cfd8dc",
                      marginTop: 4,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "system-ui",
                      fontSize: 9,
                      color: "#aaa",
                    }}
                  >
                    중간지점
                  </span>
                </div>

                {/* Line 중간지점→도착 */}
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: "#e0e0e0",
                    marginTop: 9,
                    minWidth: 12,
                  }}
                />

                {/* 도착 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ marginTop: 1 }}
                  >
                    <path
                      d="M12 2l2.9 6.3 6.8.6-5 4.7 1.4 6.7L12 17.3l-6.1 3-1.4-6.7-5-4.7 6.8-.6z"
                      stroke="#c8c8c8"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: "system-ui",
                      fontSize: 9,
                      color: "#aaa",
                    }}
                  >
                    도착
                  </span>
                </div>
              </div>
            </div>

            {/* Bear character */}
            <div
              style={{
                width: 58,
                height: 78,
                borderRadius: 14,
                overflow: "hidden",
                flexShrink: 0,
                marginBottom: 2,
              }}
            >
              <img
                src={imgBearNew}
                alt="bear character"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          EMERGENCY MODE — header + alert banner
      ══════════════════════════════════════════════ */}
      {isEmergency && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 50,
              paddingBottom: 14,
              paddingLeft: 20,
              paddingRight: 20,
              background: "#F9F1DE",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <button
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="#1a1a1a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 20 }}>🔔</span>
              <span
                style={{
                  ...jua,
                  fontSize: 20,
                  color: "#c62828",
                }}
              >
                긴급
              </span>
              <span style={{ fontSize: 20 }}>💬</span>
            </div>
            <div style={{ width: 26 }} />
          </div>
          {/* Alert banner */}
          <div
            style={{
              background: "#F9F1DE",
              padding: "14px 20px 16px",
              borderBottom: "2px solid #ffcdd2",
            }}
          >
            <p
              style={{
                ...jua,
                fontSize: 18,
                color: "#c62828",
                textAlign: "center",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              112 신고/SOS벨이 작동하였습니다
            </p>
            <p
              style={{
                ...jua,
                fontSize: 14,
                color: "#1a1a1a",
                textAlign: "center",
                margin: "4px 0 0",
              }}
            >
              모니터링창을 확인하세요
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          BOTTOM SHEET
      ══════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetOpen ? SHEET_FULL_H : `${SHEET_MID_H}px`,
          background: "#F9F1DE",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.13)",
          zIndex: 900,
          transition:
            "height 0.38s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: 10,
            paddingBottom: 4,
            cursor: "pointer",
            flexShrink: 0,
          }}
          onClick={() => setSheetOpen((o) => !o)}
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: "#ddd",
            }}
          />
        </div>

        {/* Sheet header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 20px 14px",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>
            🐻
          </span>
          <p
            style={{
              ...jua,
              fontSize: 14,
              color: isEmergency ? "#c62828" : "#222",
              margin: 0,
              flex: 1,
            }}
          >
            {isEmergency
              ? `${ward.name}님의 SOS벨이 작동했어요!`
              : `${ward.name}님을 모니터링 중이에요!`}
          </p>
          <button
            onClick={() => setShowRouteConfirm(true)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span
              style={{ ...jua, fontSize: 12, color: "#555" }}
            >
              바로가기
            </span>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 20px 24px",
          }}
        >
          {/* ── Normal mode content ── */}
          {!isEmergency && (
            <>
              {/* Route info card */}
              <div style={{ marginBottom: 16 }}>
                <p
                  style={{
                    ...jua,
                    fontSize: 15,
                    color: "#1a1a1a",
                    margin: "0 0 10px",
                  }}
                >
                  {ward.name}님이 안심경로 서비스를
                  시작했습니다.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                  }}
                >
                  {[
                    { label: "출발", addr: departureAddr },
                    { label: "도착", addr: arrivalAddr },
                  ].map(({ label, addr }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: 12,
                          background: "#2d2d2d",
                          color: "white",
                          fontSize: 11,
                          fontFamily: "system-ui",
                          flexShrink: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontFamily: "system-ui",
                          fontSize: 13,
                          color: "#333",
                        }}
                      >
                        {addr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Update time */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {loadingLoc ? (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      border: "1.5px solid #ccc",
                      borderTopColor: "#555",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: locError
                        ? "#e53935"
                        : "#4caf50",
                    }}
                  />
                )}
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 11,
                    color: "#aaa",
                  }}
                >
                  마지막 업데이트: {updatedAt}
                </span>
              </div>

              {/* Timeline (visible when expanded) */}
              {sheetOpen && (
                <div>
                  <div
                    style={{
                      height: 1,
                      background: "#f0f0f0",
                      marginBottom: 16,
                    }}
                  />
                  {timelineItems.length === 0 && (
                    <p
                      style={{
                        fontFamily: "system-ui",
                        fontSize: 12,
                        color: "#aaa",
                        textAlign: "center",
                        padding: "12px 0",
                      }}
                    >
                      안심경로 이력이 없습니다
                    </p>
                  )}
                  {timelineItems.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 12,
                        marginBottom:
                          i < timelineItems.length - 1 ? 0 : 0,
                      }}
                    >
                      {/* Left connector */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: 20,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            flexShrink: 0,
                            marginTop: 10,
                            background: item.active
                              ? "#6e6e6e"
                              : "white",
                            border: `2px solid ${item.active ? "#6e6e6e" : "#c8c8c8"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {item.active && (
                            <svg
                              width="7"
                              height="7"
                              viewBox="0 0 8 8"
                              fill="none"
                            >
                              <path
                                d="M1.5 4l2 2 3-3"
                                stroke="white"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        {i < timelineItems.length - 1 && (
                          <div
                            style={{
                              flex: 1,
                              width: 2,
                              background: "#ebebeb",
                              marginTop: 3,
                              minHeight: 18,
                            }}
                          />
                        )}
                      </div>

                      {/* Card */}
                      <div
                        style={{
                          flex: 1,
                          background: "#f7f7f7",
                          borderRadius: 12,
                          padding: "10px 14px",
                          marginBottom: 8,
                        }}
                      >
                        <p
                          style={{
                            fontFamily: "system-ui",
                            fontSize: 12,
                            color: "#333",
                            margin: "0 0 6px",
                            fontWeight: 500,
                          }}
                        >
                          {item.date}
                        </p>
                        {[
                          { label: "출발", addr: item.from },
                          { label: "도착", addr: item.to },
                        ].map(({ label, addr }) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              marginTop: 3,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                padding: "1px 6px",
                                borderRadius: 8,
                                background: "#3a3a3a",
                                color: "white",
                                fontSize: 10,
                                fontFamily: "system-ui",
                                flexShrink: 0,
                              }}
                            >
                              {label}
                            </span>
                            <span
                              style={{
                                fontFamily: "system-ui",
                                fontSize: 11,
                                color: "#555",
                              }}
                            >
                              {addr}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Emergency mode content ── */}
          {isEmergency && (
            <>
              {/* Route summary */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 13,
                    color: "#333",
                  }}
                >
                  {departureAddr}
                </span>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 8,
                    background: "#e3f2fd",
                    color: "#1565c0",
                    fontSize: 10,
                    fontFamily: "system-ui",
                  }}
                >
                  출발
                </span>
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 13,
                    color: "#aaa",
                  }}
                >
                  ↔
                </span>
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 13,
                    color: "#333",
                  }}
                >
                  {arrivalAddr}
                </span>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 8,
                    background: "#e8f5e9",
                    color: "#2e7d32",
                    fontSize: 10,
                    fontFamily: "system-ui",
                  }}
                >
                  도착
                </span>
              </div>

              {/* 3 grid buttons */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {emergencyGrid.map(({ id, label }) => {
                  const active = activeAction === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveAction(active ? null : id);
                        if (!active) setSheetOpen(true);
                      }}
                      style={{
                        padding: "16px 6px",
                        borderRadius: 14,
                        border: `1.5px solid ${active ? "#c62828" : "#e0e0e0"}`,
                        background: active
                          ? "#c62828"
                          : "#f7f7f7",
                        cursor: "pointer",
                        boxShadow: active
                          ? "0 4px 12px rgba(198,40,40,0.25)"
                          : "none",
                        transition: "all 0.15s",
                      }}
                    >
                      <span
                        style={{
                          ...jua,
                          fontSize: 13,
                          color: active ? "white" : "#333",
                          whiteSpace: "pre-line",
                          lineHeight: 1.4,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Update dot */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#c62828",
                    animation: "livePulse 2s ease-out infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: "system-ui",
                    fontSize: 11,
                    color: "#aaa",
                  }}
                >
                  마지막 업데이트:{" "}
                  {updatedAt !== "—" ? updatedAt : "방금 전"}
                </span>
              </div>

              {/* Expanded emergency panel */}
              {sheetOpen && (
                <>
                  {/* 긴급상황 종료 버튼 */}
                  <button
                    onClick={() => {
                      setShowEndConfirm(true);
                      setEndStep(1);
                    }}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 14,
                      border: "2px solid #c62828",
                      background: "white",
                      cursor: "pointer",
                      marginBottom: 14,
                      boxShadow:
                        "0 2px 8px rgba(198,40,40,0.12)",
                    }}
                  >
                    <span
                      style={{
                        ...jua,
                        fontSize: 16,
                        color: "#c62828",
                      }}
                    >
                      긴급상황 종료 버튼
                    </span>
                  </button>

                  {/* Audio action panel */}
                  {activeAction === "audio" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        {[
                          {
                            icon: "📞",
                            label: "112 신고",
                            action: () => {
                              window.location.href = "tel:112";
                            },
                          },
                          {
                            icon: "🔗",
                            label: "실시간 위치링크",
                            action: () => {
                              void shareLiveLocation();
                            },
                          },
                        ].map((b) => (
                          <button
                            key={b.label}
                            onClick={b.action}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "8px 14px",
                              borderRadius: 20,
                              border: "1px solid #e0e0e0",
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            <span style={{ fontSize: 15 }}>
                              {b.icon}
                            </span>
                            <span
                              style={{
                                ...jua,
                                fontSize: 13,
                                color: "#333",
                              }}
                            >
                              {b.label}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div
                        style={{
                          background: "#f7f7f7",
                          borderRadius: 14,
                          padding: "14px 16px",
                          border: "1px solid #eee",
                        }}
                      >
                        <p
                          style={{
                            fontFamily: "system-ui",
                            fontSize: 12,
                            color: "#666",
                            margin: "0 0 10px",
                          }}
                        >
                          {emergencyAudio
                            ? `${new Date(emergencyAudio.recordedAt).toLocaleString("ko-KR")} 음성파일`
                            : "음성파일 불러오는 중…"}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <button
                            disabled={!emergencyAudio}
                            onClick={() => {
                              if (!emergencyAudio) return;
                              if (!audioElRef.current)
                                audioElRef.current = new Audio(
                                  emergencyAudio.audioUrl,
                                );
                              if (isAudioPlaying) {
                                audioElRef.current.pause();
                              } else {
                                audioElRef.current
                                  .play()
                                  .catch(() => {});
                              }
                              setIsAudioPlaying((p) => !p);
                            }}
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              background: emergencyAudio
                                ? "#333"
                                : "#bbb",
                              border: "none",
                              cursor: emergencyAudio
                                ? "pointer"
                                : "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {isAudioPlaying ? (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="white"
                              >
                                <rect
                                  x="6"
                                  y="4"
                                  width="4"
                                  height="16"
                                  rx="1"
                                />
                                <rect
                                  x="14"
                                  y="4"
                                  width="4"
                                  height="16"
                                  rx="1"
                                />
                              </svg>
                            ) : (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="white"
                              >
                                <path d="M8 5v14l11-7L8 5z" />
                              </svg>
                            )}
                          </button>
                          <div
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 2,
                              background: "#ddd",
                            }}
                          />
                          <span
                            style={{
                              fontFamily: "system-ui",
                              fontSize: 12,
                              color: "#555",
                              flexShrink: 0,
                            }}
                          >
                            {emergencyAudio
                              ? `00:${String(emergencyAudio.durationSec).padStart(2, "0")}`
                              : "--:--"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location action panel */}
                  {activeAction === "location" && (
                    <div
                      style={{
                        background: "#f7f7f7",
                        borderRadius: 14,
                        padding: "14px 16px",
                        border: "1px solid #eee",
                      }}
                    >
                      <p
                        style={{
                          ...jua,
                          fontSize: 13,
                          color: "#555",
                          margin: "0 0 6px",
                        }}
                      >
                        현재 위치
                      </p>
                      <p
                        style={{
                          fontFamily: "system-ui",
                          fontSize: 14,
                          color: "#111",
                          margin: "0 0 4px",
                        }}
                      >
                        📍{" "}
                        {liveAddress !== "위치 정보 없음"
                          ? liveAddress
                          : "위치 확인 중..."}
                      </p>
                      <p
                        style={{
                          fontFamily: "system-ui",
                          fontSize: 11,
                          color: "#aaa",
                          margin: 0,
                        }}
                      >
                        마지막 업데이트: {updatedAt}
                      </p>
                    </div>
                  )}

                  {/* 112 action panel */}
                  {activeAction === "112" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            window.location.href = "tel:112";
                          }}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "12px",
                            borderRadius: 24,
                            background: "#c62828",
                            border: "none",
                            cursor: "pointer",
                            boxShadow:
                              "0 4px 12px rgba(198,40,40,0.3)",
                          }}
                        >
                          <span style={{ fontSize: 16 }}>
                            📞
                          </span>
                          <span
                            style={{
                              ...jua,
                              fontSize: 14,
                              color: "white",
                            }}
                          >
                            112 신고
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            void shareLiveLocation();
                          }}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "12px",
                            borderRadius: 24,
                            background: "#f5f5f5",
                            border: "1px solid #e0e0e0",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontSize: 16 }}>
                            🔗
                          </span>
                          <span
                            style={{
                              ...jua,
                              fontSize: 14,
                              color: "#333",
                            }}
                          >
                            실시간 위치링크
                          </span>
                        </button>
                      </div>
                      <div
                        style={{
                          background: "#f7f7f7",
                          borderRadius: 14,
                          padding: "14px 16px",
                          border: "1px solid #eee",
                        }}
                      >
                        <p
                          style={{
                            ...jua,
                            fontSize: 14,
                            color: "#111",
                            margin: "0 0 12px",
                          }}
                        >
                          ○ 신고 시 핵심정보
                        </p>
                        {[
                          {
                            n: 1,
                            title: "피보호자 정보",
                            desc: "이름, 나이, 성별, 현재 인상착의",
                          },
                          {
                            n: 2,
                            title: "정확한 위치 및 이동방향",
                            desc: "최종 확인 주소 & 실시간 이동 여부",
                          },
                          {
                            n: 3,
                            title: "현장상황의 위험도",
                            desc: "앱 작동 로그, 오디오 정보 브리핑",
                          },
                          {
                            n: 4,
                            title: "실시간 위치링크 복사&전송",
                            desc: "피보호자의 실시간 현재 위치 공유",
                          },
                        ].map((item) => (
                          <div
                            key={item.n}
                            style={{
                              display: "flex",
                              gap: 10,
                              marginBottom: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                background: "#c62828",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                marginTop: 1,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "white",
                                }}
                              >
                                {item.n}
                              </span>
                            </div>
                            <div>
                              <p
                                style={{
                                  ...jua,
                                  fontSize: 13,
                                  color: "#111",
                                  margin: 0,
                                }}
                              >
                                {item.title}
                              </p>
                              <p
                                style={{
                                  fontFamily: "system-ui",
                                  fontSize: 11,
                                  color: "#666",
                                  margin: "2px 0 0",
                                }}
                              >
                                : {item.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 2-step Emergency End Modal ── */}
      {showEndConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "0 24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 24,
              padding: "24px",
              width: "100%",
              maxWidth: 340,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background:
                    endStep === 1 ? "#fff3f3" : "#f0fff4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 22 }}>
                  {endStep === 1 ? "⚠️" : "⚠️"}
                </span>
              </div>
            </div>
            <p
              style={{
                ...jua,
                fontSize: 18,
                color: "#c62828",
                textAlign: "center",
                margin: "0 0 8px",
              }}
            >
              {endStep === 1 ? "긴급상황 종료" : "최종 확인"}
            </p>
            <p
              style={{
                fontFamily: "system-ui",
                fontSize: 14,
                color: "#555",
                textAlign: "center",
                margin: "0 0 20px",
                lineHeight: 1.6,
              }}
            >
              {endStep === 1
                ? "정말로 긴급상황을 종료하시겠습니까?\n종료 시 일반 모드로 돌아갑니다."
                : "피보호자의 안전을 확인하셨나요?\n확인 시 해제 알람이 피보호자에게 전송됩니다."}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() =>
                  endStep === 1
                    ? setShowEndConfirm(false)
                    : setEndStep(1)
                }
                disabled={resolving}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  background: "#f5f5f5",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    ...jua,
                    fontSize: 15,
                    color: "#555",
                  }}
                >
                  {endStep === 1 ? "취소" : "이전"}
                </span>
              </button>
              <button
                disabled={resolving}
                onClick={async () => {
                  if (endStep === 1) {
                    setEndStep(2);
                  } else {
                    setResolving(true);
                    // 백엔드: POST /api/v1/emergencies/{emergency_id}/resolve
                    // → 성공 시 백엔드가 피보호자 앱으로 해제 알림(WS/FCM)을 전송한다
                    try {
                      await monitoringApi.resolveEmergency(
                        activeEmergencyId ?? undefined,
                      );
                    } catch {
                    } finally {
                      setResolving(false);
                    }
                    setIsEmergency(false);
                    setShowEndConfirm(false);
                    setSheetOpen(false);
                    setActiveAction(null);
                    setEndStep(1);
                    setActiveEmergencyId(null);
                    setEmergencyAudio(null);
                    setShowResolvedBanner(true);
                    setTimeout(
                      () => setShowResolvedBanner(false),
                      3500,
                    );
                  }
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "none",
                  cursor: resolving ? "not-allowed" : "pointer",
                  background:
                    endStep === 1 ? "#c62828" : "#2e7d32",
                  boxShadow:
                    endStep === 1
                      ? "0 4px 12px rgba(198,40,40,0.3)"
                      : "0 4px 12px rgba(46,125,50,0.3)",
                  opacity: resolving ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {resolving ? (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : null}
                <span
                  style={{
                    ...jua,
                    fontSize: 15,
                    color: "white",
                  }}
                >
                  {endStep === 1 ? "계속" : "종료 확인"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모니터링 강제 종료 알림 ── */}
      {showForceStopAlert && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 32px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 22,
              padding: "28px 24px",
              width: "100%",
              maxWidth: 320,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              animation: "slideDown 0.25s ease",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#fff0f3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <span style={{ fontSize: 26 }}>🛑</span>
            </div>
            <p
              style={{
                ...jua,
                fontSize: 17,
                color: "#c62828",
                margin: "0 0 10px",
                lineHeight: 1.5,
              }}
            >
              모니터링이 종료되었습니다
            </p>
            <p
              style={{
                fontFamily: "system-ui",
                fontSize: 13,
                color: "#555",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              피보호자가 보호자의 모니터링을
              <br />
              강제 중단했습니다
            </p>
            <div
              style={{
                marginTop: 18,
                height: 3,
                borderRadius: 2,
                background: "#f0f0f0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "#c62828",
                  borderRadius: 2,
                  animation:
                    "forceStopBar 2.2s linear forwards",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 긴급상황 해제 알람 전송 완료 배너 ── */}
      {showResolvedBanner && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 20,
            right: 20,
            zIndex: 4000,
            background: "#e8f5e9",
            border: "1.5px solid #81c784",
            borderRadius: 18,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 4px 24px rgba(46,125,50,0.28)",
            animation: "slideDown 0.3s ease",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#2e7d32",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M20 6L9 17l-5-5"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <p
              style={{
                ...jua,
                fontSize: 14,
                color: "#1b5e20",
                margin: 0,
              }}
            >
              긴급상황 해제 알람 전송됨
            </p>
            <p
              style={{
                fontFamily: "system-ui",
                fontSize: 11,
                color: "#4caf50",
                margin: "2px 0 0",
              }}
            >
              피보호자에게 해제 알람이 전송되었습니다
            </p>
          </div>
        </div>
      )}

      {/* ── Route Confirm Modal ── */}
      {showRouteConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "0 32px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: "28px 24px 20px",
              width: "100%",
              maxWidth: 320,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <div
              style={{ fontSize: 36, marginBottom: 12 }}
            ></div>
            <p
              style={{
                ...jua,
                fontSize: 16,
                color: "#1a1a1a",
                margin: "0 0 22px",
                lineHeight: 1.6,
              }}
            >
              피보호자에게 가는
              <br />
              가장 빠른 길을 찾으시겠습니까?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowRouteConfirm(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  background: "#f5f5f5",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    ...jua,
                    fontSize: 15,
                    color: "#555",
                  }}
                >
                  취소
                </span>
              </button>
              <button
                onClick={() => {
                  setShowRouteConfirm(false);
                  if (currentPos) {
                    const url = `https://map.kakao.com/link/to/${encodeURIComponent(ward.name)},${currentPos[0]},${currentPos[1]}`;
                    window.open(url, "_blank");
                  }
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  background: "#1976d2",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(25,118,210,0.3)",
                }}
              >
                <span
                  style={{
                    ...jua,
                    fontSize: 15,
                    color: "white",
                  }}
                >
                  찾기
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ward list ──────────────────────────────────────────────────────────────
export function GuardianMonitoringScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (s: Screen) => void;
}) {
  const [wards, setWards] = useState<Ward[]>([]);
  const [tracking, setTracking] = useState<Ward | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedNotif, setExpandedNotif] = useState<
    number | null
  >(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);

  // Add ward modal state
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  // API에서 연결된 피보호자 목록 불러오기
  useEffect(() => {
    monitoringApi
      .getWards()
      .then((res) => {
        const list = normalizeWards(res);
        // 요청 4: status/battery/phone/monitoringAllowed는 하드코딩하지 않고
        // GET /api/v1/wards 응답 필드(w.status, w.battery, w.phone, w.monitoring_allowed)를 그대로 사용한다.
        // 상태값이 없을 때만 안전한 기본값("집에 있음")으로 폴백하고, 위치는 임의 좌표 대신 "위치 정보 없음"으로 표시한다.
        const apiWards: Ward[] = list.map(
          (w: ApiWard, i: number) => ({
            id: i + 1000,
            name:
              w.name ?? w.nickname ?? w.username ?? "김집로",
            status: w.status ?? "집에 있음",
            battery: w.battery ?? 0,
            phone: w.phone,
            monitoringAllowed: w.monitoring_allowed ?? false,
            address: w.address ?? "위치 정보 없음",
            homeLat: w.home_lat ?? w.current_lat ?? 0,
            homeLng: w.home_lng ?? w.current_lng ?? 0,
            currentLat: w.current_lat,
            currentLng: w.current_lng,
            route: [] as [number, number][], // 안심경로는 LiveTrackingView에서 /safe-route API로 별도 조회
            notifications: [],
            wardCode: w.ward_code,
            user_id: String(w.user_id),
          }),
        );
        setWards(apiWards);
      })
      .catch(() => {
        setWards([]);
      })
      .finally(() => setApiLoading(false));
  }, []);

  // 변경 후 — emergency_logs 기반 SOS 감지로 교체
  useEffect(() => {
    const channel = supabase
      .channel("emergency-logs-guardian")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emergency_logs",
        },
        async (payload) => {
          const row = payload.new as {
            session_id: string;
            created_at: string;
          };

          const { data, error } = await supabase
            .from("monitoring_sessions")
            .select("ward_id")
            .eq("id", row.session_id)
            .maybeSingle();
          if (error || !data?.ward_id) return;

          setWards((prev) =>
            prev.map((w) =>
              w.user_id !== String(data.ward_id)
                ? w
                : {
                    ...w,
                    status: "위험",
                    notifications: [
                      {
                        id: newNotifId(),
                        type: "sos",
                        message:
                          "SOS벨이 작동했습니다. 확인해주세요.",
                        time: new Date(
                          row.created_at,
                        ).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                        read: false,
                      },
                      ...w.notifications,
                    ],
                  },
            ),
          );
        },
      )
      .subscribe((status) =>
        console.log("긴급상황(목록) realtime 상태:", status),
      );

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Drag-to-reorder state
  const dragIdx = useRef<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function handleDragHandleTouchStart(
    e: React.TouchEvent,
    idx: number,
  ) {
    e.stopPropagation();
    dragIdx.current = idx;
    setOverIdx(idx);
  }

  function handleListTouchMove(e: React.TouchEvent) {
    if (dragIdx.current === null) return;
    const y = e.touches[0].clientY;
    let found = dragIdx.current;
    cardRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) found = i;
    });
    setOverIdx(found);
  }

  function handleListTouchEnd() {
    if (
      dragIdx.current !== null &&
      overIdx !== null &&
      dragIdx.current !== overIdx
    ) {
      setWards((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx.current!, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
    }
    dragIdx.current = null;
    setOverIdx(null);
  }

  function deleteWard(id: number) {
    setWards((prev) => prev.filter((w) => w.id !== id));
  }

  async function addWard() {
    if (!newCode.trim()) {
      setLinkError("피보호자 코드를 입력해주세요.");
      return;
    }
    setLinking(true);
    setLinkError("");
    try {
      const res = await monitoringApi.linkWard(newCode.trim());
      const apiW = normalizeWard(res);
      const w: Ward = {
        id: newWardId(),
        name:
          newName.trim() ||
          apiW.name ||
          apiW.nickname ||
          apiW.username ||
          "김집로",
        status: apiW.status ?? "집에 있음",
        battery: apiW.battery ?? 0,
        phone: apiW.phone,
        monitoringAllowed: apiW.monitoring_allowed ?? false,
        address: apiW.address ?? "위치 정보 없음",
        homeLat: apiW.home_lat ?? 0,
        homeLng: apiW.home_lng ?? 0,
        route: [],
        notifications: [],
        wardCode: apiW.ward_code,
        user_id: String(apiW.user_id),
      };
      setWards((prev) => [...prev, w]);
      setNewName("");
      setNewCode("");
      setShowAdd(false);
    } catch (e) {
      setLinkError(
        (e as Error).message ??
          "연결에 실패했습니다. 코드를 확인해주세요.",
      );
    } finally {
      setLinking(false);
    }
  }

  function markAllRead(wardId: number) {
    setWards((prev) =>
      prev.map((w) =>
        w.id !== wardId
          ? w
          : {
              ...w,
              notifications: w.notifications.map((n) => ({
                ...n,
                read: true,
              })),
            },
      ),
    );
  }

  if (tracking) {
    return (
      <LiveTrackingView
        ward={tracking}
        onBack={() => setTracking(null)}
      />
    );
  }

  const totalUnread = wards.reduce(
    (s, w) => s + w.notifications.filter((n) => !n.read).length,
    0,
  );

  return (
    <div className="absolute inset-0 bg-[#fff3c5]">
      <style>{`
        @keyframes ping{75%,100%{transform:scale(2);opacity:0}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <SubHeader onBack={onBack} />

      {/* Top action bar */}
      <div
        className="absolute flex items-center gap-2 px-4"
        style={{ top: 122, left: 0, right: 0 }}
      >
        <div className="flex items-center gap-1.5 flex-1">
          <p
            style={{
              ...jua,
              fontSize: 15,
              color: "#b25e09",
              margin: 0,
            }}
          >
            피보호자 목록
          </p>
          <div
            className="px-2 py-0.5 rounded-full"
            style={{ background: "#b25e09" }}
          >
            <p
              style={{
                ...jua,
                fontSize: 11,
                color: "white",
                margin: 0,
              }}
            >
              {wards.length}명
            </p>
          </div>
          {totalUnread > 0 && (
            <div
              className="px-2 py-0.5 rounded-full"
              style={{ background: "#EA1E2F" }}
            >
              <p
                style={{
                  ...jua,
                  fontSize: 11,
                  color: "white",
                  margin: 0,
                }}
              >
                알림 {totalUnread}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
          style={{ background: "#b25e09" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          onClick={() => setEditMode((e) => !e)}
          className="px-3 py-1.5 rounded-full transition-opacity active:opacity-70"
          style={{
            background: editMode ? "#413c3c" : "#ffe896",
            border: editMode ? "none" : "1.5px solid #d9c060",
          }}
        >
          <p
            style={{
              ...jua,
              fontSize: 12,
              color: editMode ? "white" : "#b25e09",
              margin: 0,
            }}
          >
            {editMode ? "완료" : "편집"}
          </p>
        </button>
      </div>

      {/* Ward list */}
      <div
        className="absolute left-0 right-0 overflow-y-auto px-4 pb-4"
        style={{ top: 158, bottom: 0 }}
        onTouchMove={editMode ? handleListTouchMove : undefined}
        onTouchEnd={editMode ? handleListTouchEnd : undefined}
      >
        <div className="flex flex-col gap-3">
          {wards.map((ward, idx) => {
            const meta = STATUS_META[ward.status] ?? {
              color: "#b25e09",
              bg: "#fff8e1",
              text: ward.status,
            };
            const isMoving = ward.status === "이동중";
            const allowed = ward.monitoringAllowed === true;
            const unread = ward.notifications.filter(
              (n) => !n.read,
            ).length;
            const isExpanded = expandedNotif === ward.id;
            const isDragOver =
              editMode &&
              overIdx === idx &&
              dragIdx.current !== null &&
              dragIdx.current !== idx;

            return (
              <div
                key={ward.id}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                style={{
                  background: "white",
                  borderRadius: 22,
                  overflow: "hidden",
                  boxShadow: isDragOver
                    ? "0 0 0 2.5px #b25e09, 0 4px 20px rgba(178,94,9,0.2)"
                    : "0 2px 16px rgba(178,94,9,0.12)",
                  border: "1.5px solid #f5e8c0",
                  transition: "box-shadow 0.15s",
                  opacity:
                    editMode && dragIdx.current === idx
                      ? 0.45
                      : 1,
                }}
              >
                {/* Status strip */}
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ background: meta.bg }}
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span
                        className="relative inline-flex rounded-full h-2.5 w-2.5"
                        style={{
                          background: allowed
                            ? "#EA1E2F"
                            : meta.color,
                        }}
                      />
                    </span>
                    <p
                      style={{
                        ...jua,
                        fontSize: 13,
                        color: meta.color,
                        margin: 0,
                      }}
                    >
                      모니터링 가능여부:{" "}
                      {allowed ? "허용" : "미허용"}
                    </p>
                  </div>
                </div>

                <div className="px-4 pt-4 pb-3">
                  {/* Profile row */}
                  <div className="flex items-center gap-4 mb-4">
                    {/* Drag handle (edit mode) */}
                    {editMode && (
                      <div
                        onTouchStart={(e) =>
                          handleDragHandleTouchStart(e, idx)
                        }
                        className="flex flex-col gap-1 items-center justify-center shrink-0 cursor-grab active:cursor-grabbing px-1 py-2"
                        style={{ touchAction: "none" }}
                      >
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="flex gap-0.5">
                            <div
                              className="w-1 h-1 rounded-full"
                              style={{ background: "#ccc" }}
                            />
                            <div
                              className="w-1 h-1 rounded-full"
                              style={{ background: "#ccc" }}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Circular avatar */}
                    <div className="relative shrink-0">
                      <div
                        className="w-16 h-16 rounded-full overflow-hidden"
                        style={{
                          background: "#f0e8d0",
                          border: "2px solid #f5e8c0",
                        }}
                      >
                        <img
                          alt="프로필"
                          src={imgBearFace}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {isMoving && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{
                            background: "#b25e09",
                            border: "2px solid white",
                          }}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <path
                              d="M5 12h14M13 6l6 6-6 6"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Name + phone */}
                    <div className="flex-1 min-w-0">
                      <p
                        style={{
                          fontFamily: "system-ui,sans-serif",
                          fontSize: 17,
                          color: "#1a1a1a",
                          margin: "0 0 4px",
                          fontWeight: 600,
                        }}
                      >
                        이름: {ward.name}
                      </p>
                      <p
                        style={{
                          fontFamily: "system-ui,sans-serif",
                          fontSize: 14,
                          color: "#555",
                          margin: 0,
                        }}
                      >
                        전화번호:{" "}
                        {ward.phone ?? "등록된 번호 없음"}
                      </p>
                    </div>

                    {/* Delete (edit mode) */}
                    {editMode && (
                      <button
                        onClick={() => deleteWard(ward.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-opacity active:opacity-60"
                        style={{ background: "#EA1E2F" }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="white"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Notification row */}
                  {!editMode &&
                    ward.notifications.length > 0 && (
                      <button
                        onClick={() => {
                          setExpandedNotif(
                            isExpanded ? null : ward.id,
                          );
                          if (!isExpanded) markAllRead(ward.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[12px] mb-3 transition-opacity active:opacity-70"
                        style={{
                          background:
                            unread > 0 ? "#fff0d6" : "#f8f8f8",
                          border:
                            unread > 0
                              ? "1.5px solid #f5c87a"
                              : "1.5px solid #eee",
                        }}
                      >
                        <span style={{ fontSize: 15 }}>🔔</span>
                        <p
                          style={{
                            ...jua,
                            fontSize: 12,
                            color:
                              unread > 0 ? "#d46b00" : "#999",
                            margin: 0,
                            flex: 1,
                            textAlign: "left",
                          }}
                        >
                          알림 {ward.notifications.length}건
                        </p>
                        {unread > 0 && (
                          <div
                            className="px-1.5 py-0.5 rounded-full"
                            style={{ background: "#EA1E2F" }}
                          >
                            <p
                              style={{
                                ...jua,
                                fontSize: 10,
                                color: "white",
                                margin: 0,
                              }}
                            >
                              새 {unread}
                            </p>
                          </div>
                        )}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          style={{
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "none",
                            transition: "transform 0.2s",
                          }}
                        >
                          <path
                            d="M6 9l6 6 6-6"
                            stroke="#999"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}

                  {/* Expanded notifications */}
                  {!editMode && isExpanded && (
                    <div
                      className="flex flex-col gap-1.5 mb-3"
                      style={{
                        animation: "slideDown 0.2s ease",
                      }}
                    >
                      {ward.notifications.map((n) => {
                        const nm = NOTIF_META[n.type] ?? {
                          icon: "!",
                          color: "#c62828",
                          bg: "#fff3f3",
                        };
                        return (
                          <div
                            key={n.id}
                            className="flex items-start gap-2.5 px-3 py-2.5 rounded-[12px]"
                            style={{
                              background: nm.bg,
                              opacity: n.read ? 0.7 : 1,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 16,
                                lineHeight: 1.4,
                              }}
                            >
                              {nm.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p
                                style={{
                                  ...jua,
                                  fontSize: 12,
                                  color: nm.color,
                                  margin: 0,
                                }}
                              >
                                {n.message}
                              </p>
                              <p
                                style={{
                                  fontFamily:
                                    "system-ui,sans-serif",
                                  fontSize: 10,
                                  color: "#aaa",
                                  margin: 0,
                                  marginTop: 2,
                                }}
                              >
                                {n.time}
                              </p>
                            </div>
                            {!n.read && (
                              <div
                                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                style={{ background: nm.color }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 모니터링하기 button */}
                  {!editMode && (
                    <button
                      onClick={() => setTracking(ward)}
                      className="w-full py-3.5 rounded-[16px] flex items-center justify-center gap-2 transition-all active:opacity-80"
                      style={{
                        background: isMoving
                          ? "linear-gradient(135deg,#b25e09 0%,#e07a20 100%)"
                          : "linear-gradient(135deg,#ffe896 0%,#ffd14e 100%)",
                        border: isMoving
                          ? "none"
                          : "1.5px solid #d9c060",
                        boxShadow: isMoving
                          ? "0 4px 16px rgba(178,94,9,0.35)"
                          : "0 2px 8px rgba(0,0,0,0.07)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          fill={isMoving ? "white" : "#b25e09"}
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="8"
                          stroke={
                            isMoving ? "white" : "#b25e09"
                          }
                          strokeWidth="2"
                        />
                        <path
                          d="M12 2V5M12 19V22M2 12H5M19 12H22"
                          stroke={
                            isMoving ? "white" : "#b25e09"
                          }
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <p
                        style={{
                          ...jua,
                          fontSize: 15,
                          color: isMoving ? "white" : "#b25e09",
                          margin: 0,
                        }}
                      >
                        모니터링하기
                      </p>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {wards.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16">
              <span style={{ fontSize: 48, opacity: 0.3 }}>
                👤
              </span>
              <p
                style={{
                  ...jua,
                  fontSize: 16,
                  color: "#bbb",
                  margin: 0,
                }}
              >
                피보호자가 없습니다
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="px-5 py-2.5 rounded-full transition-opacity active:opacity-70"
                style={{ background: "#b25e09" }}
              >
                <p
                  style={{
                    ...jua,
                    fontSize: 14,
                    color: "white",
                    margin: 0,
                  }}
                >
                  + 피보호자 추가
                </p>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add ward modal */}
      {showAdd && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40"
          style={{ zIndex: 2000 }}
        >
          <div className="bg-[#fff3c5] rounded-[24px] px-6 py-6 shadow-2xl w-[310px] flex flex-col gap-4">
            <p
              style={{
                ...jua,
                fontSize: 20,
                color: "#b25e09",
                margin: 0,
                textAlign: "center",
              }}
            >
              피보호자 연결
            </p>
            <div
              className="rounded-[12px] px-4 py-3"
              style={{
                background: "#fff9e0",
                border: "1.5px solid #d9c060",
              }}
            >
              <p
                style={{
                  ...jua,
                  fontSize: 12,
                  color: "#7c5a30",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                피보호자 앱의 개인정보 화면에서 고유 연결 코드를
                확인한 후 아래에 입력하세요.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <p
                style={{
                  ...jua,
                  fontSize: 13,
                  color: "#784835",
                  margin: 0,
                }}
              >
                별명 (선택)
              </p>
              <TapInput
                label="피보호자 별명"
                value={newName}
                onChange={setNewName}
                placeholder="구분용 이름 (예: 우리 딸)"
                className="rounded-[12px] px-4 py-3"
                style={{
                  ...jua,
                  fontSize: 16,
                  background: "#ffe896",
                  border: "1.5px solid #d9b84e",
                  color: "#3d2008",
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p
                style={{
                  ...jua,
                  fontSize: 13,
                  color: "#784835",
                  margin: 0,
                }}
              >
                피보호자 연결 코드{" "}
                <span style={{ color: "#EA1E2F" }}>*</span>
              </p>
              <TapInput
                label="연결 코드"
                value={newCode}
                onChange={(v) => {
                  setNewCode(v);
                  setLinkError("");
                }}
                placeholder="피보호자의 고유 코드 입력"
                className="rounded-[12px] px-4 py-3"
                style={{
                  ...jua,
                  fontSize: 16,
                  background: "#ffe896",
                  border: `1.5px solid ${linkError ? "#EA1E2F" : "#d9b84e"}`,
                  color: "#3d2008",
                }}
              />
              {linkError && (
                <p
                  style={{
                    ...jua,
                    fontSize: 11,
                    color: "#EA1E2F",
                    margin: 0,
                  }}
                >
                  {linkError}
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-1">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewName("");
                  setNewCode("");
                  setLinkError("");
                }}
                className="flex-1 py-3 rounded-[12px] transition-opacity active:opacity-70"
                style={{
                  ...jua,
                  background: "#413c3c",
                  color: "white",
                  fontSize: 15,
                }}
              >
                취소
              </button>
              <button
                onClick={addWard}
                disabled={linking || !newCode.trim()}
                className="flex-1 py-3 rounded-[12px] transition-opacity active:opacity-70 flex items-center justify-center gap-2"
                style={{
                  ...jua,
                  background:
                    newCode.trim() && !linking
                      ? "#b25e09"
                      : "#c9b07a",
                  color: "white",
                  fontSize: 15,
                }}
              >
                {linking && (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                {linking ? "연결 중…" : "연결"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}