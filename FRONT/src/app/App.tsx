import { useState, useRef, useEffect } from "react";

import imgAppIcon    from "@/imports/Frame4/ced709845bdb9c9f309508a14cced3ddb1ec2b02.png";
// 지워진 이미지를 빈 문자열(또는 정상 출력되는 다른 배경)로 대체
const imgRectangle   = imgLoadingBg; 
import imgLoadingBg  from "@/imports/Loading-2/94e4a2fedbf363b021d26cae1904ddf02ea01500.png";

import type { Screen, Role } from "./shared/types";
import { jua, DESIGN_W, DESIGN_H, FADE_MS, TRANSITION_CSS } from "./shared/constants";
import { authApi, setToken, saveUser, clearAuth, getToken, getSavedUser, fcmApi, isAutoLoginEnabled, setAutoLoginEnabled } from "./api/client";
import { requestFcmToken, onForegroundMessage } from "./firebase";
import { LogoLetters } from "./shared/SharedUI";

import {
  RoleSelectScreen,
  PibohojaScreen,
  BohojaScreen,
  IdSetupScreen,
  LoginScreen,
  GeneralLoginScreen,
  LoadingScreen,
} from "./screens/AuthScreens";
import { MainScreen }               from "./screens/MainScreen";
import { PersonalInfoScreen }        from "./screens/PersonalInfoScreen";
import { SettingsScreen }            from "./screens/SettingsScreen";
import { MonitoringScreen }          from "./screens/MonitoringScreen";
import { GuardianMonitoringScreen }  from "./screens/GuardianMonitoringScreen";
import { SecurityScreen }            from "./screens/SecurityScreen";
import { CommunityScreen }           from "./screens/CommunityScreen";

// ── Role 정규화 ───────────────────────────────────────────────────────────────
// 서버가 "guardian"/"ward"(영어) 또는 "보호자"/"피보호자"(한국어) 어느 형태로 줘도 통일
function normalizeRole(role: string | undefined | null): Role {
  const r = role?.toLowerCase() ?? "";
  if (r === "guardian" || r === "보호자") return "보호자";
  return "피보호자"; // "ward", "피보호자", 기타 모두 피보호자
}

// ── PWA / viewport meta injection ────────────────────────────────────────────
if (typeof document !== "undefined") {
  const setMeta = (name: string, content: string) => {
    let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
    el.content = content;
  };
  setMeta("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content");

  // position:fixed on html/body → iOS keyboard가 올라올 때 viewport를 밀어올리는 원인이 됨
  // height:100%+overflow:hidden 만으로 스크롤 차단 (fixed 제거)
  document.documentElement.style.cssText = "height:100%;overflow:hidden;overscroll-behavior:none;touch-action:manipulation;background:#fff3c5;";
  document.body.style.cssText = "height:100%;overflow:hidden;margin:0;padding:0;overscroll-behavior:none;background:#fff3c5;touch-action:manipulation;";

  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  setMeta("apple-mobile-web-app-title", "ZIP RO");
  setMeta("mobile-web-app-capable", "yes");
  setMeta("theme-color", "#c8e8b0");

  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.json";
    document.head.appendChild(link);
  }

  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').forEach(el => el.remove());
  const addIcon = (rel: string, extra?: Record<string, string>) => {
    const el = document.createElement("link");
    el.rel = rel;
    el.href = imgAppIcon;
    if (extra) Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  addIcon("icon", { type: "image/png" });
  addIcon("shortcut icon", { type: "image/png" });
  addIcon("apple-touch-icon");
  addIcon("apple-touch-icon-precomposed");

  document.title = "Safe ZIP RO";
}

// ── Stable viewport hook ──────────────────────────────────────────────────────
function useStableViewport() {
  const [w, setW] = useState(() => window.innerWidth);

  useEffect(() => {
    let lastW = window.innerWidth;
    const update = () => {
      const newW = window.innerWidth;
      if (newW !== lastW) { lastW = newW; setW(newW); }
    };
    window.addEventListener("resize", update);
    screen.orientation?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      screen.orientation?.removeEventListener("change", update);
    };
  }, []);

  return { w, h: 0 };
}


// ── renderContent ─────────────────────────────────────────────────────────────

function renderContent(
  s: Screen,
  nav: (to: Screen) => void,
  onEmergencyFromSettings: () => void,
  pendingEmergency = false,
  onAutoStarted = () => {},
  transitDest: Screen | null = null,
  setTransitDest: (d: Screen | null) => void = () => {},
  userRole: Role = "피보호자",
  setUserRole: (r: Role) => void = () => {},
  _onRegistered: () => void = () => {},
  onSignup: (u: string, p: string) => Promise<void> = async () => {},
  onLogin: (u: string, p: string, autoLogin?: boolean) => Promise<void> = async () => {},
  onSetSignupExtra: (d: { name?: string; email?: string; phone?: string; wardCode?: string }) => void = () => {},
  onLogout: () => void = () => {},
) {
  switch (s) {
    case "role-select": return <RoleSelectScreen onNext={(r) => { setUserRole(r); nav(r === "피보호자" ? "pibohoja" : "bohoja"); }} onLogin={() => nav("general-login")} />;
    case "pibohoja":    return <PibohojaScreen
      onNext={(d) => { onSetSignupExtra({ name: d.name, email: d.email, phone: d.phone }); nav("id-setup"); }}
      onBack={() => nav("role-select")}
      onLogin={() => nav("general-login")} />;
    case "bohoja":      return <BohojaScreen
      onNext={(d) => { onSetSignupExtra({ name: d.name, email: d.email, phone: d.phone, wardCode: d.wardCode }); nav("id-setup"); }}
      onBack={() => nav("role-select")}
      onLogin={() => nav("general-login")} />;
    case "id-setup":    return <IdSetupScreen onSignup={onSignup} />;
    case "login":         return <LoginScreen onNext={onLogin} />;
    case "loading":       return <LoadingScreen
      duration={transitDest ? 2500 : 5000}
      onDone={() => {
        const dest = transitDest;
        setTransitDest(null);
        nav(dest ?? "main");
      }}
    />;
    case "main":          return <MainScreen onLogout={onLogout} onNavigate={nav} autoStart={pendingEmergency} onAutoStarted={onAutoStarted} />;
    case "즐겨찾는장소":   return <MainScreen onLogout={onLogout} onNavigate={nav} initialNavMode="favorite-map" />;
    case "general-login": return <GeneralLoginScreen onLogin={onLogin} onSignup={() => nav("role-select")} />;
    case "개인정보":       return <PersonalInfoScreen  onBack={() => nav("main")} onLogout={onLogout} />;
    case "설정":           return <SettingsScreen      onBack={() => nav("main")} onEmergency={onEmergencyFromSettings} onNavigate={nav} />;
    case "모니터링":       return userRole === "보호자"
      ? <GuardianMonitoringScreen onBack={() => nav("main")} onNavigate={nav} />
      : <MonitoringScreen         onBack={() => nav("main")} onNavigate={nav} />;
    case "커뮤니티":       return <CommunityScreen     onBack={() => nav("main")} />;
    case "보안화면":       return <SecurityScreen      onBack={() => nav("main")} onEmergency={onEmergencyFromSettings} />;
  }
}

// ── Root App ──────────────────────────────────────────────────────────────────

const STORAGE_KEY_REGISTERED = "zipro_registered";
const STORAGE_KEY_ROLE = "zipro_role";

function getInitialScreen(urlAction: string | null): Screen {
  if (urlAction === "emergency") return "main";
  // 자동 로그인에 체크했고 이전 인증 토큰이 남아 있으면 앱을 다시 열어도 곧바로 메인으로 진입한다.
  if (isAutoLoginEnabled() && getToken()) return "main";
  const registered = localStorage.getItem(STORAGE_KEY_REGISTERED);
  if (registered === "true") return "general-login";
  return "role-select";
}

function getSavedRole(): Role {
  // 저장된 유저 정보의 role 우선 → role 전용 키 순서로 확인
  const savedUser = getSavedUser();
  if (savedUser?.role) return normalizeRole(savedUser.role);
  const saved = localStorage.getItem(STORAGE_KEY_ROLE);
  return normalizeRole(saved);
}

export default function App() {
  const urlAction = new URLSearchParams(window.location.search).get("action");
  const initScreen: Screen = getInitialScreen(urlAction);
  const initEmergency = urlAction === "emergency";

  const [current, setCurrent]               = useState<Screen>(initScreen);
  const [leaving, setLeaving]               = useState<Screen | null>(null);
  const [busy, setBusy]                     = useState(false);
  const [pendingEmergency, setPendingEmergency] = useState(initEmergency);
  const [transitDest, setTransitDest]       = useState<Screen | null>(null);
  const [userRole, setUserRole]             = useState<Role>(getSavedRole());

  // 회원가입 단계별 누적 데이터 (ref: 리렌더 없이 보관)
  const signupDataRef = useRef<{
    name?: string;
    email?: string;
    phone?: string;
    wardCode?: string;
    role?: Role;
  }>({});

  function handleSetUserRole(r: Role) {
    setUserRole(r);
    localStorage.setItem(STORAGE_KEY_ROLE, r);
  }

  function markRegistered() {
    localStorage.setItem(STORAGE_KEY_REGISTERED, "true");
  }

  // 회원가입 API 호출 (IdSetupScreen에서 호출)
  // 주의: 첫 번째 인수 loginId = 아이디(userid), extra.name = 실명(username)
  async function handleSignup(loginId: string, password: string): Promise<void> {
    const extra = signupDataRef.current;
    const role = extra.role ?? userRole;
    // 전화번호에 대시/공백이 포함되면 숫자만 추출 (DTO: "01012345678")
    const phone = extra.phone?.replace(/\D/g, "") || undefined;
    let result;
    if (role === "피보호자") {
      result = await authApi.signupWard({
        userid:   loginId,           // 로그인 아이디 → DTO "userid"
        username: extra.name ?? "",  // 실명          → DTO "username"
        password,
        phone,
        email: extra.email || undefined,
      });
    } else {
      if (!extra.wardCode) throw new Error("연결코드를 입력해주세요.");
      result = await authApi.signupGuardian({
        userid:   loginId,           // 로그인 아이디 → DTO "userid"
        username: extra.name ?? "",  // 실명          → DTO "username"
        password,
        phone,
        email: extra.email || undefined,
        wardcode: extra.wardCode,    // 연결코드       → DTO "wardcode"
      });
    }
    setToken(result.access_token ?? result.data?.access_token ?? "");
    saveUser({
      user_id: result.user_id ?? result.data?.user_id ?? "",
      role: result.role ?? result.data?.role ?? "",
      nickname: result.nickname ?? result.data?.nickname,
      userid: loginId,
      username: extra.name,
      name: extra.name,
      phone,
      email: extra.email,
    });
    // 회원가입 시 입력한 정보를 개인정보 화면에 즉시 반영
    try {
      localStorage.setItem("zipro_profile", JSON.stringify({
        name:      extra.name ?? "",
        email:     extra.email ?? "",
        phone:     phone ?? "",
        gender:    "",
        birthdate: "",
        code:      "",
        profileImg: "",
      }));
    } catch { /* ignore */ }
    handleSetUserRole(normalizeRole(result.role ?? result.data?.role));
    markRegistered();
    nav("login");
  }

  // FCM 토큰 등록 (로그인 후 호출)
  async function registerFcmToken() {
    try {
      const token = await requestFcmToken();
      if (token) await fcmApi.registerToken(token);
    } catch { /* 알림 거부 등 무시 */ }
  }

  // 로그인 API 호출 (LoginScreen / GeneralLoginScreen에서 호출)
  async function handleLogin(username: string, password: string, autoLogin = false): Promise<void> {
    const result = await authApi.login({ userid: username, password });

    // 이전 로그인 정보는 초기화하되, 계정별 즐겨찾기 장소 데이터는 보존한다.
    // (기존 단일 키 zipro_favorites도 첫 업데이트 시 자동 이전될 수 있도록 함께 유지)
    try {
      const preservedFavorites: Array<[string, string]> = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || (key !== "zipro_favorites" && !key.startsWith("zipro_favorites:"))) continue;
        const value = localStorage.getItem(key);
        if (value !== null) preservedFavorites.push([key, value]);
      }
      localStorage.clear();
      preservedFavorites.forEach(([key, value]) => localStorage.setItem(key, value));
    } catch { /* ignore */ }

    // 새 토큰·유저 정보 저장
    setToken(result.access_token);
    // 자동 로그인 여부는 서버 DB가 아니라 사용자의 현재 기기에 저장한다.
    // 로그아웃하면 clearAuth()가 이 설정과 토큰을 함께 지운다.
    setAutoLoginEnabled(autoLogin);
    saveUser({
      user_id: result.user_id,
      role: result.role,
      nickname: result.nickname,
      username,
    });
    handleSetUserRole(normalizeRole(result.role));
    registerFcmToken();
    nav("loading");
  }

  // 로그아웃
  function handleLogout() {
    clearAuth();
    nav("general-login");
  }

  // 자동 로그인으로 시작한 경우에만 토큰을 서버에서 검증하고 실제 역할을 최신화한다.
  useEffect(() => {
    const token = getToken();
    if (!token || !isAutoLoginEnabled()) return;
    authApi.me().then(me => {
      if (!me.role) return;
      const role = normalizeRole(me.role);
      const saved = getSavedUser();
      if (saved) saveUser({ ...saved, role: me.role });
      handleSetUserRole(role);
    }).catch(() => {
      // 만료되었거나 유효하지 않은 토큰은 제거하고 일반 로그인으로 돌린다.
      clearAuth();
      setCurrent("general-login");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 포그라운드 FCM 메시지 → 인앱 알림 토스트
  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? "ZIP RO 알림";
      const body  = payload.notification?.body  ?? "";
      const type  = payload.data?.type ?? "";

      // 긴급신고는 별도 UI 없이 진동+소리로 강조
      if (type === "emergency" && "vibrate" in navigator) {
        navigator.vibrate([300, 100, 300, 100, 300]);
      }

      // 간단한 알림 배너 (브라우저 Notification API)
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/icon-192.png" });
      }
    });
    return unsub;
  }, []);

  const { w: vw } = useStableViewport();
  const scale = vw > 0 ? vw / DESIGN_W : 1;

  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preventScroll = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    window.addEventListener("scroll", preventScroll, { passive: true });

    const onBlur = () => { requestAnimationFrame(() => window.scrollTo(0, 0)); };
    document.addEventListener("focusout", onBlur, true);

    // iOS Safari: input focus 시 화면이 위로 밀려 올라가는 현상 방지
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        // iOS가 scrollIntoView로 화면을 끌어올리기 전에 포지션을 고정
        requestAnimationFrame(() => { window.scrollTo(0, 0); });
      }
    };
    document.addEventListener("focus", onFocus, true);

    if (outerRef.current) outerRef.current.style.background = outerRef.current.style.background || "#fff3c5";

    return () => {
      window.removeEventListener("scroll", preventScroll);
      document.removeEventListener("focusout", onBlur, true);
      document.removeEventListener("focus", onFocus, true);
    };
  }, []);

  const TRANSIT_SCREENS: Screen[] = ["커뮤니티", "개인정보"];

  function nav(to: Screen) {
    if (busy) return;
    if (TRANSIT_SCREENS.includes(to) && current !== "loading") {
      setBusy(true);
      setTransitDest(to);
      setLeaving(current);
      setCurrent("loading");
      setTimeout(() => { setLeaving(null); setBusy(false); }, FADE_MS);
      return;
    }
    setBusy(true);
    setLeaving(current);
    setCurrent(to);
    setTimeout(() => { setLeaving(null); setBusy(false); }, FADE_MS);
  }

  // 즐겨찾는 장소는 MainScreen 내부의 지도 모드를 재사용하므로 메인 화면과 동일한 배경·로고 규칙을 적용한다.
  const isMain  = (s: Screen | null) => s === "main" || s === "즐겨찾는장소";
  const showBg  = !isMain(current);
  const noLogo  = ["loading","main","즐겨찾는장소","개인정보","설정","모니터링","커뮤니티","보안화면"];
  const showLogo = !noLogo.includes(current) && !noLogo.includes(leaving ?? "");

  const LOGIN_SCREENS:   Screen[] = ["role-select","pibohoja","bohoja","id-setup","login","general-login"];
  const MAIN_SCREENS:   Screen[] = ["main","즐겨찾는장소","개인정보","설정","모니터링","커뮤니티"];
  const LOADING_SCREENS: Screen[] = ["loading"];
  const DARK_SCREENS:   Screen[] = ["보안화면"];
  const outerBg = (() => {
    const s = current;
    if (DARK_SCREENS.includes(s))    return "linear-gradient(180deg,#0a0a14 0%,#111827 50%,#0a0f1a 100%)";
    if (LOADING_SCREENS.includes(s)) return `url(${imgLoadingBg}) center/cover no-repeat`;
    if (MAIN_SCREENS.includes(s))    return "#fff3c5";
    if (LOGIN_SCREENS.includes(s))   return `url(${imgRectangle}) center/cover no-repeat`;
    return "#fff3c5";
  })();

  useEffect(() => {
    const isDark = current === "보안화면";
    const bg = isDark ? "#0a0a14" : "#fff3c5";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [current]);

  const emergencyNav = () => { setPendingEmergency(true); nav("main"); };

  return (
    <>
      <style>{TRANSITION_CSS}</style>
      <div
        ref={outerRef}
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          background: outerBg,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background image — shown on non-main screens */}
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundImage: `url(${imgRectangle})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: showBg ? 1 : 0,
              transition: `opacity ${FADE_MS}ms ease`,
              pointerEvents: "none",
            }}
          />

          {showLogo && <LogoLetters />}

          {/* Leaving screen (fade out) */}
          {leaving && (
            <div
              key={`out-${leaving}`}
              style={{ position: "absolute", inset: 0, animation: `zp-fade-out ${FADE_MS}ms ease forwards`, pointerEvents: "none" }}
            >
              {renderContent(leaving, nav, emergencyNav, false, () => {}, transitDest, setTransitDest, userRole, handleSetUserRole, () => {}, handleSignup, handleLogin, (d) => { signupDataRef.current = { ...signupDataRef.current, ...d }; }, handleLogout)}
            </div>
          )}

          {/* Entering screen (fade in) */}
          <div
            key={`in-${current}`}
            style={{ position: "absolute", inset: 0, animation: `zp-fade-in ${FADE_MS}ms ease forwards` }}
          >
            {renderContent(current, nav, emergencyNav, pendingEmergency, () => setPendingEmergency(false), transitDest, setTransitDest, userRole, handleSetUserRole, markRegistered, handleSignup, handleLogin, (d) => { signupDataRef.current = { ...signupDataRef.current, ...d }; }, handleLogout)}
          </div>
        </div>
      </div>
    </>
  );
}
