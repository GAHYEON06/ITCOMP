import React, { useState, useEffect } from "react";
import imgSettingsBear from "@/imports/Community메인/36603cc534ed944df658c1944648282faded2339.png";
import mainPaths from "@/imports/Main피보호자/svg-jf129ggkg0";
import { jua } from "../shared/constants";
import { Screen } from "../shared/types";
import { SubHeader, Toggle } from "../shared/SharedUI";
import {
  settingsApi,
  ApiSettings,
  clearAuth,
  normalizeSettings,
} from "../api/client";

const DEFAULT_API = "https://zip-r0.vercel.app";
function getStoredApiUrl() {
  try {
    return localStorage.getItem("zipro_api_url") || DEFAULT_API;
  } catch {
    return DEFAULT_API;
  }
}

export function SettingsScreen({
  onBack,
  onEmergency,
  onNavigate,
}: {
  onBack: () => void;
  onEmergency: () => void;
  onNavigate?: (s: Screen) => void;
}) {
  const [apiUrl, setApiUrl] = useState(getStoredApiUrl);
  const [apiUrlSaved, setApiUrlSaved] = useState(false);

  function saveApiUrl() {
    const url = apiUrl.trim().replace(/\/$/, "");
    try {
      localStorage.setItem("zipro_api_url", url || DEFAULT_API);
    } catch {
      /* ignore */
    }
    setApiUrl(url || DEFAULT_API);
    setApiUrlSaved(true);
    setTimeout(() => setApiUrlSaved(false), 2000);
  }

  // 신규 가입자(또는 설정 데이터가 없는 경우)를 위한 초기 세팅
  // 어플 알람 소리 효과(is_sound_enabled)만 true, 나머지는 모두 false
  const [settings, setSettings] = useState<ApiSettings>({
    notifications_enabled: false,
    location_sharing: false,
    dark_mode: false,
    emergency_contacts: [],
    is_test_mode: false,
    is_power_button_emergency: false,
    is_shake_emergency: false,
    is_vibration_enabled: false,
    is_sound_enabled: true,
    has_seen_security_help: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] =
    useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showSecurityHelp, setShowSecurityHelp] =
    useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((r) => {
        const s = normalizeSettings(r);
        if (s) {
          setSettings(s);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  async function toggle(key: keyof ApiSettings) {
    const newVal = !settings[key];
    const next = { ...settings, [key]: newVal } as ApiSettings;
    setSettings(next); // 화면을 먼저 즉시 변경
    setSaving(true);
    setSaveError("");
    setSaveOk(false);
    try {
      await settingsApi.patch({ [key]: newVal }); // 서버에 저장 요청
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 1500);
    } catch (e) {
      setSettings(settings); // 실패 시에만 이전 상태로 원복
      setSaveError((e as Error).message ?? "저장 실패");
      setTimeout(() => setSaveError(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await settingsApi.deleteAccount();
    } catch {
      /* 서버 오류도 무시하고 로컬 초기화 진행 */
    }
    // 탈퇴 시 모든 로컬 데이터 완전 삭제 (계정·역할·프로필·설정·캐시 전부)
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    clearAuth(); // localStorage.clear() 후에도 혹시 남은 키 방어적으로 재삭제
    setDeleting(false);
    setShowDeleteDialog(false);
    onNavigate?.("role-select");
  }

  const row =
    "flex items-center justify-between bg-[#f6f6f6] rounded-[10px] px-4 py-3";

  return (
    <div className="absolute inset-0 bg-[#fff3c5] overflow-y-auto z-[2000]">
      <SubHeader onBack={onBack} />
      <div className="absolute top-[50px] right-[16px] h-[70px] w-[55px]">
        <img
          alt="캐릭터"
          src={imgSettingsBear}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="pt-[160px] pb-[110px] px-[38px] flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <p
              className="text-center text-[15px] text-[#784835] tracking-[0.75px]"
              style={jua}
            >
              불러오는 중…
            </p>
          </div>
        ) : (
          <>
            {loadError && (
              <div
                className="rounded-[10px] px-4 py-3 text-center"
                style={{ background: "#fde8e8" }}
              >
                <p
                  style={jua}
                  className="text-[13px] text-[#94090C]"
                >
                  설정을 불러오지 못했습니다. 로그인 상태를
                  확인해주세요.
                </p>
              </div>
            )}
            {saveOk && (
              <p
                className="text-center text-sm text-green-600"
                style={jua}
              >
                저장되었습니다 ✓
              </p>
            )}
            {saveError && (
              <p
                className="text-center text-sm text-red-600"
                style={jua}
              >
                {saveError}
              </p>
            )}

            {/* 보안화면 도움말 */}
            <button
              onClick={() => setShowSecurityHelp(true)}
              className={`${row} w-full text-left transition-opacity active:opacity-75`}
            >
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                보안화면 도움말
              </span>
            </button>

            {/* 테스트 모드 */}
            <div className={row}>
              <div>
                <p
                  style={jua}
                  className="text-[#784835] text-[15px] tracking-[0.75px]"
                >
                  테스트 모드
                </p>
                <p
                  className="text-[11px] text-black mt-0.5"
                  style={{
                    fontFamily:
                      "Inter, 'Noto Sans KR', sans-serif",
                  }}
                >
                  실제 신고가 접수 되지 않는 테스트 모드입니다.
                </p>
              </div>
              <Toggle
                on={settings.is_test_mode}
                onToggle={() => toggle("is_test_mode")}
              />
            </div>

            {/* 전원 버튼 */}
            <div className={row}>
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                전원 버튼 3초 누르기 긴급신고
              </span>
              <Toggle
                on={settings.is_power_button_emergency}
                onToggle={() =>
                  toggle("is_power_button_emergency")
                }
              />
            </div>

            {/* 핸드폰 흔들기 */}
            <div className={row}>
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                핸드폰 3번 흔들어 긴급 신고
              </span>
              <Toggle
                on={settings.is_shake_emergency}
                onToggle={() => toggle("is_shake_emergency")}
              />
            </div>

            {/* 알람 진동 */}
            <div className={row}>
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                어플 알람 진동 효과
              </span>
              <Toggle
                on={settings.is_vibration_enabled}
                onToggle={() => toggle("is_vibration_enabled")}
              />
            </div>

            {/* 알람 소리 */}
            <div className={row}>
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                어플 알람 소리 효과
              </span>
              <Toggle
                on={settings.is_sound_enabled}
                onToggle={() => toggle("is_sound_enabled")}
              />
            </div>

            {/* 즐겨찾는 장소 */}
            <button
              onClick={() => onNavigate?.("즐겨찾는장소")}
              className={`${row} w-full text-left transition-opacity active:opacity-75`}
            >
              <span
                style={jua}
                className="text-[#784835] text-[15px] tracking-[0.75px]"
              >
                즐겨찾는 장소
              </span>
            </button>

            {saving && (
              <p
                className="text-center text-xs text-gray-400"
                style={jua}
              >
                저장 중…
              </p>
            )}

            {/* 탈퇴 / 문의하기 */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="flex-1 py-3 rounded-[10px] bg-[#94090C] text-center transition-opacity active:opacity-60"
              >
                <span
                  style={jua}
                  className="text-[#ffffff] text-[15px] tracking-[0.75px]"
                >
                  탈퇴
                </span>
              </button>
              <button className="flex-1 py-3 rounded-[10px] bg-[#f6f6f6] text-center transition-opacity active:opacity-60">
                <span
                  style={jua}
                  className="text-[#784835] text-[15px] tracking-[0.75px]"
                >
                  문의하기
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 보안화면 도움말 팝업 */}
      {showSecurityHelp && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={() => setShowSecurityHelp(false)}
        >
          <div
            className="mx-6 rounded-[24px] overflow-hidden shadow-2xl w-full"
            style={{ background: "white", maxWidth: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div
              className="px-6 pt-6 pb-4 flex flex-col items-center gap-2"
              style={{ background: "#fff3c5" }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                style={{ background: "#fdf3d3" }}
              >
                🛡️
              </div>
              <p
                style={{
                  ...jua,
                  fontSize: 17,
                  color: "#784835",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                위장 보안 화면 (DISGUISE) 사용 가이드
              </p>
            </div>

            {/* 안내 내용 */}
            <div className="px-6 py-4 flex flex-col gap-3">
              <p
                style={{
                  fontFamily: "system-ui,sans-serif",
                  fontSize: 13,
                  color: "#555",
                  textAlign: "center",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                앱 사용 중 타인에게 화면을 노출하지 않고
                스마트폰의 일반 잠금 화면처럼 보이도록 위장하는
                보안 기능입니다.
              </p>
              <div
                className="rounded-[12px] px-4 py-3 flex flex-col gap-2"
                style={{ background: "#f6f6f6" }}
              >
                {[
                  "화면 3초간 꾹 누르기: 위장 화면을 해제하고 원래 앱 화면으로 복귀합니다.",
                  "화면 위로 밀어 올리기: 실행 중인 손전등 또는 카메라 기능을 취소/종료합니다.",
                  "손전등 사용: 좌측 하단 버튼을 우측으로 스와이프",
                  "카메라 사용: 우측 하단 버튼을 좌측으로 스와이프",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2"
                  >
                    <span
                      style={{
                        color: "#784835",
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      •
                    </span>
                    <span
                      style={{
                        fontFamily: "system-ui,sans-serif",
                        fontSize: 12,
                        color: "#555",
                        lineHeight: 1.6,
                      }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowSecurityHelp(false)}
                className="w-full py-3 rounded-[14px] transition-opacity active:opacity-75"
                style={{
                  ...jua,
                  background: "#784835",
                  color: "white",
                  fontSize: 15,
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 탈퇴 확인 팝업 */}
      {showDeleteDialog && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            className="mx-6 rounded-[24px] overflow-hidden shadow-2xl w-full"
            style={{ background: "white", maxWidth: 320 }}
          >
            {/* 헤더 */}
            <div
              className="px-6 pt-6 pb-4 flex flex-col items-center gap-2"
              style={{ background: "#fff3c5" }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                style={{ background: "#fde8e8" }}
              >
                ⚠️
              </div>
              <p
                style={{
                  ...jua,
                  fontSize: 18,
                  color: "#94090C",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                정말 탈퇴하시겠습니까?
              </p>
            </div>

            {/* 경고 내용 */}
            <div className="px-6 py-4 flex flex-col gap-2">
              <p
                style={{
                  ...jua,
                  fontSize: 13,
                  color: "#555",
                  textAlign: "center",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                탈퇴 시 아래 모든 정보가 영구적으로 삭제됩니다.
              </p>
              <div
                className="rounded-[12px] px-4 py-3 flex flex-col gap-1.5"
                style={{ background: "#fff3f3" }}
              >
                {[
                  "계정 정보 (아이디, 비밀번호)",
                  "개인 정보 (이름, 연락처, 메일)",
                  "연결된 보호자 / 피보호자 관계",
                  "긴급신고 이력 및 위치 데이터",
                  "커뮤니티 작성 게시글",
                  "모든 설정 데이터",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2"
                  >
                    <span
                      style={{
                        color: "#94090C",
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      •
                    </span>
                    <span
                      style={{
                        fontFamily: "system-ui,sans-serif",
                        fontSize: 12,
                        color: "#666",
                        lineHeight: 1.6,
                      }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>
              {deleteError && (
                <p
                  style={{
                    ...jua,
                    fontSize: 12,
                    color: "#94090C",
                    textAlign: "center",
                    margin: 0,
                  }}
                >
                  {deleteError}
                </p>
              )}
            </div>

            {/* 버튼 */}
            <div className="px-5 pb-5 flex flex-col gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="w-full py-3 rounded-[14px] transition-opacity active:opacity-75"
                style={{
                  ...jua,
                  background: deleting
                    ? "#c0392b88"
                    : "#94090C",
                  color: "white",
                  fontSize: 15,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting
                  ? "탈퇴 처리 중..."
                  : "예, 탈퇴합니다"}
              </button>
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteError("");
                }}
                disabled={deleting}
                className="w-full py-3 rounded-[14px] transition-opacity active:opacity-75"
                style={{
                  ...jua,
                  background: "#f0f0f0",
                  color: "#555",
                  fontSize: 15,
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[91px] bg-[#fff3c5] rounded-tl-[20px] rounded-tr-[20px] shadow-[0px_0px_7px_0px_rgba(0,0,0,0.5)] flex items-end justify-between px-6 pb-3">
        {/* 커뮤니티 */}
        <div
          className="flex flex-col items-center gap-1 cursor-pointer"
          onClick={() => onNavigate?.("커뮤니티")}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 40 40"
            fill="none"
          >
            <path
              d={mainPaths.p313e2cc0}
              stroke="black"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <path
              d={mainPaths.pa1ce23e}
              stroke="black"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          </svg>
          <span style={jua} className="text-[13px] text-black">
            커뮤니티
          </span>
        </div>

        {/* 긴급신고 */}
        <button
          onClick={onEmergency}
          className="flex flex-col items-center transition-opacity active:opacity-75 gap-2"
          style={{ marginBottom: 15 }}
        >
          <div
            className="relative"
            style={{ width: 121, height: 121 }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                width="133"
                height="133"
                viewBox="0 0 133 133"
                fill="none"
                style={{
                  position: "absolute",
                  left: -6,
                  top: -5,
                }}
              >
                <g filter="url(#filter0_d_settings)">
                  <circle
                    cx="66.5"
                    cy="66.5"
                    fill="#EA1E2F"
                    r="60.5"
                  />
                </g>
                <defs>
                  <filter
                    colorInterpolationFilters="sRGB"
                    filterUnits="userSpaceOnUse"
                    height="133"
                    id="filter0_d_settings"
                    width="133"
                    x="0"
                    y="0"
                  >
                    <feFlood
                      floodOpacity="0"
                      result="BackgroundImageFix"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      result="hardAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                    />
                    <feMorphology
                      in="SourceAlpha"
                      operator="dilate"
                      radius="1"
                      result="effect1_dropShadow_settings"
                    />
                    <feOffset />
                    <feGaussianBlur stdDeviation="2.5" />
                    <feComposite
                      in2="hardAlpha"
                      operator="out"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"
                    />
                    <feBlend
                      in2="BackgroundImageFix"
                      mode="normal"
                      result="effect1_dropShadow_settings"
                    />
                    <feBlend
                      in="SourceGraphic"
                      in2="effect1_dropShadow_settings"
                      mode="normal"
                      result="shape"
                    />
                  </filter>
                </defs>
              </svg>
            </div>
            <div className="absolute" style={{ inset: 10 }}>
              <svg
                className="absolute block inset-0 size-full"
                fill="none"
                viewBox="0 0 101 101"
              >
                <circle
                  cx="50.5"
                  cy="50.5"
                  fill="white"
                  r="50.5"
                />
              </svg>
            </div>
            <div
              className="absolute flex items-center justify-center"
              style={{ inset: 20 }}
            >
              <svg
                className="block size-full"
                fill="none"
                viewBox="0 0 67 56.3321"
              >
                <path
                  d={mainPaths.p3b87de80}
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d={mainPaths.p3bc54280}
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d="M61.4 28.1677H64.5"
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d={mainPaths.p4f40c8}
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d="M2.5 28.1677H5.60001"
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d="M33.502 2.5V5.06662"
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d={mainPaths.pb33540}
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <path
                  d="M33.502 28.1677V43.5674"
                  stroke="#EA1E2F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
              </svg>
            </div>
          </div>
          <span
            style={jua}
            className="text-[13px] text-black -mt-1"
          >
            {" "}
            긴급신고
          </span>
        </button>

        {/* 보안화면 */}
        <div
          className="flex flex-col items-center gap-1 cursor-pointer"
          onClick={() => onNavigate?.("보안화면")}
        >
          <svg
            width="28"
            height="34"
            viewBox="0 0 33 40"
            fill="none"
          >
            <path
              d="M16.5 38.5C16.5 38.5 31.5 31.1 31.5 20V7.05L16.5 1.5L1.5 7.05V20C1.5 31.1 16.5 38.5 16.5 38.5Z"
              stroke="#1D2433"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          </svg>
          <span style={jua} className="text-[13px] text-black">
            보안화면
          </span>
        </div>
      </div>
    </div>
  );
}