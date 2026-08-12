import React, { useState, useRef, useEffect } from "react";
import { emergencyApi } from "../api/client";

export function SecurityScreen({ onBack, onEmergency }: { onBack: () => void; onEmergency: () => void }) {
  const [now, setNow] = useState(new Date());
  const [torchOn, setTorchOn] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [powerProgress, setPowerProgress] = useState(0);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const torchStream = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    // 보안화면 진입 시 위장 전환 기록
    navigator.geolocation.getCurrentPosition(
      (pos) => { emergencyApi.disguise(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
      () => { emergencyApi.disguise(37.5665, 126.9780).catch(() => {}); },
      { timeout: 5000, maximumAge: 30000 },
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { stopTorch(); stopCamera(); }, []);

  function showHint(msg: string) {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(msg);
    hintTimer.current = setTimeout(() => setHint(null), 2000);
  }

  async function startTorch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      torchStream.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (caps.torch) {
        await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
        setTorchOn(true);
        showHint("후레쉬 켜짐");
      } else {
        stream.getTracks().forEach(t => t.stop());
        showHint("이 기기는 후레쉬를 지원하지 않습니다");
      }
    } catch { showHint("카메라 권한이 필요합니다"); }
  }

  function stopTorch() {
    torchStream.current?.getTracks().forEach(t => t.stop());
    torchStream.current = null;
    setTorchOn(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      cameraStream.current = stream;
      // Attach stream — video element is always mounted so ref is always valid.
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setShowCamera(true);
      showHint("카메라 켜짐");
    } catch (e) {
      console.error(e);
      showHint("카메라 권한이 필요합니다");
    }
  }

  function stopCamera() {
    cameraStream.current?.getTracks().forEach(t => t.stop());
    cameraStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setShowCamera(false);
  }

  function cancelAll() {
    stopTorch();
    stopCamera();
    showHint("취소됨");
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    longPressTimer.current = setTimeout(() => onBack(), 1500);
  }

  function handleTouchMove() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 40 && ady < 40) return;
    if (adx > ady * 1.5) {
      if (dx > 0) { torchOn ? stopTorch() : startTorch(); }
      else { showCamera ? stopCamera() : startCamera(); }
    } else if (ady > adx * 1.5 && dy < 0) {
      cancelAll();
    }
  }

  function handlePowerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (powerInterval.current) return;
    let elapsed = 0;
    powerInterval.current = setInterval(() => {
      elapsed += 100;
      setPowerProgress(Math.min((elapsed / 3000) * 100, 100));
      if (elapsed >= 3000) {
        clearInterval(powerInterval.current!);
        powerInterval.current = null;
        setPowerProgress(0);
        // 긴급신고 발동 시 위치 기반 DB 기록
        navigator.geolocation.getCurrentPosition(
          (pos) => { emergencyApi.siren(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
          () => { emergencyApi.siren(37.5665, 126.9780).catch(() => {}); },
          { timeout: 5000, maximumAge: 30000 },
        );
        onEmergency();
      }
    }, 100);
  }

  function handlePowerUp(e: React.PointerEvent) {
    e.stopPropagation();
    if (powerInterval.current) { clearInterval(powerInterval.current); powerInterval.current = null; }
    setPowerProgress(0);
  }

  const hours   = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const dateStr = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });

  // Lock screen background — deep dark gradient with subtle blue tint like Android/iOS
  return (
    <div
      className="absolute inset-0 select-none overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a0a14 0%, #111827 50%, #0a0f1a 100%)" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% 30%, rgba(60,80,160,0.18) 0%, transparent 70%)" }} />

      {/* ── Clock ── */}
      <div className="absolute top-[100px] left-0 right-0 flex flex-col items-center pointer-events-none">
        <p className="text-white leading-none" style={{ fontFamily: "system-ui, sans-serif", fontWeight: 100, fontSize: 86, letterSpacing: -3 }}>
          {hours}:{minutes}
        </p>
        <p className="text-white/60 text-[15px] mt-2 tracking-wide" style={{ fontFamily: "system-ui, sans-serif" }}>
          {dateStr}
        </p>
      </div>

      {/* ── Notification cards ── */}
      <div className="absolute top-[280px] left-5 right-5 flex flex-col gap-2 pointer-events-none">
        <div className="rounded-[18px] px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
          <div className="w-9 h-9 rounded-[10px] bg-[#34c759] flex items-center justify-center text-[16px] shrink-0">💬</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold truncate" style={{ fontFamily: "system-ui, sans-serif" }}>메시지</p>
            <p className="text-white/55 text-[11px] truncate" style={{ fontFamily: "system-ui, sans-serif" }}>새 메시지 1건</p>
          </div>
          <p className="text-white/40 text-[11px] shrink-0" style={{ fontFamily: "system-ui, sans-serif" }}>방금 전</p>
        </div>
        <div className="rounded-[18px] px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
          <div className="w-9 h-9 rounded-[10px] bg-[#007aff] flex items-center justify-center text-[16px] shrink-0">📅</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold truncate" style={{ fontFamily: "system-ui, sans-serif" }}>캘린더</p>
            <p className="text-white/55 text-[11px] truncate" style={{ fontFamily: "system-ui, sans-serif" }}>오늘 일정 1건</p>
          </div>
          <p className="text-white/40 text-[11px] shrink-0" style={{ fontFamily: "system-ui, sans-serif" }}>1시간 전</p>
        </div>
      </div>

      {/* ── Bottom shortcut icons (like real lock screen) ── */}
      <div className="absolute bottom-[70px] left-0 right-0 flex justify-between px-12 pointer-events-none">
        {/* Flashlight — swipe right */}
        <div className="flex flex-col items-center gap-1.5">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${torchOn ? "bg-white" : "bg-white/15"}`}
            style={{ backdropFilter: "blur(8px)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M8 3L6 9H10L7 21L18 10H13L16 3H8Z" stroke={torchOn ? "#000" : "white"} strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-white/50 text-[10px]" style={{ fontFamily: "system-ui, sans-serif" }}>← 스와이프</p>
        </div>
        {/* Camera — swipe left */}
        <div className="flex flex-col items-center gap-1.5">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${showCamera ? "bg-white" : "bg-white/15"}`}
            style={{ backdropFilter: "blur(8px)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="7" width="20" height="15" rx="3" stroke={showCamera ? "#000" : "white"} strokeWidth="1.8"/>
              <circle cx="12" cy="14.5" r="3.5" stroke={showCamera ? "#000" : "white"} strokeWidth="1.8"/>
              <path d="M8 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7" stroke={showCamera ? "#000" : "white"} strokeWidth="1.8"/>
            </svg>
          </div>
          <p className="text-white/50 text-[10px]" style={{ fontFamily: "system-ui, sans-serif" }}>스와이프 →</p>
        </div>
      </div>

      {/* ── Swipe up hint ── */}
      <div className="absolute bottom-[28px] left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none" className="opacity-30">
          <path d="M1 9L10 1L19 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className="text-white/30 text-[11px] tracking-widest" style={{ fontFamily: "system-ui, sans-serif" }}>위로 밀어 취소</p>
      </div>

      {/* ── Camera preview PiP — always mounted so srcObject stays attached ── */}
      <div
        className="absolute bottom-[130px] left-1/2 -translate-x-1/2 rounded-[12px] overflow-hidden shadow-2xl pointer-events-none transition-opacity duration-300"
        style={{
          width: 130, height: 90,
          border: "2px solid rgba(255,255,255,0.3)",
          opacity: showCamera ? 1 : 0,
          visibility: showCamera ? "visible" : "hidden",
        }}
      >
        <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      </div>

      {/* ── Hint toast ── */}
      {hint && (
        <div className="absolute top-[55px] left-1/2 -translate-x-1/2 bg-black/75 text-white text-[12px] px-5 py-2 rounded-full pointer-events-none whitespace-nowrap"
          style={{ fontFamily: "system-ui, sans-serif", backdropFilter: "blur(8px)" }}>
          {hint}
        </div>
      )}

      {/* ── Power button (right edge, visually like a physical button) ── */}
      <div
        className="absolute right-0 flex flex-col items-end"
        style={{ top: 180, touchAction: "none" }}
        onPointerDown={handlePowerDown}
        onPointerUp={handlePowerUp}
        onPointerLeave={handlePowerUp}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="relative overflow-hidden rounded-l-[4px]"
          style={{ width: 5, height: 56, background: "#2a2a2a" }}>
          {/* Fill from top as progress grows */}
          <div className="absolute top-0 left-0 right-0 bg-red-500 transition-none"
            style={{ height: `${powerProgress}%` }} />
        </div>
        {/* Emergency label shown while pressing */}
        {powerProgress > 10 && (
          <p className="absolute right-7 text-red-400 text-[9px] mt-1 whitespace-nowrap"
            style={{ fontFamily: "system-ui, sans-serif", top: 12 }}>
            긴급신고
          </p>
        )}
      </div>
    </div>
  );
}
