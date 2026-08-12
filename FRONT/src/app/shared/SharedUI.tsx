import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { imgLogoB64 as imgLogo, imgLogoFullB64 as imgLogoFull } from "../inlineImages";
import imgLeafA from "@/imports/Loading-2/fda34ed29b3ac5cdd4b6375a53a7e7b55606ca8c.png";
import imgLeafB from "@/imports/Loading-2/83795503889567fd120b8de6de15d223ff4a1a82.png";
import imgLeafC from "@/imports/Loading-2/3c3b1eeeb1fa6d3ea8fb45c3e1e3e8e98b4943f1.png";
import imgLeafD from "@/imports/Loading-2/f6dd02823fd49ecff1217815f177361651219301.png";
import imgLoadingCharacter from "@/imports/Loading-2/bc1360748006a9302efb741af52d877071e65e53.png";
import imgLoadingBg from "@/imports/Loading-2/94e4a2fedbf363b021d26cae1904ddf02ea01500.png";
const imgRectangle = imgLoadingBg; // <-- 기존에 존재하는 imgLoadingBg를 할당
import mainPaths from "@/imports/Main피보호자/svg-jf129ggkg0";
import { jua, LEAF_ANIM, LEAF_WRAPPERS, LEAF_INNER, TEXT_OPACITY, TEXT_TIMES } from "./constants";
import { ZipRoLogo } from "./ZipRoLogo";
import { Screen } from "./types";

// leaf image map: index → src (matches Loading-2/index.tsx order)
const LEAF_IMGS = [imgLeafA, imgLeafA, imgLeafB, imgLeafB, imgLeafB, imgLeafC, imgLeafC, imgLeafD, imgLeafD, imgLeafA];

export function Background() {
  return (
    <div className="absolute h-[968px] left-[-62px] top-[-43px] w-[495px] pointer-events-none"
      style={{ backgroundImage: `url(${imgRectangle})`, backgroundSize: "cover", backgroundPosition: "center" }} />
  );
}

export function LogoLetters() {
  return (
    <div className="absolute" style={{ left: 10, top: 58 }}>
      <ZipRoLogo imgSrc={imgLogo} width={378.667} />
    </div>
  );
}

export interface FieldProps {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; bgColor: string; labelTop: number; inputTop: number; leftOffset?: number;
  onNext?: () => void;
  isLast?: boolean;
  fieldRef?: React.RefObject<HTMLInputElement | null>;
}

export function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function Field({ label, value, onChange, type = "text", bgColor, labelTop, inputTop, leftOffset = 60, onNext, isLast, fieldRef }: FieldProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = fieldRef ?? ownRef;
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === "password";
  return (
    <>
      <div className="absolute content-stretch flex flex-col gap-[8px] items-start w-[272px]" style={{ left: leftOffset, top: labelTop }}>
        <p className="font-normal leading-[1.4] not-italic text-[#1e1e1e] text-[16px]">{label}</p>
      </div>
      <div className="absolute min-w-[120px] rounded-[8px] cursor-text" style={{ background: bgColor, left: leftOffset, top: inputTop, width: 272, border: "1px solid #d9d9d9" }} onClick={() => inputRef.current?.focus()}>
        <div className="content-stretch flex items-center overflow-clip px-[16px] py-[12px] rounded-[inherit] size-full gap-2">
          <input ref={inputRef} type={isPassword ? (showPw ? "text" : "password") : type} value={value} onChange={(e) => onChange(e.target.value)} placeholder="입력"
            className="flex-[1_0_0] min-w-px bg-transparent leading-none outline-none text-[16px] placeholder:text-[#b3b3b3]"
            style={{ color: "white", caretColor: "white", fontFamily: "Inter, sans-serif", fontSize: "16px" }}
            autoComplete={isPassword ? "current-password" : "off"}
            autoCorrect={isPassword ? undefined : "off"}
            autoCapitalize={isPassword ? undefined : "off"}
            spellCheck={isPassword ? undefined : false}
            enterKeyHint={isLast ? "done" : "next"}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onNext?.(); } }} />
          {isPassword && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowPw(p => !p); }} className="shrink-0 flex items-center justify-center opacity-80 hover:opacity-100">
              <EyeIcon open={showPw} />
            </button>
          )}
        </div>
        <div aria-hidden className="absolute border border-[#d9d9d9] border-solid inset-[-0.5px] pointer-events-none rounded-[8.5px]" />
      </div>
    </>
  );
}

// ── iOS Safari input zoom/scroll 방지용 고정 시트 입력창 ──────────────────────
// input을 화면 최상단에 fixed로 띄워서 iOS가 viewport를 밀어올리는 현상을 원천 차단
export function IosInputSheet({
  label, value, placeholder, type = "text", inputMode, onConfirm, onClose,
}: {
  label: string; value: string; placeholder?: string;
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onConfirm: (v: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 60); return () => clearTimeout(t); }, []);
  const confirm = () => { onConfirm(draft); onClose(); };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99997 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} onClick={onClose} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        background: "#fff3c5",
        paddingTop: "max(env(safe-area-inset-top, 20px), 20px)",
        paddingBottom: 18, paddingLeft: 18, paddingRight: 18,
        boxShadow: "0 6px 28px rgba(0,0,0,0.22)",
        borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
      }}>
        <p style={{ ...jua, fontSize: 13, color: "#784835", margin: "0 0 8px 0" }}>{label}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={ref}
            type={type}
            inputMode={inputMode}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder ?? label}
            style={{ ...jua, fontSize: 16, flex: 1, borderRadius: 10, border: "1.5px solid #d9b84e", padding: "12px 14px", outline: "none", background: "white", color: "#3a2800" }}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            onKeyDown={e => { if (e.key === "Enter") confirm(); }}
          />
          <button onClick={confirm}
            style={{ ...jua, background: "#b25e09", color: "white", borderRadius: 10, padding: "0 18px", fontSize: 15, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// TapInput — 탭하면 IosInputSheet를 열어 iOS 줌/스크롤 현상 없이 입력
export function TapInput({
  label, value, onChange, placeholder, type, inputMode, className, style, readOnly,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string; style?: React.CSSProperties; readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const display = value || "";
  return (
    <>
      <div
        className={className}
        style={{ ...style, cursor: readOnly ? "default" : "pointer", userSelect: "none" }}
        onClick={() => { if (!readOnly) setOpen(true); }}
      >
        {display || <span style={{ color: "#b3b3b3", fontFamily: "inherit" }}>{placeholder}</span>}
      </div>
      {open && !readOnly && (
        <IosInputSheet
          label={label} value={value} placeholder={placeholder}
          type={type} inputMode={inputMode}
          onConfirm={onChange} onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button onClick={onPress} className="absolute flex items-center justify-center w-6 h-6 rounded-full transition-opacity active:opacity-60"
      style={{ left: 313, top: 320, background: "rgba(200,170,120,0.4)", border: "1px solid rgba(110,60,9,0.25)" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="#6e3c09" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </button>
  );
}

export function SubmitButton({ onPress, enabled, top = 674, label = "제출" }: { onPress: () => void; enabled: boolean; top?: number; label?: string }) {
  return (
    <div className="absolute content-stretch flex gap-[16px] items-center left-[86px] w-[225px]" style={{ top }}>
      <button onClick={() => enabled && onPress()} disabled={!enabled} className="flex-[1_0_0] min-w-px relative rounded-[8px] transition-opacity duration-150"
        style={{ background: enabled ? "#413c3c" : "#7a7676", cursor: enabled ? "pointer" : "not-allowed" }}>
        <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full">
          <div className="content-stretch flex items-center justify-center p-[12px] relative size-full">
            <p className="font-normal leading-none not-italic relative shrink-0 text-[#f5f5f5] text-[16px] whitespace-nowrap">{label}</p>
          </div>
        </div>
        <div aria-hidden className="absolute border border-[#484141] border-solid inset-0 pointer-events-none rounded-[8px]" />
      </button>
    </div>
  );
}

export function SubHeader({ onBack }: { onBack: () => void }) {
  return (
    <>
      {/* Full logo with letters — ZipRoLogo centered in blobs */}
      <div className="absolute" style={{ left: 50, top: 40 }}>
        <ZipRoLogo imgSrc={imgLogoFull} width={170} />
      </div>
      <button onClick={onBack}
        className="absolute flex items-center justify-center rounded-[4px] transition-opacity active:opacity-60"
        style={{ left: 15, top: 73, width: 35, height: 39, background: "#B97837" }}>
        <svg width="20" height="20" viewBox="0 0 35 39" fill="none">
          <path d="M27.7083 19.5H7.29167M17.5 8.125L7.29167 19.5L17.5 30.875" stroke="#FFEEB2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </svg>
      </button>
    </>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative shrink-0 rounded-full transition-colors duration-200"
      style={{ width: 46, height: 26, background: on ? "#b25e09" : "#ccc" }}
      aria-checked={on}
      role="switch"
    >
      <div
        className="absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white shadow transition-all duration-200"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  );
}

export function Leaf({ anim, children }: { anim: typeof LEAF_ANIM[number]; children: React.ReactNode }) {
  return (
    <motion.div className="relative size-full" initial={{ opacity: 0 }} animate={{ opacity: anim.opacity }}
      transition={{ opacity: { duration: 7, times: anim.times, ease: anim.ease, repeat: Infinity } }}>
      {children}
    </motion.div>
  );
}

export function MonitoringBottomBar({ onEmergency, onNavigate, onSecurity, compact = false }: { onEmergency?: () => void; onNavigate?: (s: Screen) => void; onSecurity?: () => void; compact?: boolean }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-[#fff3c5] rounded-tl-[20px] rounded-tr-[20px] shadow-[0px_0px_7px_0px_rgba(0,0,0,0.5)] flex items-center justify-between px-6"
      style={{ height: compact ? 68 : 91, paddingBottom: compact ? 6 : 12, alignItems: compact ? "center" : "flex-end" }}
    >
      {/* 1. 왼쪽: 보안화면 */}
      <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={onSecurity}>
        <svg width={compact ? 22 : 28} height={compact ? 27 : 34} viewBox="0 0 33 40" fill="none">
          <path d="M16.5 38.5C16.5 38.5 31.5 31.1 31.5 20V7.05L16.5 1.5L1.5 7.05V20C1.5 31.1 16.5 38.5 16.5 38.5Z" stroke="#1D2433" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        </svg>
        <span style={jua} className="text-[12px] text-black">보안화면</span>
      </div>

      {/* 2. 중앙: 긴급신고 버튼 */}
      {compact ? (
        /* compact: 작은 빨간 버튼 (하단 바 안에 유지) */
        <button
          type="button"
          onClick={onEmergency}
          className="flex flex-col items-center gap-1 transition-opacity active:opacity-75"
        >
          <div className="flex items-center justify-center rounded-full shadow-md"
            style={{ width: 52, height: 52, background: "#EA1E2F" }}>
            <svg width="26" height="26" viewBox="0 0 67 56.3321" fill="none">
              <path d={mainPaths?.p3b87de80} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths?.p3bc54280} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M61.4 28.1677H64.5" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths?.p4f40c8} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M2.5 28.1677H5.60001" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M33.502 2.5V5.06662" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths?.pb33540} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M33.502 28.1677V43.5674" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
            </svg>
          </div>
          <span style={jua} className="text-[11px] text-[#EA1E2F]">긴급신고</span>
        </button>
      ) : (
        /* 기본: 큰 떠있는 버튼 */
        <button
          type="button"
          onClick={onEmergency}
          className="flex flex-col items-center transition-opacity active:opacity-75 gap-1 -mt-6"
          style={{ marginBottom: 5 }}
        >
          <div className="relative" style={{ width: 121, height: 121 }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="133" height="133" viewBox="0 0 133 133" fill="none" style={{ position: "absolute", left: -6, top: -5 }}>
                <g filter="url(#filter0_d_settings)">
                  <circle cx="66.5" cy="66.5" fill="#EA1E2F" r="60.5" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="133" id="filter0_d_settings" width="133" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
                    <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="effect1_dropShadow_settings" />
                    <feOffset /><feGaussianBlur stdDeviation="2.5" />
                    <feComposite in2="hardAlpha" operator="out" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                    <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_settings" />
                    <feBlend in="SourceGraphic" in2="effect1_dropShadow_settings" mode="normal" result="shape" />
                  </filter>
                </defs>
              </svg>
            </div>
            <div className="absolute" style={{ inset: 10 }}>
              <svg className="absolute block inset-0 size-full" fill="none" viewBox="0 0 101 101">
                <circle cx="50.5" cy="50.5" fill="white" r="50.5" />
              </svg>
            </div>
            <div className="absolute flex items-center justify-center" style={{ inset: 20 }}>
              <svg className="block size-full" fill="none" viewBox="0 0 67 56.3321">
                <path d={mainPaths?.p3b87de80} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d={mainPaths?.p3bc54280} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d="M61.4 28.1677H64.5" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d={mainPaths?.p4f40c8} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d="M2.5 28.1677H5.60001" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d="M33.502 2.5V5.06662" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d={mainPaths?.pb33540} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                <path d="M33.502 28.1677V43.5674" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              </svg>
            </div>
          </div>
          <span style={jua} className="text-[13px] text-black -mt-1">긴급신고</span>
        </button>
      )}

      {/* 3. 오른쪽: 커뮤니티 */}
      <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => onNavigate?.("커뮤니티")}>
        <svg width={compact ? 30 : 36} height={compact ? 30 : 36} viewBox="0 0 40 40" fill="none">
          <path d={mainPaths?.p313e2cc0} stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          <path d={mainPaths?.pa1ce23e} stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        </svg>
        <span style={jua} className="text-[12px] text-black">커뮤니티</span>
      </div>
    </div>
  );
}

export { imgLoadingBg, imgLoadingCharacter, LEAF_IMGS };
