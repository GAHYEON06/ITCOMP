import React, { useState, useRef, useEffect } from "react";
import imgProfileBear from "@/imports/Community메인/36603cc534ed944df658c1944648282faded2339.png";
import { jua } from "../shared/constants";
import { Screen } from "../shared/types";
import {
  SubHeader,
  MonitoringBottomBar,
} from "../shared/SharedUI";
import {
  monitoringApi,
  monitorNotifApi,
  ApiGuardian,
  normalizeGuardians,
  supabase,
  getSavedUser,
} from "../api/client";

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .catch(() => execCommandCopy(text));
  }
  return execCommandCopy(text);
}

function execCommandCopy(text: string): Promise<void> {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText =
      "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

// ----------------------------------------------------
// 1. MyCodeModal 수정 (getSavedUser 기반 동락)
// ----------------------------------------------------
export function MyCodeModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [myCode, setMyCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. 커스텀 저장 유저 정보 가져오기
      const currentUser = getSavedUser();

      if (!currentUser) {
        if (!cancelled) {
          setMyCode(null);
          setLoading(false);
        }
        return;
      }

      // 2. id 또는 email을 기반으로 users 테이블 조회 (maybeSingle로 406/PGRST116 안전 대처)
      let query = supabase.from("users").select("wardcode");

      if (currentUser.user_id) {
        query = query.eq("id", currentUser.user_id);
      } else if (currentUser.email) {
        query = query.eq("email", currentUser.email);
      }

      const { data, error } = await query.maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        console.error("wardcode 조회 실패:", error);
        setMyCode(null);
      } else {
        setMyCode(data.wardcode ?? null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function copyCode() {
    if (!myCode) return;
    copyToClipboard(myCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
      <div className="bg-[#fff3c5] rounded-[24px] px-6 py-6 shadow-2xl w-[310px] flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1">
          <span style={{ fontSize: 36 }}>🔗</span>
          <p
            style={{
              ...jua,
              fontSize: 20,
              color: "#a45f43",
              margin: 0,
              textAlign: "center",
            }}
          >
            내 연결 코드
          </p>
          <p
            style={{
              fontFamily: "system-ui,sans-serif",
              fontSize: 12,
              color: "#a07040",
              textAlign: "center",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            보호자가 이 코드를 입력하면
            <br />
            자동으로 연결됩니다
          </p>
        </div>

        {/* 코드 표시 영역 */}
        <div
          className="rounded-[16px] py-5 flex flex-col items-center gap-3"
          style={{
            background: "#ffe896",
            border: "2px solid #d9b84e",
          }}
        >
          {loading ? (
            <div className="w-6 h-6 rounded-full border-2 border-[#b25e09]/30 border-t-[#b25e09] animate-spin" />
          ) : myCode ? (
            <>
              <p
                style={{
                  ...jua,
                  fontSize: 28,
                  color: "#5c3412",
                  letterSpacing: "6px",
                  margin: 0,
                }}
              >
                {myCode}
              </p>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all active:scale-95"
                style={{
                  background: copied ? "#2e7d32" : "#b25e09",
                }}
              >
                <span style={{ fontSize: 12 }}>
                  {copied ? "✓" : "📋"}
                </span>
                <span
                  style={{
                    ...jua,
                    fontSize: 12,
                    color: "white",
                  }}
                >
                  {copied ? "복사됨!" : "코드 복사"}
                </span>
              </button>
            </>
          ) : (
            <p
              style={{
                fontFamily: "system-ui,sans-serif",
                fontSize: 13,
                color: "#c62828",
                margin: 0,
              }}
            >
              코드를 불러오지 못했습니다
            </p>
          )}
        </div>

        <p
          style={{
            fontFamily: "system-ui,sans-serif",
            fontSize: 11,
            color: "#aaa",
            textAlign: "center",
            margin: 0,
          }}
        >
          코드는 보호자 앱 → 피보호자 추가 화면에서 입력합니다
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-[12px] text-white"
          style={{
            ...jua,
            background: "#414141",
            fontSize: 15,
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export function AddGuardianModal({
  onClose,
}: {
  onClose: () => void;
}) {
  return <MyCodeModal onClose={onClose} />;
}

type GuardianInfo = {
  id: number;
  name: string;
  phone: string;
};

function formatPhoneNumber(
  value: string | null | undefined,
): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^01\d\d{7,8}$/.test(digits)) {
    return digits.length === 10
      ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return value?.trim() || "등록된 전화번호가 없습니다";
}

export function MonitoringScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (s: Screen) => void;
}) {
  type SubView =
    | "main"
    | "guardian"
    | "popup-알림"
    | "popup-종료"
    | "result-알림전송"
    | "result-알림취소"
    | "result-종료완료";
  const [subView, setSubView] = useState<SubView>("main");
  const [monitoringActive, setMonitoringActive] =
    useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [guardians, setGuardians] = useState<GuardianInfo[]>(
    [],
  );
  const [deleteTarget, setDeleteTarget] = useState<
    number | null
  >(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loadingGuardians, setLoadingGuardians] =
    useState(true);

  useEffect(() => {
    async function fetchGuardians() {
      try {
        const currentUser = getSavedUser();
        if (!currentUser) return;

        const { data, error } = await supabase
          .from("user_relationships")
          .select(
            `
            id,
            guardian_id,
            users:guardian_id ( id, username, phone )
          `,
          )
          .eq("ward_id", currentUser.user_id);

        if (error) {
          console.error("보호자 목록 조회 에러:", error);
          return;
        }

        if (data && data.length > 0) {
          setGuardians(
            data.map((item: any, i: number) => {
              const g = item.users || {};
              return {
                id: item.id || i + 1,
                name: g.username?.trim() || "보호자",
                phone: formatPhoneNumber(g.phone),
              };
            }),
          );
        } else {
          setGuardians([]);
        }
      } catch (err) {
        console.error("보호자 목록 불러오기 실패:", err);
      } finally {
        setLoadingGuardians(false);
      }
    }

    fetchGuardians();
  }, []);

  // 삭제 확정 함수 추가
  const confirmDelete = async () => {
    if (deleteTarget == null) return;
    try {
      const { error } = await supabase
        .from("user_relationships")
        .delete()
        .eq("id", deleteTarget);

      if (error) throw error;

      setGuardians((prev) =>
        prev.filter((g) => g.id !== deleteTarget),
      );
    } catch (err) {
      console.error("보호자 연동 삭제 실패:", err);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── 보호자 확인 sub-screen ──
  if (subView === "guardian") {
    return (
      <div className="absolute inset-0 bg-[#fff3c5]">
        {/* Header: back + 모니터링 title */}
        <button
          onClick={() => setSubView("main")}
          className="absolute flex items-center justify-center rounded-[4px] transition-opacity active:opacity-60"
          style={{
            left: 26,
            top: 59,
            width: 35,
            height: 39,
            background: "#B97837",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 35 39"
            fill="none"
          >
            <path
              d="M27.7083 19.5H7.29167M17.5 8.125L7.29167 19.5L17.5 30.875"
              stroke="#FFEEB2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
            />
          </svg>
        </button>
        <p
          className="absolute text-[23px] text-[#a45f43] tracking-[1.15px]"
          style={{ ...jua, left: 76, top: 65 }}
        >
          모니터링
        </p>

        {/* Scrollable guardian list */}
        <div className="absolute top-[120px] bottom-[91px] left-0 right-0 overflow-y-auto px-[35px] py-5 flex flex-col gap-[20px]">
          {/* 내 연결 코드 확인 배너 — 항상 상단에 표시 */}
          {!loadingGuardians && (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[16px] transition-all active:scale-[0.98]"
              style={{
                background: "#ffe896",
                border: "2px dashed #d9b84e",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#b25e09" }}
              >
                <span style={{ fontSize: 18 }}>🔗</span>
              </div>
              <div className="flex-1 text-left">
                <p
                  style={{
                    ...jua,
                    fontSize: 14,
                    color: "#5c3412",
                    margin: 0,
                  }}
                >
                  내 연결 코드 보기
                </p>
                <p
                  style={{
                    fontFamily: "system-ui,sans-serif",
                    fontSize: 11,
                    color: "#a07040",
                    margin: 0,
                  }}
                >
                  보호자에게 이 코드를 알려주세요
                </p>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M9 18l6-6-6-6"
                  stroke="#b25e09"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          {loadingGuardians && (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-[#b25e09]/30 border-t-[#b25e09] animate-spin" />
            </div>
          )}
          {!loadingGuardians && guardians.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8">
              <span style={{ fontSize: 40, opacity: 0.4 }}>
                👤
              </span>
              <p
                style={{
                  ...jua,
                  fontSize: 14,
                  color: "#bbb",
                  margin: 0,
                }}
              >
                연결된 보호자가 없습니다
              </p>
              <p
                style={{
                  fontFamily: "system-ui,sans-serif",
                  fontSize: 12,
                  color: "#aaa",
                  textAlign: "center",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                위의 연결 코드를 보호자에게 알려주세요.
                <br />
                보호자가 코드를 입력하면 자동으로 연결됩니다.
              </p>
            </div>
          )}
          {guardians.map((g) => (
            <div
              key={g.id}
              className="relative bg-[#ffe896] border border-[#d9d9d9] rounded-[28px] px-4 py-4 flex gap-3 items-start"
            >
              <div className="shrink-0 flex flex-col items-center gap-1 pt-1">
                <div className="w-[72px] h-[72px] rounded-[22px] overflow-hidden bg-white">
                  <img
                    alt="보호자 프로필"
                    src={imgProfileBear}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p
                  style={jua}
                  className="text-[#696969] text-[10px] max-w-[80px] truncate"
                >
                  {g.name}
                </p>
              </div>

              {/* 보호자 화면의 피보호자 목록과 같은 기본 정보 구성 */}
              <div className="flex-1 min-w-0 pr-5 pt-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    style={{
                      ...jua,
                      fontSize: 9,
                      color: "#2e7d32",
                      background: "#e8f5e9",
                      borderRadius: 20,
                      padding: "3px 7px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    연결됨
                  </span>
                </div>
                <div className="bg-[#FFF3C5] rounded-[14px] px-3 py-2.5 flex flex-col gap-2">
                  <p
                    style={{
                      ...jua,
                      fontSize: 13,
                      color: "#333",
                      margin: 0,
                    }}
                  >
                    이름: {g.name}
                  </p>
                  <p
                    style={{
                      fontFamily: "system-ui,sans-serif",
                      fontSize: 11,
                      color: "#555",
                      margin: 0,
                      wordBreak: "break-all",
                    }}
                  >
                    전화번호: {g.phone}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDeleteTarget(g.id)}
                aria-label={`${g.name} 보호자 연결 삭제`}
                className="absolute top-[10px] right-[14px]"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  fill="none"
                >
                  <path
                    d="M13.75 8.25L8.25 13.75M8.25 8.25L13.75 13.75M20.1667 11C20.1667 16.0626 16.0626 20.1667 11 20.1667C5.93739 20.1667 1.83333 16.0626 1.83333 11C1.83333 5.93739 5.93739 1.83333 11 1.83333C16.0626 1.83333 20.1667 5.93739 20.1667 11Z"
                    stroke="#626262"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* Add button */}
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#ffe896] border border-[#d9d9d9] rounded-[40px] h-[100px] flex items-center justify-center shrink-0 transition-opacity active:opacity-70"
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
            >
              <path
                d="M24 16V32M16 24H32M44 24C44 35.0457 35.0457 44 24 44C12.9543 44 4 35.0457 4 24C4 12.9543 12.9543 4 24 4C35.0457 4 44 12.9543 44 24Z"
                stroke="#838181"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <MonitoringBottomBar
          onNavigate={onNavigate}
          onSecurity={() => onNavigate?.("보안화면")}
        />

        {/* Delete confirmation popup */}
        {deleteTarget != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
            <div className="bg-white rounded-[20px] px-6 py-6 shadow-2xl w-[300px] flex flex-col gap-5">
              <p
                style={jua}
                className="text-[17px] text-center text-[#333]"
              >
                정말 삭제하시겠습니까?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3 rounded-[10px] text-white text-[15px]"
                  style={{ ...jua, background: "#414141" }}
                >
                  취소
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 rounded-[10px] text-white text-[15px]"
                  style={{ ...jua, background: "#b25e09" }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add guardian modal */}
        {showAdd && (
          <AddGuardianModal onClose={() => setShowAdd(false)} />
        )}
      </div>
    );
  }

  // ── Main monitoring screen ──
  return (
    <div className="absolute inset-0 bg-[#fff3c5]">
      <style>{`@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`}</style>
      <SubHeader onBack={onBack} />

      {/* 3 main buttons */}
      <div className="absolute top-[130px] left-0 right-0 bottom-[91px] overflow-y-auto">
        <div className="px-[28px] pt-[28px] pb-8 flex flex-col gap-[18px]">
          {/* 모니터링 활성화 상태 배너 */}
          {monitoringActive && (
            <div
              className="rounded-[16px] px-4 py-3 flex items-center gap-3"
              style={{
                background: "#e8f5e9",
                border: "1.5px solid #81c784",
              }}
            >
              <div className="relative shrink-0 flex items-center justify-center w-7 h-7">
                <span
                  className="absolute w-3 h-3 rounded-full opacity-70"
                  style={{
                    background: "#4caf50",
                    animation:
                      "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
                  }}
                />
                <span
                  className="relative w-2.5 h-2.5 rounded-full"
                  style={{ background: "#2e7d32" }}
                />
              </div>
              <div className="flex-1">
                <p
                  style={{
                    ...jua,
                    fontSize: 13,
                    color: "#1b5e20",
                    margin: 0,
                  }}
                >
                  모니터링 허용 중
                </p>
                <p
                  style={{
                    fontFamily: "system-ui,sans-serif",
                    fontSize: 11,
                    color: "#4caf50",
                    margin: 0,
                  }}
                >
                  보호자가 내 위치를 확인할 수 있습니다
                </p>
              </div>
              <button
                onClick={() => setSubView("popup-종료")}
                className="px-3 py-1.5 rounded-full"
                style={{ background: "#c62828" }}
              >
                <p
                  style={{
                    ...jua,
                    fontSize: 11,
                    color: "white",
                    margin: 0,
                  }}
                >
                  종료
                </p>
              </button>
            </div>
          )}

          {/* 보호자 확인 */}
          <button
            onClick={() => setSubView("guardian")}
            className="rounded-[24px] overflow-hidden transition-all active:scale-[0.97] shadow-md"
            style={{
              background:
                "linear-gradient(135deg,#ffe896 0%,#ffd14e 100%)",
              border: "2px solid #d9b84e",
            }}
          >
            <div className="flex items-center gap-4 px-5 py-5">
              <div
                className="shrink-0 w-14 h-14 rounded-[18px] flex items-center justify-center shadow-sm"
                style={{
                  background:
                    "linear-gradient(135deg,#b25e09 0%,#e07a20 100%)",
                }}
              >
                <span style={{ fontSize: 28 }}>👤</span>
              </div>
              <div className="flex-1 text-left">
                <p
                  style={{
                    ...jua,
                    fontSize: 18,
                    color: "#5c3412",
                    margin: 0,
                  }}
                >
                  보호자 확인
                </p>
                <p
                  style={{
                    fontFamily: "system-ui,sans-serif",
                    fontSize: 11,
                    color: "#a07040",
                    margin: "3px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  연결된 보호자 목록 및 알림 설정
                </p>
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M9 18l6-6-6-6"
                  stroke="#b25e09"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>

          {/* 모니터링 알림 전송 */}
          <button
            onClick={() => setSubView("popup-알림")}
            className="rounded-[24px] overflow-hidden transition-all active:scale-[0.97] shadow-md"
            style={{
              background: monitoringActive
                ? "linear-gradient(135deg,#c8e6c9 0%,#a5d6a7 100%)"
                : "linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%)",
              border: `2px solid ${monitoringActive ? "#4caf50" : "#a5d6a7"}`,
            }}
          >
            <div className="flex items-center gap-4 px-5 py-5">
              <div
                className="shrink-0 w-14 h-14 rounded-[18px] flex items-center justify-center shadow-sm"
                style={{
                  background:
                    "linear-gradient(135deg,#2e7d32 0%,#43a047 100%)",
                }}
              >
                <span style={{ fontSize: 28 }}>🔔</span>
              </div>
              <div className="flex-1 text-left">
                <p
                  style={{
                    ...jua,
                    fontSize: 18,
                    color: "#1b5e20",
                    margin: 0,
                  }}
                >
                  모니터링 알림 전송
                </p>
                <p
                  style={{
                    fontFamily: "system-ui,sans-serif",
                    fontSize: 11,
                    color: "#4caf50",
                    margin: "3px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  {monitoringActive
                    ? "재전송 — 보호자에게 다시 알림 발송"
                    : "보호자에게 모니터링 시청 허용 알림 발송"}
                </p>
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M9 18l6-6-6-6"
                  stroke="#2e7d32"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>

          {/* 강제종료 */}
          <button
            onClick={() => setSubView("popup-종료")}
            className="rounded-[24px] overflow-hidden transition-all active:scale-[0.97] shadow-md"
            style={{
              background:
                "linear-gradient(135deg,#fce4ec 0%,#f8bbd0 100%)",
              border: "2px solid #f48fb1",
            }}
          >
            <div className="flex items-center gap-4 px-5 py-5">
              <div
                className="shrink-0 w-14 h-14 rounded-[18px] flex items-center justify-center shadow-sm"
                style={{
                  background:
                    "linear-gradient(135deg,#c62828 0%,#e53935 100%)",
                }}
              >
                <span style={{ fontSize: 28 }}>🛑</span>
              </div>
              <div className="flex-1 text-left">
                <p
                  style={{
                    ...jua,
                    fontSize: 18,
                    color: "#b71c1c",
                    margin: 0,
                  }}
                >
                  모니터링 강제종료
                </p>
                <p
                  style={{
                    fontFamily: "system-ui,sans-serif",
                    fontSize: 11,
                    color: "#e57373",
                    margin: "3px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  보호자의 실시간 위치 추적을 즉시 중단
                </p>
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M9 18l6-6-6-6"
                  stroke="#c62828"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>

          {/* 안내 카드 */}
          <div
            className="rounded-[16px] px-4 py-3 flex items-start gap-3"
            style={{
              background: "rgba(178,94,9,0.08)",
              border: "1px solid rgba(178,94,9,0.2)",
            }}
          >
            <span style={{ fontSize: 16, marginTop: 1 }}>
              💡
            </span>
            <p
              style={{
                fontFamily: "system-ui,sans-serif",
                fontSize: 11,
                color: "#7a4f2a",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {monitoringActive ? (
                <>
                  보호자가 내 위치를 확인할 수 있습니다. AI
                  길찾기 사용 시 위치·경로 정보가 보호자에게
                  실시간 전송됩니다. 언제든지{" "}
                  <strong>강제종료</strong>로 추적을 멈출 수
                  있습니다.
                </>
              ) : (
                <>
                  보호자가 내 위치를 보려면 먼저{" "}
                  <strong>알림 전송</strong>을 눌러
                  허가해주세요. 보호자가 수락하면 AI 길찾기 이용
                  시 실시간 위치가 공유됩니다.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <MonitoringBottomBar
        onNavigate={onNavigate}
        onSecurity={() => onNavigate?.("보안화면")}
      />

      {/* 알림 전송 popup overlay */}
      {subView === "popup-알림" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[20px] px-0 py-10 shadow-2xl w-[380px] flex flex-col items-center gap-5">
            <p
              style={jua}
              className="text-[25px] text-black text-center leading-snug tracking-[1.25px] whitespace-pre-line"
            >
              {
                "보호자에게 '모니터링 시청 허용'\n알림을 전송하시겠습니까?"
              }
            </p>
            <div className="flex gap-[16px] w-[320px]">
              <button
                onClick={() => setSubView("result-알림취소")}
                className="flex-1 h-[60px] bg-[#414141] rounded-[8px] flex items-center justify-center transition-opacity active:opacity-70"
              >
                <p
                  style={jua}
                  className="text-[25px] text-white tracking-[1.25px]"
                >
                  취소
                </p>
              </button>
              <button
                disabled={apiLoading}
                onClick={async () => {
                  setApiLoading(true);
                  try {
                    await monitorNotifApi.sendAlert();
                  } catch {
                    /* 실패해도 UI 결과 표시 */
                  } finally {
                    setApiLoading(false);
                  }
                  setMonitoringActive(true);
                  setSubView("result-알림전송");
                }}
                className="flex-1 h-[60px] bg-[#ffdc5d] rounded-[8px] flex items-center justify-center transition-opacity active:opacity-70"
              >
                {apiLoading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <p
                    style={jua}
                    className="text-[25px] text-white tracking-[1.25px]"
                  >
                    전송
                  </p>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 강제종료 popup overlay */}
      {subView === "popup-종료" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[20px] px-8 py-10 shadow-2xl w-[350px] flex flex-col items-center justify-center gap-8">
            <p
              style={jua}
              className="text-[25px] text-black text-center leading-snug tracking-[1.25px] whitespace-pre-line"
            >
              {"보호자의 모니터링을\n강제종료 하시겠습니까?"}
            </p>
            <div className="flex gap-[16px] w-[320px]">
              <button
                onClick={() => setSubView("main")}
                className="flex-1 h-[60px] bg-[#414141] rounded-[8px] flex items-center justify-center transition-opacity active:opacity-70"
              >
                <p
                  style={jua}
                  className="text-[25px] text-white tracking-[1.25px]"
                >
                  아니오
                </p>
              </button>
              <button
                disabled={apiLoading}
                onClick={async () => {
                  setApiLoading(true);
                  try {
                    await monitorNotifApi.forceStop();
                  } catch {
                    /* 실패해도 UI 결과 표시 */
                  } finally {
                    setApiLoading(false);
                  }
                  setMonitoringActive(false);
                  setSubView("result-종료완료");
                }}
                className="flex-1 h-[60px] bg-[#ffdc5d] rounded-[8px] flex items-center justify-center transition-opacity active:opacity-70"
              >
                {apiLoading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <p
                    style={jua}
                    className="text-[25px] text-white tracking-[1.25px]"
                  >
                    예
                  </p>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result: 알림 전송 완료 */}
      {subView === "result-알림전송" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <div className="bg-white rounded-[20px] px-8 py-6 shadow-2xl w-[300px] flex flex-col items-center gap-5">
            <p
              style={jua}
              className="text-[18px] text-center text-[#333] leading-snug"
            >
              알림이 전송되었습니다.
            </p>
            <button
              onClick={() => setSubView("main")}
              className="w-full py-3 rounded-[10px] text-white text-[16px]"
              style={{ ...jua, background: "#b25e09" }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Result: 알림 취소 */}
      {subView === "result-알림취소" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <div className="bg-white rounded-[20px] px-8 py-6 shadow-2xl w-[300px] flex flex-col items-center gap-5">
            <p
              style={jua}
              className="text-[18px] text-center text-[#333] leading-snug"
            >
              알림 전송이 취소되었습니다.
            </p>
            <button
              onClick={() => setSubView("main")}
              className="w-full py-3 rounded-[10px] text-white text-[16px]"
              style={{ ...jua, background: "#414141" }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Result: 강제종료 완료 */}
      {subView === "result-종료완료" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <div className="bg-white rounded-[20px] px-8 py-6 shadow-2xl w-[300px] flex flex-col items-center gap-5">
            <p
              style={jua}
              className="text-[18px] text-center text-[#333] leading-snug whitespace-pre-line"
            >
              {"모니터링이\n강제종료 되었습니다."}
            </p>
            <button
              onClick={() => setSubView("main")}
              className="w-full py-3 rounded-[10px] text-white text-[16px]"
              style={{ ...jua, background: "#414141" }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}