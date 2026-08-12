import React, { useState, useRef, useEffect } from "react";
import imgProfileBear from "@/imports/Community메인/36603cc534ed944df658c1944648282faded2339.png";
import { jua } from "../shared/constants";
import { SubHeader, TapInput } from "../shared/SharedUI";
import { authApi, getSavedUser, saveUser, clearAuth, isWardRole } from "../api/client";

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => execCommandCopy(text));
  }
  return execCommandCopy(text);
}

function execCommandCopy(text: string): Promise<void> {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

export function PersonalInfoScreen({ onBack, onLogout }: { onBack: () => void; onLogout?: () => void }) {
  const [form, setForm] = useState({
    name: "", gender: "", code: "", birthdate: "", email: "", phone: "", profileImg: "",
  });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const user = getSavedUser();
  const isWard = isWardRole(user?.role);

 useEffect(() => {
  // 1. 세션 사용자 정보 적용
  if (user) {
    const u = user as typeof user & { ward_code?: string; wardCode?: string; code?: string; email?: string; gender?: string; birthdate?: string };
    setForm(f => ({
      ...f,
      name:  u.name  ?? f.name,
      phone: u.phone ?? f.phone,
      email: u.email ?? f.email,
      gender: u.gender ?? f.gender,
      birthdate: u.birthdate ?? f.birthdate,
      code:  u.wardcode ?? u.wardCode ?? u.code ?? f.code,
    }));
  }

  // 2. localStorage 덮어쓰기 보완 (저장된 code가 빈 값이면 기존 f.code 유지)
  try {
    const saved = localStorage.getItem("zipro_profile");
    if (saved) {
      const parsed = JSON.parse(saved);
      setForm(f => ({
        ...f,
        ...parsed,
        // 💡 핵심: 캐시된 code가 있을 때만 덮어쓰고, 빈 값이면 기존(f.code) 세션 코드를 유지!
        code: parsed.code || f.code,
      }));
    }
  } catch { /* ignore */ }

  // 3. 백엔드 API 최신 정보 동기화
  authApi.me().then(me => {
    setForm(f => ({
      ...f,
      name:  me.name      ?? me.username ?? f.name,
      phone: me.phone     ?? f.phone,
      email: me.email     ?? f.email,
      gender: me.gender       ?? f.gender,
      birthdate: me.birthdate ?? f.birthdate,
      // 💡 백엔드 응답의 다양한 필드명 체크
      code:  me.ward_code ?? me.wardcode ?? me.wardCode ?? me.code ?? f.code,
    }));
  }).catch(() => { /* API 실패 시 기존 값 유지 */ });

  // 피보호자 고유 연결 코드 별도 조회
  if (isWard) {
    authApi.myCode().then(res => {
      setForm(f => ({ ...f, code: res.code }));
    }).catch(() => {});
  }
}, []);

  function set(k: keyof typeof form) {
    return (v: string) => { setForm(f => ({ ...f, [k]: v })); };
  }

  const labelBadge = "inline-block px-3 py-0.5 rounded-full text-white text-[13px] mb-1";
  const inputBase = "w-full rounded-[12px] px-4 py-3 text-[15px] outline-none transition-colors";
  const inputActive = `${inputBase} bg-[#fdf0c4] border border-[#e8d48a] placeholder:text-[#c8b870]`;
  const inputReadonly = `${inputBase} bg-[#f5e9b8] border border-transparent text-[#7a5c2a]`;

  const emailParts = form.email ? form.email.split('@') : ['', 'naver.com'];
  const emailId = emailParts[0] || '';
  const emailDomain = emailParts[1] || 'naver.com';

  return (
    <div className="absolute inset-0 bg-[#fff3c5] overflow-y-auto">
      <SubHeader onBack={onBack} />

      <div className="pt-[160px] pb-10 px-5">
        {/* Profile image + 이름/성별 */}
        <div className="flex gap-4 mb-4">
          {editing ? (
            <label htmlFor="profile-upload" className="cursor-pointer shrink-0 w-[130px] h-[153px] rounded-[26px] overflow-hidden bg-white shadow relative group">
              <img alt="프로필 사진" src={form.profileImg || imgProfileBear} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                사진 변경
              </div>
              <input
                id="profile-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      if (typeof reader.result === "string") {
                        set("profileImg")(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          ) : (
            <div className="shrink-0 w-[130px] h-[153px] rounded-[26px] overflow-hidden bg-white shadow">
              <img alt="프로필 사진" src={form.profileImg || imgProfileBear} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex-1 flex flex-col gap-3">
            <div>
              <span style={jua} className={`${labelBadge} bg-[#ff789e]`}>이름</span>
              <TapInput label="이름" value={form.name} onChange={set("name")}
                placeholder="이름 입력" className={editing ? inputActive : inputReadonly}
                style={{ ...jua, fontSize: "16px" }} readOnly={!editing} />
            </div>
            <div>
              <span style={jua} className={`${labelBadge} bg-[#ff789e]`}>성별</span>
              {editing ? (
                <select style={jua} value={form.gender} onChange={e => set("gender")(e.target.value)}
                  className={`${inputActive} cursor-pointer`}>
                  <option value="">선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                  <option value="기타">기타</option>
                </select>
              ) : (
                <div style={jua} className={inputReadonly}>{form.gender || "미설정"}</div>
              )}
            </div>
          </div>
        </div>

        {/* 연결 코드 카드 (피보호자) */}
        {isWard && (
          <div className="mb-4 rounded-[20px] overflow-hidden shadow-md"
            style={{ background: "linear-gradient(135deg, #b25e09 0%, #d4870f 100%)" }}>
            <div className="px-5 pt-4 pb-1">
              <p style={jua} className="text-white text-[13px] opacity-80 mb-1">나의 고유 연결 코드</p>
              <div className="flex items-center justify-between gap-3">
                <p style={{ ...jua, letterSpacing: "4px" }}
                  className="text-white text-[26px] font-bold tracking-widest">
                  {form.code || "발급 중…"}
                </p>
                {form.code && (
                  <button
                    onClick={() => {
                      copyToClipboard(form.code).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }).catch(() => {});
                    }}
                    className="shrink-0 px-4 py-2 rounded-[12px] text-[13px] transition-all active:scale-95"
                    style={{ ...jua, background: copied ? "#4caf50" : "rgba(255,255,255,0.25)", color: "white", border: "1.5px solid rgba(255,255,255,0.5)" }}
                  >
                    {copied ? "✓ 복사됨" : "복사"}
                  </button>
                )}
              </div>
            </div>
            <div className="px-5 py-3" style={{ background: "rgba(0,0,0,0.15)" }}>
              <p style={jua} className="text-white text-[12px] opacity-90">
                📢 이 코드를 보호자에게 알려주세요. 보호자가 회원가입 시 이 코드를 입력하면 연동됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 보호자: 연결 코드 표시 */}
        {!isWard && (
          <div className="mb-4">
            <span style={jua} className={`${labelBadge} bg-[#b25e09]`}>연결된 피보호자 코드</span>
            <div style={jua} className={`${inputReadonly} tracking-widest`}>
              {form.code || "—"}
            </div>
          </div>
        )}

        {/* 생년월일 */}
        <div className="mb-4">
          <span style={jua} className={`${labelBadge} bg-[#ff789e]`}>생년월일</span>
          <TapInput label="생년월일 (YYYY-MM-DD)" value={form.birthdate}
            onChange={v => {
              const digits = v.replace(/\D/g, "");
              let formatted = digits;
              if (digits.length > 4 && digits.length <= 6) formatted = `${digits.slice(0,4)}-${digits.slice(4)}`;
              else if (digits.length > 6) formatted = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,10)}`;
              set("birthdate")(formatted);
            }}
            placeholder="YYYY-MM-DD" inputMode="numeric"
            className={editing ? inputActive : inputReadonly}
            style={{ ...jua, fontSize: "16px" }} readOnly={!editing} />
        </div>

        {/* 메일 */}
        <div className="mb-4">
          <span style={jua} className={`${labelBadge} bg-[#ff789e]`}>메일</span>
          <div className="flex items-center gap-2">
            <TapInput label="이메일 아이디"
              value={emailId}
              onChange={id => { set("email")(`${id}@${emailDomain}`); }}
              placeholder="이메일 입력" inputMode="email"
              className={`flex-1 ${editing ? inputActive : inputReadonly}`}
              style={{ ...jua, fontSize: "16px" }} readOnly={!editing} />
            <span style={jua} className="text-sm font-bold">@</span>
            {editing ? (
              <select
                style={jua}
                value={['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com'].includes(emailDomain) ? emailDomain : 'naver.com'}
                onChange={e => { set("email")(`${emailId}@${e.target.value}`); }}
                className={`flex-1 ${inputActive} cursor-pointer`}
              >
                <option value="naver.com">naver.com</option>
                <option value="gmail.com">gmail.com</option>
                <option value="daum.net">daum.net</option>
                <option value="hanmail.net">hanmail.net</option>
                <option value="nate.com">nate.com</option>
              </select>
            ) : (
              <div style={jua} className={`flex-1 ${inputReadonly}`}>
                {emailDomain}
              </div>
            )}
          </div>
        </div>

        {/* 번호 */}
        <div className="mb-6">
          <span style={jua} className={`${labelBadge} bg-[#ff789e]`}>번호</span>
          <TapInput label="휴대폰 번호" value={form.phone}
            onChange={v => {
              const digits = v.replace(/\D/g, "").slice(0, 11);
              let formatted = digits;
              if (digits.length > 7) formatted = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
              else if (digits.length > 3) formatted = `${digits.slice(0,3)}-${digits.slice(3)}`;
              set("phone")(formatted);
            }}
            placeholder="휴대폰 번호 입력" inputMode="tel"
            className={editing ? inputActive : inputReadonly}
            style={{ ...jua, fontSize: "16px" }} readOnly={!editing} />
        </div>

        {saveError && (
          <p className="text-[#c0392b] text-[13px] mb-2 text-center" style={jua}>{saveError}</p>
        )}

        {editing ? (
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSaveError("");

              const phone = form.phone?.replace(/\D/g, "") || undefined;
              const u = getSavedUser();
              if (u) saveUser({ ...u, name: form.name, phone: form.phone, email: form.email });
              try { localStorage.setItem("zipro_profile", JSON.stringify(form)); } catch { /* ignore */ }

              try {
                await authApi.updateProfile({
                  name: form.name || undefined,
                  phone,
                  gender: form.gender || undefined,
                  birthdate: form.birthdate || undefined,
                  email: form.email || undefined,
                });
              } catch (e) {
                const msg = (e as Error).message ?? "";
                if (!msg.includes("405") && !msg.includes("Method Not Allowed")) {
                  setSaveError("서버 저장 실패 (기기에는 저장됨)");
                  setTimeout(() => setSaveError(""), 3000);
                }
              } finally {
                setSaving(false);
                setEditing(false);
              }
            }}
            className="w-full py-3 rounded-[8px] text-white text-[16px] transition-opacity active:opacity-70 mb-3"
            style={{ ...jua, background: saving ? "#e8a0b8" : "#ff789e", cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full py-3 rounded-[8px] text-white text-[16px] transition-opacity active:opacity-70 mb-3"
            style={{ ...jua, background: "#b25e09" }}
          >
            편집
          </button>
        )}

        {/* 구분선 */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#d4b896]" />
          <span style={jua} className="text-[#b29070] text-[12px]">계정</span>
          <div className="flex-1 h-px bg-[#d4b896]" />
        </div>

        {/* 로그아웃 버튼 */}
        <button
          onClick={() => {
            clearAuth();
            onLogout?.();
          }}
          className="w-full py-3 rounded-[8px] text-[16px] transition-opacity active:opacity-70"
          style={{ ...jua, background: "rgba(178,94,9,0.08)", color: "#b25e09", border: "1.5px solid #b25e09" }}
        >
          로그아웃
        </button>

        {/* 다른 계정 로그인 */}
        <div className="flex justify-center mt-4">
          <button
            onClick={() => {
              clearAuth();
              onLogout?.();
            }}
            className="text-[14px] underline underline-offset-2 active:opacity-60"
            style={{ ...jua, color: "#9e7040" }}
          >
            다른 계정으로 로그인하기
          </button>
        </div>
      </div>
    </div>
  );
}