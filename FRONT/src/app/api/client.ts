// ── ZIP_RO 백엔드 API 클라이언트 ──────────────────────────────────────────────

// BASE URL: localStorage("zipro_api_url")로 런타임 오버라이드 가능
// 예) localStorage.setItem("zipro_api_url","https://xxxx.ngrok-free.app")
const DEFAULT_BASE = "https://zip-r0.vercel.app";
function getBase(): string {
  try {
    return (
      localStorage.getItem("zipro_api_url") || DEFAULT_BASE
    );
  } catch {
    return DEFAULT_BASE;
  }
}

/** SSE/WebSocket 전용 서버가 분리된 경우 VITE_REALTIME_BASE_URL을 우선 사용한다. */
function getRealtimeBase(): string {
  const viteEnv = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return viteEnv?.VITE_REALTIME_BASE_URL?.replace(/\/$/, "") || getBase();
}

/** 서버가 반환한 커뮤니티 이미지 경로를 브라우저가 표시할 수 있는 절대 URL로 변환한다. */
export function resolveCommunityImageUrl(value: unknown): string | null {
  let source: unknown = value;
  if (source && typeof source === "object") {
    const file = source as Record<string, unknown>;
    source = file.url ?? file.path ?? file.image_url ?? file.imageUrl ?? file.location ?? null;
  }
  if (typeof source !== "string" || !source.trim()) return null;

  const url = source.trim();
  if (url.startsWith("data:") || url.startsWith("blob:") || /^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `${window.location.protocol}${url}`;
  return `${getBase()}${url.startsWith("/") ? url : `/${url}`}`;
}

function readCommunityImageValue(post: Record<string, unknown>): unknown {
  return post.image_url ?? post.imageUrl ?? post.image_path ?? post.imagePath ??
    post.photo_url ?? post.photoUrl ?? post.photo ?? post.image ??
    post.file_url ?? post.fileUrl ?? post.attachment_url ?? post.attachmentUrl ?? null;
}

const TOKEN_KEY = "zipro_token";
const USER_KEY = "zipro_user";
const AUTO_LOGIN_KEY = "zipro_auto_login";

// ── 토큰 / 유저 관리 ─────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(AUTO_LOGIN_KEY);
  localStorage.removeItem("zipro_role"); // 계정 전환 시 이전 역할이 남지 않도록
}

/** 현재 기기에서 자동 로그인이 선택되어 있는지 확인한다. */
export function isAutoLoginEnabled(): boolean {
  return localStorage.getItem(AUTO_LOGIN_KEY) === "true";
}

/** 로그인 화면의 자동 로그인 체크 상태를 현재 기기에 저장한다. */
export function setAutoLoginEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(AUTO_LOGIN_KEY, "true");
  else localStorage.removeItem(AUTO_LOGIN_KEY);
}

export function saveUser(u: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}
export function getSavedUser(): UserInfo | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

// ── Role 헬퍼 ─────────────────────────────────────────────────────────────────
// 서버가 "ward"/"guardian"(영어) 또는 "피보호자"/"보호자"(한국어) 어느 쪽으로 줘도 판별
export function isWardRole(
  role: string | undefined | null,
): boolean {
  const r = role?.toLowerCase() ?? "";
  return r === "ward" || r === "피보호자";
}
export function isGuardianRole(
  role: string | undefined | null,
): boolean {
  const r = role?.toLowerCase() ?? "";
  return r === "guardian" || r === "보호자";
}

// ── 공통 타입 ─────────────────────────────────────────────────────────────────

export interface UserInfo {
  user_id: string;
  role: string;
  userid?: string;
  username?: string;
  nickname?: string;
  name?: string;
  phone?: string;
  email?: string;
  ward_code?: string;
}

export interface CommonResponse<T = unknown> {
  status: number;
  message: string;
  data?: T;
}

// ── 커뮤니티 게시글 타입 ──────────────────────────────────────────────────────

export interface ApiPost {
  id: string | number;
  author_id: string | number;
  author_nickname: string | null;
  category: string;
  descrip?: string;
  content?: string;
  description?: string;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locadescrip?: string | null;
  address?: string | null;
  locationDescription?: string | null;
  created_at: string;
  is_resolved: boolean;
  like_count: number;
  resolve_count: number;
  liked_by_me: boolean;
  resolved_by_me: boolean;
}

// ── 설정 타입 ─────────────────────────────────────────────────────────────────

export interface ApiSettings {
  notifications_enabled: boolean;
  location_sharing: boolean;
  dark_mode: boolean;
  emergency_contacts: string[];
  is_test_mode: boolean;
  is_power_button_emergency: boolean;
  is_shake_emergency: boolean;
  is_vibration_enabled: boolean;
  is_sound_enabled: boolean;
  has_seen_security_help: boolean;
}

// ── 응답 정규화 헬퍼 ─────────────────────────────────────────────────────────

/** { data: T } | T 형태를 T로 정규화 */
function unwrap<T>(r: T | { data: T }): T {
  if (
    r &&
    typeof r === "object" &&
    "data" in (r as object) &&
    (r as { data: unknown }).data !== undefined
  ) {
    return (r as { data: T }).data;
  }
  return r as T;
}

/** { wards: ApiWard[] } | ApiWard[] 정규화 */
export function normalizeWards(
  r: { wards: ApiWard[] } | ApiWard[],
): ApiWard[] {
  if (Array.isArray(r)) return r;
  return (r as { wards?: ApiWard[] }).wards ?? [];
}

/** { guardians: ApiGuardian[] } | ApiGuardian[] 정규화 */
export function normalizeGuardians(
  r: { guardians: ApiGuardian[] } | ApiGuardian[],
): ApiGuardian[] {
  if (Array.isArray(r)) return r;
  return (r as { guardians?: ApiGuardian[] }).guardians ?? [];
}

/** { posts: ApiPost[] } | ApiPost[] 정규화 및 이미지 URL 자동 보정 */
export function normalizePosts(
  r:
    | { posts?: ApiPost[]; data?: { posts?: ApiPost[] } }
    | ApiPost[],
): ApiPost[] {
  const obj = r as {
    data?: { posts?: ApiPost[] };
    posts?: ApiPost[];
  };
  const posts = Array.isArray(r) ? r : (obj.data?.posts ?? obj.posts ?? []);

  return posts.map((post) => {
    const rawPost = post as ApiPost & Record<string, unknown>;
    return {
      ...post,
      image_url: resolveCommunityImageUrl(readCommunityImageValue(rawPost)),
    };
  });
}

/** ApiSettings 정규화 */
export function normalizeSettings(
  r: ApiSettings | { data: ApiSettings },
): ApiSettings {
  return unwrap(r) as ApiSettings;
}

/** ward/guardian linkWard 응답 정규화 */
export function normalizeWard(
  r: { ward: ApiWard } | ApiWard,
): ApiWard {
  if ("ward" in (r as object))
    return (r as { ward: ApiWard }).ward;
  return r as ApiWard;
}

/** { items: ApiSafeRouteHistoryItem[] } | ApiSafeRouteHistoryItem[] 정규화 */
export function normalizeSafeRouteHistory(
  r:
    | { items: ApiSafeRouteHistoryItem[] }
    | ApiSafeRouteHistoryItem[],
): ApiSafeRouteHistoryItem[] {
  if (Array.isArray(r)) return r;
  return (
    (r as { items?: ApiSafeRouteHistoryItem[] }).items ?? []
  );
}

/** { route: ApiActiveSafeRoute } | ApiActiveSafeRoute | null 정규화 */
export function normalizeActiveSafeRoute(
  r: { route: ApiActiveSafeRoute } | ApiActiveSafeRoute | null,
): ApiActiveSafeRoute | null {
  if (!r) return null;
  if ("route" in (r as object))
    return (r as { route: ApiActiveSafeRoute }).route;
  return r as ApiActiveSafeRoute;
}

// ── 공통 fetch 래퍼 ───────────────────────────────────────────────────────────

async function req<T = unknown>(
  path: string,
  options: RequestInit = {},
  skipContentType = false,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(skipContentType
      ? {}
      : { "Content-Type": "application/json" }),
    "ngrok-skip-browser-warning": "true",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(`${getBase()}${path}`, {
      ...options,
      headers,
      credentials: "omit",
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (
      msg.toLowerCase().includes("failed to fetch") ||
      msg.toLowerCase().includes("networkerror")
    ) {
      throw new Error(
        "서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.",
      );
    }
    throw new Error(`네트워크 오류: ${msg}`);
  }

  if (res.status === 204) return undefined as T;

  // 401 Unauthorized 발생 시 자동으로 세션 정리
  if (res.status === 401) {
    clearAuth();
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (json as { detail?: string }).detail ??
      (json as { message?: string }).message ??
      `서버 오류 (${res.status})`;
    throw new Error(detail);
  }
  return json as T;
}

/**
 * 배포 중인 레거시 모니터링 경로를 먼저 호출하고, 아직 명세 경로만 배포된 서버에서는 신규 경로로 자동 전환한다.
 * 연결된 피보호자 목록이 사라지는 회귀를 방지하기 위한 과도기 호환 처리다.
 */
async function reqMonitoringCompatible<T>(
  legacyPath: string,
  specPath: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    return await req<T>(legacyPath, options);
  } catch {
    return req<T>(specPath, options);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface SignupResult {
  access_token: string;
  role: string;
  user_id: string;
  nickname?: string;
  data?: {
    access_token: string;
    role: string;
    user_id: string;
    nickname?: string;
  };
}

export const authApi = {
  signupWard: (data: {
    userid: string;
    username: string;
    password: string;
    phone?: string;
    email?: string;
  }) =>
    req<SignupResult>("/auth/signup/ward", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  signupGuardian: (data: {
    userid: string;
    username: string;
    password: string;
    phone?: string;
    email?: string;
    wardcode: string;
  }) =>
    req<SignupResult>("/auth/signup/guardian", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: {
    userid: string;
    password: string;
    autologin?: boolean;
  }) =>
    req<SignupResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** GET /auth/me */
  me: () =>
    req<{
      id?: string;
      user_id?: string;
      userid?: string;
      username?: string;
      role: string;
      nickname?: string;
      ward_code?: string;
      wardcode?: string;
      name?: string;
      phone?: string;
      email?: string;
    }>("/auth/me"),

  /**
   * 프로필 수정 → PATCH /users/me
   */
  updateProfile: (data: {
    name?: string;
    phone?: string;
    gender?: string;
    birthdate?: string;
    email?: string;
  }) =>
    req<UserInfo>("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        username: data.name,
        phone: data.phone,
        gender: data.gender,
        birthdate: data.birthdate,
        email: data.email,
      }),
    }),

  // 변경 후
// GET /auth/my-code (Vercel) → Supabase users 테이블 직접 조회로 대체 (404 해결)
// 이렇게 rpc 호출로 되어 있어야 함
myCode: async (): Promise<{ code: string }> => {
  const savedUser = getSavedUser();
  if (!savedUser?.user_id) return { code: "" };

  const { data, error } = await supabase.rpc("get_ward_code", {
    p_user_id: savedUser.user_id,
  });

  if (error) {
    console.error("wardcode 조회 실패:", error);
    return { code: "" };
  }

  return { code: data ?? "" };
},
};

// ── Community ─────────────────────────────────────────────────────────────────

export const communityApi = {
  /** GET /community/posts */
  list: (params: {
    lat: number;
    lng: number;
    category?: string;
    keyword?: string;
  }) => {
    const q = new URLSearchParams();
    q.set("lat", String(params.lat));
    q.set("lng", String(params.lng));
    if (params.category && params.category !== "전체")
      q.set("category", params.category);
    if (params.keyword) q.set("keyword", params.keyword);
    return req<{ posts: ApiPost[]; total: number } | ApiPost[]>(
      `/community/posts?${q.toString()}`,
    );
  },

  /** POST /community/posts — multipart/form-data */
  create: async (data: {
    category: string;
    descrip: string;
    lat: number;
    lng: number;
    locadescrip: string;
    imageFile?: File | null;
  }): Promise<ApiPost> => {
    const token = getToken();
    const user = getSavedUser();
    const form = new FormData();
    form.append("category", data.category);
    form.append("descrip", data.descrip);
    form.append("lat", String(data.lat));
    form.append("lng", String(data.lng));
    form.append("locadescrip", data.locadescrip);
    if (user?.user_id)
      form.append("userid", String(user.user_id));
    if (data.imageFile) form.append("image", data.imageFile);

    const res = await fetch(`${getBase()}/community/posts`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "ngrok-skip-browser-warning": "true",
      },
      body: form,
      credentials: "omit",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        (json as { detail?: string }).detail ??
          "게시글 작성 실패",
      );
    return ((json as { data?: ApiPost }).data ??
      json) as ApiPost;
  },

  /** POST /community/posts/{post_id}/like */
  like: (postId: string | number) =>
    req<{ liked: boolean; like_count: number }>(
      `/community/posts/${postId}/like`,
      { method: "POST" },
    ),

  /** POST /community/posts/{post_id}/resolve */
  resolve: (postId: string | number) =>
    req<{
      resolved_by_me: boolean;
      resolve_count: number;
      is_resolved: boolean;
    }>(`/community/posts/${postId}/resolve`, {
      method: "POST",
    }),

  delete: (postId: string | number) =>
    req(`/community/posts/${postId}`, { method: "DELETE" }),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  user_id?: string;
  userid?: string;
  username?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  ward_code?: string;
}

export const usersApi = {
  /** GET /users/me */
  getMe: () => req<UserProfile>("/users/me"),

  /** PATCH /users/me */
  updateMe: (data: {
    username?: string;
    email?: string;
    phone?: string;
  }) =>
    req<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  /** GET /settings */
  get: () =>
    req<ApiSettings | { data: ApiSettings }>("/settings"),

  /** PATCH /settings */
  patch: (data: Partial<ApiSettings>) =>
    req<ApiSettings | { data: ApiSettings }>("/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAccount: () =>
    req("/settings/account", { method: "DELETE" }),
};

// ── Monitoring ────────────────────────────────────────────────────────────────

export interface ApiWard {
  user_id: string | number;
  nickname: string | null;
  name: string | null;
  username?: string | null;
  ward_code: string;
  status?: "집에 있음" | "이동중" | "위험" | string;
  battery?: number | null;
  phone?: string | null;
  monitoring_allowed?: boolean;
  address?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  last_updated_at?: string | null;
}

export interface ApiGuardian {
  user_id: string;
  nickname: string;
  name: string | null;
}

// ── 안심경로(출발/도착/경유) ────────────────────────────────────────────────

export interface ApiSafeRoutePoint {
  lat: number;
  lng: number;
  address: string;
  name?: string;
}

export interface ApiActiveSafeRoute {
  route_id: string;
  status: "in_progress" | "completed" | "cancelled";
  started_at: string;
  ended_at?: string | null;
  departure: ApiSafeRoutePoint;
  arrival: ApiSafeRoutePoint;
  route_source?: "internal" | "osrm";
  waypoints: [number, number][];
}

export interface ApiSafeRouteHistoryItem {
  route_id: string;
  status: "in_progress" | "completed" | "cancelled";
  started_at: string;
  ended_at?: string | null;
  from_address: string;
  to_address: string;
}

// ── SOS 녹음 음성파일 ────────────────────────────────────────────────────────

export interface ApiEmergencyAudio {
  audio_url: string;
  recorded_at: string;
  duration_sec: number;
}

export interface MonitoringSession {
  session_id: string;
  start_loc?: string;
  dest_loc?: string;
  lat?: number;
  lng?: number;
  status?: string;
  [key: string]: any;
}

export const monitoringApi = {
  /** 목록은 현재 배포된 레거시 경로를 우선 사용하고 명세 경로로 폴백한다. */
  getWards: () =>
    reqMonitoringCompatible<{ wards: ApiWard[] } | ApiWard[]>(
      "/api/v1/monitoring/wards",
      "/api/v1/wards",
    ),

  /**
   * POST /api/v1/wards/link
   * Body: { wardcode: string }
   */
  linkWard: (wardcode: string) =>
    reqMonitoringCompatible<{ ward: ApiWard } | ApiWard>(
      "/api/v1/monitoring/link",
      "/api/v1/wards/link",
      {
        method: "POST",
        body: JSON.stringify({ wardcode }),
      },
    ),

  /** GET /api/v1/monitoring/guardians */
  getGuardians: () =>
    req<{ guardians: ApiGuardian[] } | ApiGuardian[]>(
      "/api/v1/monitoring/guardians",
    ),

  /** GET /api/v1/wards/{id}/location — 위치가 없거나 권한이 없으면 403/404 */
  getWardLocation: (wardUserId: string | number) =>
    reqMonitoringCompatible<{
      ward_id?: string | number;
      latitude: number;
      longitude: number;
      address: string;
      accuracy_m?: number;
      speed_mps?: number;
      battery?: number;
      created_at: string;
    } | null>(
      `/api/v1/monitoring/wards/${wardUserId}/location`,
      `/api/v1/wards/${wardUserId}/location`,
    ),

  /**
   * GET /api/v1/wards/{id}/location/stream — SSE 우선 위치 구독.
   * EventSource는 Authorization 헤더를 지원하지 않으므로 명세의 1회성 토큰 쿼리를 사용한다.
   * 연결 오류 시 내부적으로 7초 간격 폴링으로 전환하고, 반환된 함수는 스트림과 폴링을 모두 해제한다.
   */
  subscribeWardLocation: (
    wardUserId: string | number,
    onLocation: (location: {
      ward_id?: string | number;
      latitude: number;
      longitude: number;
      address?: string;
      accuracy_m?: number;
      speed_mps?: number;
      battery?: number;
      created_at?: string;
    }) => void,
    onError?: (error: unknown) => void,
  ): (() => void) => {
    let closed = false;
    let pollingStarted = false;
    let pollingTimer: number | undefined;
    const stream = new EventSource(
      monitoringApi.getWardLocationStreamUrl(wardUserId),
      { withCredentials: false },
    );

    const pollLocation = async () => {
      if (closed) return;
      try {
        const location = await monitoringApi.getWardLocation(wardUserId);
        if (location) onLocation(location);
      } catch (error) {
        onError?.(error);
      } finally {
        if (!closed) pollingTimer = window.setTimeout(pollLocation, 7_000);
      }
    };
    const startPollingFallback = () => {
      if (pollingStarted || closed) return;
      pollingStarted = true;
      stream.close();
      void pollLocation();
    };
    const handleLocation = (event: MessageEvent<string>) => {
      try {
        onLocation(JSON.parse(event.data));
      } catch (error) {
        onError?.(error);
      }
    };

    stream.addEventListener("location", handleLocation as EventListener);
    stream.onmessage = handleLocation;
    stream.onerror = (event) => {
      onError?.(event);
      startPollingFallback();
    };

    // SSE 첫 이벤트를 기다리는 동안에도 초기 위치를 빠르게 한 번 조회한다.
    void monitoringApi.getWardLocation(wardUserId)
      .then((location) => { if (location && !closed) onLocation(location); })
      .catch((error) => onError?.(error));

    return () => {
      closed = true;
      stream.close();
      if (pollingTimer != null) window.clearTimeout(pollingTimer);
    };
  },

  /** 피보호자: 실시간 위치 업데이트 — POST /emergency/monitoring/location */
  updateLocation: (
    lat: number,
    lng: number,
    address?: string,
  ) =>
    req("/emergency/monitoring/location", {
      method: "POST",
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        address: address ?? "",
      }),
    }),

  /**
   * POST /api/v1/monitoring/sessions
   * Body: start_loc, dest_loc, lat, lng, progress, estimated_time_minutes
   */
  startMonitoring: (data: {
    start_loc: string;
    dest_loc: string;
    lat: number;
    lng: number;
    progress: number;
    estimated_time_minutes?: number;
  }) =>
    req<MonitoringSession>("/api/v1/monitoring/sessions", {
      method: "POST",
      body: JSON.stringify({
        start_loc: data.start_loc,
        dest_loc: data.dest_loc,
        lat: data.lat,
        lng: data.lng,
        progress: data.progress,
        estimated_time_minutes:
          data.estimated_time_minutes ?? 20,
      }),
    }),

  /** GET /api/v1/monitoring/sessions/{session_id} */
  getMonitoringSession: (sessionId: string) =>
    req<MonitoringSession>(
      `/api/v1/monitoring/sessions/${sessionId}`,
    ),

  /** GET /api/v1/wards/{id}/safe-route/active — 진행중 안심경로 (출발/도착/경유) */
  getActiveSafeRoute: (wardUserId: string | number) =>
    reqMonitoringCompatible<
      { route: ApiActiveSafeRoute } | ApiActiveSafeRoute | null
    >(
      `/api/v1/monitoring/wards/${wardUserId}/safe-route/active`,
      `/api/v1/wards/${wardUserId}/safe-route/active`,
    ).then(normalizeActiveSafeRoute),

  /** GET /api/v1/wards/{id}/safe-route/history?limit=20 — 안심경로 이력(타임라인) */
  getSafeRouteHistory: (
    wardUserId: string | number,
    limit = 20,
  ) =>
    reqMonitoringCompatible<
      | { items: ApiSafeRouteHistoryItem[] }
      | ApiSafeRouteHistoryItem[]
    >(
      `/api/v1/monitoring/wards/${wardUserId}/safe-route/history?limit=${limit}`,
      `/api/v1/wards/${wardUserId}/safe-route/history?limit=${limit}`,
    ).then(normalizeSafeRouteHistory),

  /**
   * POST /api/v1/monitoring/emergency/resolve
   * Body: { emergency_id? }
   */
  resolveEmergency: (emergencyId?: string) => {
    // 신규 명세는 emergency_id가 있는 경로를 사용한다. 레거시 호출은 기존 엔드포인트로 호환한다.
    if (emergencyId) {
      return req(`/api/v1/emergencies/${emergencyId}/resolve`, { method: "POST" });
    }
    return req("/api/v1/monitoring/emergency/resolve", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  /** GET /api/v1/emergencies/{emergency_id}/audio — SOS 녹음 음성파일 */
  getEmergencyAudio: (emergencyId: string) =>
    req<ApiEmergencyAudio | null>(
      `/api/v1/emergencies/${emergencyId}/audio`,
    ),

  /**
   * 실시간 위치 스트림(SSE) URL 생성
   */
  getWardLocationStreamUrl: (
    wardUserId: string | number,
  ): string => {
    const token = getToken();
    const q = token
      ? `?token=${encodeURIComponent(token)}`
      : "";
    return `${getRealtimeBase()}/api/v1/wards/${wardUserId}/location/stream${q}`;
  },

  /**
   * SOS 실시간 WebSocket URL 생성
   */
  getEmergencyWsUrl: (
    channel: "wards" | "guardians",
    id: string | number,
  ): string => {
    const token = getToken();
    const wsBase = getRealtimeBase().replace(/^http/, "ws");
    const q = token
      ? `?token=${encodeURIComponent(token)}`
      : "";
    return `${wsBase}/ws/${channel}/${id}/emergencies${q}`;
  },
};

// ── FCM ───────────────────────────────────────────────────────────────────────

export const fcmApi = {
  /** POST /fcm/register */
  registerToken: (fcm_token: string) =>
    req("/fcm/register", {
      method: "POST",
      body: JSON.stringify({ fcm_token }),
    }),
};

// ── Monitor notifications ──────────────────────────────────────────────────────

export const monitorNotifApi = {
  // ❌ 기존: req("/api/v1/monitoring/notify", { method: "POST" }),
  
  // ✅ 수정: 백엔드 Swagger에 실제 존재하는 세션 생성 API로 변경
  sendAlert: (payload?: any) =>
    req("/api/v1/monitoring/sessions", { 
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined 
    }),

  forceStop: () =>
    req("/api/v1/monitoring/stop", { method: "POST" }),
};

// ── Emergency ─────────────────────────────────────────────────────────────────

export const emergencyApi = {
  /** POST /emergency/siren/me?lat=...&lng=... */
  siren: (lat: number, lng: number) =>
    req(`/emergency/siren/me?lat=${lat}&lng=${lng}`, {
      method: "POST",
    }),

  /** POST /emergency/disguise/me?lat=...&lng=... */
  disguise: (lat: number, lng: number) =>
    req(`/emergency/disguise/me?lat=${lat}&lng=${lng}`, {
      method: "POST",
    }),

  sos: () => req("/emergency/sos", { method: "POST" }),

  report: async (data: {
    triggerSource: string;
    lat: number;
    lng: number;
    address?: string;
    audioFile?: File | null;
  }) => {
    const token = getToken();
    const form = new FormData();
    form.append("triggerSource", data.triggerSource);
    form.append("latitude", String(data.lat));
    form.append("longitude", String(data.lng));
    if (data.address) form.append("address", data.address);
    if (data.audioFile)
      form.append("audioFile", data.audioFile);

    const res = await fetch(`${getBase()}/emergency/report`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "ngrok-skip-browser-warning": "true",
      },
      body: form,
      credentials: "omit",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        (json as { detail?: string }).detail ?? "신고 실패",
      );
    return json;
  },
};

// ESM CDN 방식으로 Supabase 라이브러리 로드 (npm install 필요 없음)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1단계에서 확인한 URL과 Key 설정
const SUPABASE_URL = 'https://gciayvimplfpokbgqjjq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjaWF5dmltcGxmcG9rYmdxampxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMDA1ODUsImV4cCI6MjEwMTU3NjU4NX0.IwhWiKtxKmxVX9SR-JnOqJryBQwp51eKMK5j8vZuwxw';

// 다른 파일에서 가져다 쓸 수 있도록 export
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


