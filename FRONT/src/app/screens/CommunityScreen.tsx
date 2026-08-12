import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// ── 커스텀 핀 이미지 Import (pin1 ~ pin4) ──────────────────────────────────
import imgPinGojang from "@/imports/pin1.png";   // pin1: 고장
import imgPinEoduum from "@/imports/pin2.png";   // pin2: 어두움
import imgPinGongsa from "@/imports/pin3.png";   // pin3: 공사
import imgPinGita   from "@/imports/pin4.png";   // pin4: 기타

import imgCommunityForest  from "@/imports/Community-2/32d92a87cd7ba01ced4b77d9c2e371791503fb70.png";
import imgCommunityBearProfile from "@/imports/image-20.png";
import imgCommunityMap     from "@/imports/Main피보호자/85118862811082a8e4ea81b4282eee710f491a7c.png";
import { jua, COMMUNITY_CATEGORIES } from "../shared/constants";
import { CommunityCategory } from "../shared/types";
import { InteractiveMap, searchPlaces, Place } from "../components/NavigationFlow";
import { communityApi, ApiPost, getSavedUser, normalizePosts, resolveCommunityImageUrl } from "../api/client";

// ── 카테고리별 색상 및 핀 아이콘 테마 ───────────────────────────────────────────
const CAT_COLORS: Record<string, { pin: string; card: string; badge: string; text: string; light: string; icon: string }> = {
  "고장":   { pin: "#757575", card: "#f5f5f5", badge: "#616161", text: "#333333", light: "#e0e0e0", icon: imgPinGojang },
  "어두움": { pin: "#1a237e", card: "#f0f0fa", badge: "#1a237e", text: "#0d1463", light: "#cfd0f0", icon: imgPinEoduum },
  "공사":   { pin: "#c0392b", card: "#fff0f0", badge: "#c0392b", text: "#7b1111", light: "#ffd6d6", icon: imgPinGongsa },
  "기타":   { pin: "#b25e09", card: "#fff9ed", badge: "#f47c20", text: "#4a2e0f", light: "#ffe4b0", icon: imgPinGita },
  "전체":   { pin: "#b25e09", card: "#fff9ed", badge: "#f47c20", text: "#4a2e0f", light: "#ffe4b0", icon: imgPinGita },
  "검색":   { pin: "#b25e09", card: "#fff9ed", badge: "#f47c20", text: "#4a2e0f", light: "#ffe4b0", icon: imgPinGita },
};
function catTheme(cat: string) {
  return CAT_COLORS[cat] ?? CAT_COLORS["기타"];
}

function postText(p: ApiPost): string {
  return p.descrip ?? p.content ?? p.description ?? "";
}

function isResolved(p: ApiPost): boolean {
  return p.is_resolved || p.resolve_count >= 3;
}

function getPostImageSrc(post: ApiPost): string | null {
  const raw = post as ApiPost & Record<string, unknown>;
  return resolveCommunityImageUrl(
    raw.image_url ?? raw.imageUrl ?? raw.image_path ?? raw.imagePath ??
    raw.photo_url ?? raw.photoUrl ?? raw.photo ?? raw.image ?? raw.file_url ?? raw.fileUrl ?? null
  );
}

// ── 장소 검색 ─────────────────────────────────────────────────────────────
async function searchPlacesRemote(query: string): Promise<Place[]> {
  const local = searchPlaces(query);
  if (local.length >= 3) return local;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&accept-language=ko&countrycodes=kr`;
    const res = await fetch(url, { headers: { "Accept-Language": "ko" } });
    if (!res.ok) return local;
    const data = await res.json();
    const remote: Place[] = data.map((item: { display_name: string; lat: string; lon: string }) => {
      const parts = item.display_name.split(",");
      return { name: parts[0].trim(), address: parts.slice(0, 3).join(",").trim(), lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
    });
    const combined = [...local];
    remote.forEach(r => { if (!combined.find(l => l.name === r.name)) combined.push(r); });
    return combined.slice(0, 7);
  } catch { return local; }
}

// ── 역지오코딩 ───────────────────────────────────────────────────────────────
function coordinateAddress(lat: number, lng: number) {
  return `현재 위치 (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallbackAddress = coordinateAddress(lat, lng);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
      { headers: { "Accept-Language": "ko" }, signal: controller.signal }
    );
    if (!res.ok) return fallbackAddress;

    const data = await res.json();
    const a = data.address ?? {};
    const parts = [a.road ?? a.pedestrian ?? a.footway, a.neighbourhood ?? a.suburb, a.city_district].filter(Boolean);
    return parts.join(" ") || data.display_name || fallbackAddress;
  } catch {
    return fallbackAddress;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) {
    return "위치 권한이 꺼져 있습니다. 휴대폰 설정에서 ZIP_RO의 위치 권한을 허용한 뒤 다시 눌러주세요.";
  }
  if (error.code === 2) {
    return "현재 위치를 찾지 못했습니다. GPS와 인터넷 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (error.code === 3) {
    return "위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  return "현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.";
}

// ── 핀 클러스터링 ──────────────────────────────────────────────────────────
type ClusterMarker = { lat: number; lng: number; posts: ApiPost[]; color: string; icon: string };
function clusterPosts(posts: ApiPost[]): ClusterMarker[] {
  const THRESH = 0.0011;
  const used = new Set<number>();
  const clusters: ClusterMarker[] = [];
  const geo = posts.filter(p => p.lat !== null && p.lng !== null);
  for (let i = 0; i < geo.length; i++) {
    if (used.has(i)) continue;
    const group: ApiPost[] = [geo[i]];
    used.add(i);
    for (let j = i + 1; j < geo.length; j++) {
      if (used.has(j)) continue;
      const dlat = (geo[j].lat! - geo[i].lat!);
      const dlng = (geo[j].lng! - geo[i].lng!);
      if (Math.sqrt(dlat * dlat + dlng * dlng) < THRESH) { group.push(geo[j]); used.add(j); }
    }
    const theme = catTheme(group[0].category);
    clusters.push({
      lat: group.reduce((s, p) => s + p.lat!, 0) / group.length,
      lng: group.reduce((s, p) => s + p.lng!, 0) / group.length,
      posts: group,
      color: theme.pin,
      icon: theme.icon,
    });
  }
  return clusters;
}

// ── 해결됨 스탬프 ────────────────────────────────────────────────────────────
function ResolvedStamp() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
      <div style={{ position: "relative", width: 110, height: 110 }}>
        <svg width="110" height="110" viewBox="0 0 110 110" fill="none" style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))" }}>
          <ellipse cx="55" cy="68" rx="30" ry="24" fill="#c0392b" opacity="0.92"/>
          <ellipse cx="28" cy="46" rx="12" ry="10" fill="#c0392b" opacity="0.92"/>
          <ellipse cx="46" cy="36" rx="12" ry="10" fill="#c0392b" opacity="0.92"/>
          <ellipse cx="64" cy="36" rx="12" ry="10" fill="#c0392b" opacity="0.92"/>
          <ellipse cx="82" cy="46" rx="12" ry="10" fill="#c0392b" opacity="0.92"/>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 16 }}>
          <span style={{ ...jua, fontSize: 20, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.4)", letterSpacing: "1px" }}>해결됨</span>
        </div>
      </div>
    </div>
  );
}

// ── 로고 버블 헤더 ────────────────────────────────────────────────────────────
function LogoBubble() {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div style={{
        background: "#ffe896",
        border: "2px solid #c59b4e",
        borderRadius: "20px",
        padding: "8px 22px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <p style={{ ...jua, fontSize: 18, color: "#3a2800", whiteSpace: "nowrap", letterSpacing: "1px", lineHeight: 1, margin: 0 }}>
          ZIP_COM
        </p>
      </div>
    </div>
  );
}

// ── 카테고리 탭 ──────────────────────────────────────────────────────────────
function CatTabs({ active, onChange }: { active: CommunityCategory; onChange: (c: CommunityCategory) => void }) {
  return (
    <div className="flex justify-center gap-1.5 px-4 pb-3 flex-wrap">
      {COMMUNITY_CATEGORIES.map(c => {
        const isActive = active === c;
        const theme = catTheme(c);
        return (
          <button key={c} onClick={() => onChange(c)}
            className="px-3 py-1 rounded-full text-[12px] transition-all active:scale-95"
            style={isActive
              ? { ...jua, background: theme.badge, color: "white", border: `1.5px solid ${theme.badge}`, boxShadow: `0 2px 8px ${theme.badge}66` }
              : { ...jua, background: "rgba(255,243,197,0.85)", color: "#4a2e0f", border: "1.5px solid #c59b4e" }
            }>
            {c}
          </button>
        );
      })}
    </div>
  );
}

// ── 게시물 카드 ───────────────────────────────────────────────────────────────
function PostCard({
  post, onSelect, onDelete, onLike, onResolve, isOwner,
}: {
  post: ApiPost; onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onLike: (e: React.MouseEvent) => void;
  onResolve: (e: React.MouseEvent) => void;
  isOwner: boolean;
}) {
  const resolved = isResolved(post);
  const theme = catTheme(post.category);
  const initial = (post.author_nickname ?? "익")[0];
  const displayAddress = post.locadescrip || post.address;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === "Enter" && onSelect()}
      className="w-full shrink-0 text-left rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
      style={{ background: theme.card, position: "relative", overflow: "hidden", border: `1px solid ${theme.light}`, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${theme.badge}, ${theme.badge}66)` }} />
      <div style={{ padding: "14px 14px 10px", filter: resolved ? "blur(2.5px)" : "none", transition: "filter 0.2s" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
              style={{ background: theme.badge }}>
              {initial}
            </div>
            <span style={{ ...jua, fontSize: 13, color: theme.text }}>{post.author_nickname ?? "익명"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ ...jua, fontSize: 11, padding: "2px 10px", borderRadius: 20, background: theme.badge, color: "white" }}>{post.category}</span>
            {isOwner && (
              <button onClick={onDelete} className="w-6 h-6 rounded-full flex items-center justify-center active:opacity-70" style={{ background: "#fee2e2" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {(() => {
          const imgSrc = getPostImageSrc(post);
          if (!imgSrc) return null;

          return (
            <div className="w-full h-[130px] rounded-xl overflow-hidden mb-2 bg-[#f0f0f0]">
              <img 
                src={imgSrc} 
                alt="첨부사진" 
                className="w-full h-full object-cover" 
                onError={(e) => {
                  (e.target as HTMLElement).parentElement!.style.display = "none";
                }}
              />
            </div>
          );
        })()}

        {postText(post) && (
          <p style={{ ...jua, fontSize: 13, color: theme.text, lineHeight: 1.55, margin: "0 0 4px" }}>
            {postText(post).length > 80 ? postText(post).slice(0, 80) + "…" : postText(post)}
          </p>
        )}

        {displayAddress && (
          <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#a07840", margin: "4px 0 0", display: "flex", items: "center", gap: 3 }}>
            📍 {displayAddress}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-3 pb-3" style={{ position: "relative", zIndex: 2 }}>
        <button onClick={onResolve}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] transition-all active:scale-95"
          style={post.resolved_by_me
            ? { ...jua, background: "#dcfce7", border: "1.5px solid #4caf50", color: "#166534" }
            : { ...jua, background: "rgba(255,255,255,0.7)", border: "1.5px solid #c59b4e", color: "#7c5a30" }
          }>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17L4 12" stroke={post.resolved_by_me ? "#4caf50" : "#7c5a30"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          완료 {post.resolve_count}/3
        </button>
        <button onClick={onLike} className="flex items-center gap-1.5 active:scale-90 transition-transform">
          <svg width="20" height="20" viewBox="0 0 24 24" fill={post.liked_by_me ? "#e05555" : "none"}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              stroke="#e05555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ ...jua, fontSize: 12, color: theme.text }}>{post.like_count}</span>
        </button>
      </div>

      {resolved && <ResolvedStamp />}
    </div>
  );
}

// ── 게시물 상세 모달 ─────────────────────────────────────────────────────────
function PostDetailBottomSheet({ post, onClose, onDelete }: { post: ApiPost; onClose: () => void; onDelete?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const theme = catTheme(post.category);
  const hasLocation = post.lat !== null && post.lng !== null;
  const markers = hasLocation ? [{ lat: post.lat!, lng: post.lng!, type: "pick" as const, color: theme.pin, icon: theme.icon }] : [];
  const me = getSavedUser();
  const isOwner = me?.user_id === post.author_id;

  const PEEK_H = 200;
  const FULL_H = "88vh";
  const touchStartY = useRef(0);

  const displayImg = getPostImageSrc(post);
  
  const dateStr = (() => {
    const rawDate = post.created_at || (post as any).createdAt || (post as any).date;
    if (!rawDate) return "2026.08.10";

    if (typeof rawDate === "string" && /^\d{4}\.\d{2}\.\d{2}$/.test(rawDate)) {
      return rawDate;
    }

    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      return typeof rawDate === "string" ? rawDate : "2026.08.10";
    }
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  })();

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99996 }}>
      <div
        style={{ position: "absolute", inset: 0, background: expanded ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.15)", transition: "background 0.35s ease", cursor: "pointer" }}
        onClick={onClose}
      />

      {hasLocation && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          bottom: expanded ? FULL_H : `${PEEK_H}px`,
          transition: "bottom 0.38s cubic-bezier(0.34,1.56,0.64,1)",
          isolation: "isolate",
        }}>
          <InteractiveMap markers={markers} centerTo={[post.lat!, post.lng!]} zoom={16} disableClick />
        </div>
      )}

      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: expanded ? FULL_H : `${PEEK_H}px`,
          background: theme.card,
          borderTopLeftRadius: 26, borderTopRightRadius: 26,
          boxShadow: "0 -6px 32px rgba(0,0,0,0.22)",
          transition: "height 0.38s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{ flexShrink: 0, padding: "12px 20px 6px", display: "flex", justifyContent: "center", cursor: "grab", touchAction: "none" }}
          onTouchStart={e => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            const delta = touchStartY.current - e.changedTouches[0].clientY;
            if (Math.abs(delta) > 36) setExpanded(delta > 0);
          }}
          onClick={() => { if (!expanded) setExpanded(true); }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.18)" }} />
        </div>

        <div style={{ flexShrink: 0, padding: "6px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: theme.badge, display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 17, fontWeight: 700, flexShrink: 0,
            }}>
              {(post.author_nickname ?? "익")[0]}
            </div>
            <div>
              <p style={{ ...jua, fontSize: 15, color: theme.text, margin: 0 }}>{post.author_nickname ?? "익명"}</p>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "#aaa", margin: 0 }}>
                {!expanded ? (postText(post).slice(0, 28) + (postText(post).length > 28 ? "…" : "")) : dateStr}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...jua, fontSize: 12, background: theme.badge, color: "white", borderRadius: 20, padding: "4px 12px" }}>{post.category}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#999", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
        </div>

        {expanded && (
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 36px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: 14, marginBottom: 16,
              background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <svg width="13" height="17" viewBox="0 0 24 30" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 18 8 18s8-11.5 8-18c0-4.42-3.58-8-8-8z" fill={theme.badge}/>
                  <circle cx="12" cy="10" r="3.2" fill="white"/>
                </svg>
                {/* 📌 위치명 동적 출력 부분 수정 */}
                <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {post.locadescrip || post.address || (hasLocation ? `${post.lat?.toFixed(4)}, ${post.lng?.toFixed(4)}` : "위치 미등록")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#888" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="#bbb" strokeWidth="2"/>
                  </svg>
                  {post.like_count ?? 0}
                </span>
                <span style={{ ...jua, fontSize: 11, background: post.is_resolved ? "#27ae60" : theme.badge, color: "white", borderRadius: 20, padding: "3px 10px" }}>
                  완료 {post.resolve_count ?? 0}
                </span>
              </div>
            </div>

            <div style={{ width: "100%", borderRadius: 18, overflow: "hidden", marginBottom: 16, background: "#ebebeb", minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {displayImg
                ? <img src={displayImg} alt="" style={{ width: "100%", maxHeight: 240, display: "block", objectFit: "cover" }} />
                : <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, color: "#bbb" }}>첨부사진</span>
              }
            </div>

            <div style={{ background: "white", borderRadius: 18, padding: "18px 20px", border: "1.5px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, color: "#333", margin: 0 }}>
                <span style={{ color: "#999" }}>등록날짜 : </span>{dateStr}
              </p>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, color: "#333", margin: 0 }}>
                <span style={{ color: "#999" }}>카테고리 분류 : </span>{post.category}
              </p>
              <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, color: "#333", margin: 0, lineHeight: 1.6 }}>
                <span style={{ color: "#999" }}>내용 : </span>{postText(post)}
              </p>
            </div>

            {isOwner && onDelete && (
              <button
                onClick={async e => {
                  e.stopPropagation();
                  if (window.confirm("게시물을 삭제하시겠습니까?")) {
                    await communityApi.delete(post.id).catch(() => {});
                    onDelete(); onClose();
                  }
                }}
                style={{ ...jua, marginTop: 16, width: "100%", padding: "13px", background: "#c0392b", color: "white", border: "none", borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
                게시물 삭제
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── 클러스터 선택 모달 ───────────────────────────────────────────────────────
function ClusterModal({ posts, onSelect, onClose }: { posts: ApiPost[]; onSelect: (p: ApiPost) => void; onClose: () => void }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99995, background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff9ed", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
        </div>
        <div style={{ padding: "8px 20px 10px", borderBottom: "1px solid #f0dcaa", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...jua, fontSize: 15, color: "#4a2e0f" }}>이 위치의 게시물 {posts.length}개</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "6px 0 24px" }}>
          {posts.map(p => (
            <button key={p.id} onClick={() => { onSelect(p); onClose(); }}
              className="w-full text-left px-4 py-3 active:bg-[#ffe896] transition-colors"
              style={{ background: "none", border: "none", borderBottom: "1px solid #f5e9c8", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...jua, fontSize: 11, background: catTheme(p.category).badge, color: "white", borderRadius: 20, padding: "2px 10px" }}>{p.category}</span>
                <span style={{ ...jua, fontSize: 12, color: "#7c3b00" }}>{p.author_nickname ?? "익명"}</span>
              </div>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#4a2e0f" }}>{postText(p).slice(0, 60)}{postText(p).length > 60 ? "…" : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CommunityScreen({ onBack }: { onBack: () => void }) {
  type CView = "welcome" | "exit_confirm" | "warning" | "map" | "postlist" | "newpost";
  const savedUser = getSavedUser();

  const [view, setView]               = useState<CView>("welcome");
  const [activeTab, setActiveTab]     = useState<CommunityCategory>("전체");
  const [posts, setPosts]             = useState<ApiPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [newDesc, setNewDesc]         = useState("");
  const [newCat, setNewCat]           = useState<CommunityCategory>("전체");
  const [postImgFile, setPostImgFile] = useState<File | null>(null);
  const [postImgPreview, setPostImgPreview] = useState("");
  const postImgUrlRef                 = useRef<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<ApiPost | null>(null);
  const [clusterPosts_s, setClusterPosts_s] = useState<ApiPost[] | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [userGps, setUserGps]         = useState<[number, number] | null>(null);
  const [mapFocus, setMapFocus]       = useState<[number, number] | null>(null);
  const [postLat, setPostLat]         = useState<number | null>(null);
  const [postLng, setPostLng]         = useState<number | null>(null);
  const [postAddress, setPostAddress] = useState("");
  const [gettingLoc, setGettingLoc]   = useState(false);
  const [locationError, setLocationError] = useState("");
  const [placeQuery, setPlaceQuery]   = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<Place[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const placeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPosts = useCallback(async (cat?: CommunityCategory) => {
    setLoadingPosts(true);
    try {
      const getPos = (): Promise<{ lat: number; lng: number }> =>
        new Promise(resolve => {
          if (!navigator.geolocation) return resolve({ lat: 37.5665, lng: 126.9780 });
          navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve({ lat: 37.5665, lng: 126.9780 }),
            { timeout: 4000, maximumAge: 60000 }
          );
        });
      const pos = await getPos();
      setUserGps([pos.lat, pos.lng]);
      const r = await communityApi.list({
        lat: pos.lat, lng: pos.lng,
        category: cat ?? (activeTab !== "검색" ? activeTab : undefined),
        keyword: activeTab === "검색" ? searchQuery : undefined,
      });
      setPosts(normalizePosts(r as Parameters<typeof normalizePosts>[0]));
    } catch { /* keep existing */ }
    finally { setLoadingPosts(false); }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (view === "postlist" || view === "map") loadPosts();
  }, [view, activeTab]);

  const filteredPosts = activeTab === "검색" ? posts.filter(p => postText(p).includes(searchQuery)) : posts;
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    const aR = isResolved(a), bR = isResolved(b);
    if (aR && !bR) return 1; if (!aR && bR) return -1; return 0;
  });

  function handlePlaceQueryChange(q: string) {
    setPlaceQuery(q);
    if (placeSearchTimer.current) clearTimeout(placeSearchTimer.current);
    if (!q.trim()) { setPlaceSuggestions([]); return; }
    setSearchingPlace(true);
    placeSearchTimer.current = setTimeout(async () => {
      const results = await searchPlacesRemote(q);
      setPlaceSuggestions(results); setSearchingPlace(false);
    }, 400);
  }

  function selectPlace(place: Place) {
    setPostLat(place.lat); setPostLng(place.lng);
    setPostAddress(place.name + " " + place.address);
    setPlaceQuery(""); setPlaceSuggestions([]);
  }

  async function captureLocation() {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("이 기기에서는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (!window.isSecureContext) {
      setLocationError("현재 위치 기능은 HTTPS로 배포된 앱에서만 사용할 수 있습니다.");
      return;
    }

    setGettingLoc(true);
    try {
      let pos: GeolocationPosition;
      try {
        // 휴대폰 GPS를 우선 사용한다. 실내·절전 상태를 고려해 일반 위치 확인으로 한 번 더 시도한다.
        pos = await getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
      } catch (highAccuracyError) {
        const gpsError = highAccuracyError as GeolocationPositionError;
        if (gpsError.code === 1) throw gpsError;
        pos = await getPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setPostLat(lat);
      setPostLng(lng);
      // 좌표를 즉시 확정한다. 주소 변환이 느리거나 실패해도 좌표 주소로 바로 등록할 수 있다.
      setPostAddress(coordinateAddress(lat, lng));
      void reverseGeocode(lat, lng).then((address) => {
        setPostAddress((currentAddress) =>
          currentAddress === coordinateAddress(lat, lng) ? address : currentAddress
        );
      });
    } catch (error) {
      const geoError = error as GeolocationPositionError;
      const isPreview = window.self !== window.top;
      setLocationError(
        geoError?.code === 1 && isPreview
          ? "현재 Figma 미리보기에서는 위치 권한이 차단될 수 있습니다. 휴대폰의 배포된 앱에서 권한을 허용한 뒤 사용해주세요."
          : getLocationErrorMessage(geoError)
      );
    } finally {
      setGettingLoc(false);
    }
  }

  async function submitPost() {
    if (!newDesc.trim()) return;
    const cat: CommunityCategory = newCat === "전체" ? "기타" : newCat;
    const finalLat = postLat ?? 37.5665, finalLng = postLng ?? 126.9780;
    const finalAddress = postAddress || `${finalLat.toFixed(4)}, ${finalLng.toFixed(4)}`;

    setSubmitting(true);
    try {
      await communityApi.create({ 
        category: cat, 
        descrip: newDesc.trim(), 
        lat: finalLat, 
        lng: finalLng, 
        locadescrip: finalAddress,
        address: finalAddress,
        imageFile: postImgFile, 
        image_url: postImgPreview 
      } as any);
      setNewDesc(""); setPostImgFile(null); setPostImgPreview(""); setNewCat("전체");
      setPostLat(null); setPostLng(null); setPostAddress(""); setActiveTab(cat); setView("postlist");
    } catch (e: unknown) { alert((e as Error).message ?? "게시글 등록 실패"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(postId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("게시물을 삭제하시겠습니까?")) return;
    try { await communityApi.delete(postId); setPosts(prev => prev.filter(p => p.id !== postId)); }
    catch { alert("삭제에 실패했습니다."); }
  }

  async function handleLike(postId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const r = await communityApi.like(postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked_by_me: r.liked, like_count: r.like_count } : p));
    } catch { /* ignore */ }
  }

  async function handleResolve(postId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const r = await communityApi.resolve(postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, resolved_by_me: r.resolved_by_me, resolve_count: r.resolve_count, is_resolved: r.is_resolved } : p));
    } catch { /* ignore */ }
  }

  function goToMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => setUserGps([pos.coords.latitude, pos.coords.longitude]), () => {}, { enableHighAccuracy: true });
  }

  function goToNearestPin() {
    if (!userGps || posts.length === 0) return;
    const [ulat, ulng] = userGps;
    const geo = posts.filter(p => p.lat !== null && p.lng !== null);
    if (geo.length === 0) return;

    const nearest = geo.reduce((best, p) =>
      Math.hypot(p.lat! - ulat, p.lng! - ulng) < Math.hypot(best.lat! - ulat, best.lng! - ulng) ? p : best
    );

    // 같은 핀을 반복해서 눌러도 지도 컴포넌트의 중심 이동 효과가 다시 실행되도록,
    // 현재 중심 요청을 한 프레임 비운 뒤 새 이동 요청을 전달한다. 상세 패널은 열지 않는다.
    const target: [number, number] = [nearest.lat!, nearest.lng!];
    setMapFocus(null);
    window.requestAnimationFrame(() => setMapFocus(target));
  }

  // ── 공통 헤더 ──
  function Header({ onBackPress }: { onBackPress: () => void }) {
    return (
      <div style={{ paddingTop: "max(env(safe-area-inset-top, 60px), 60px)" }}>
        <div className="relative flex items-center justify-center px-4 pb-2" style={{ minHeight: 58 }}>
          <button onClick={onBackPress} className="absolute left-4 w-9 h-9 flex items-center justify-center rounded-full active:bg-black/10 transition-colors">
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
              <path d="M15 18L9 12L15 6" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <LogoBubble />
        </div>
      </div>
    );
  }

  // ── 1. Welcome (진입 접속 확인 팝업) ──
  if (view === "welcome") return (
    <div className="bg-white relative size-full overflow-hidden">
      <div className="absolute h-[931px] left-[-18px] opacity-80 top-0 w-[429px]">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgCommunityForest} />
      </div>
      <div className="absolute inset-[20%_15%_20%_15%] pointer-events-none flex items-center justify-center">
        <img alt="곰돌이" className="w-full h-full object-contain" src={imgCommunityBearProfile} />
      </div>
      <div className="absolute bottom-[80px] left-0 right-0 px-8">
        <div className="w-full rounded-3xl px-6 py-5 flex flex-col items-center gap-4 shadow-xl" style={{ background: "rgba(255,243,197,0.92)", backdropFilter: "blur(6px)" }}>
          <p className="text-center text-[18px] text-[#4a2e0f] tracking-[0.5px] m-0" style={jua}>
            커뮤니티에 접속하시겠습니까?
          </p>
          <div className="flex w-full gap-3">
            <button onClick={onBack}
              className="flex-1 py-3 rounded-2xl text-[15px] active:opacity-70 transition-opacity"
              style={{ ...jua, background: "#e8d9b8", color: "#4a2e0f", border: "none" }}>
              아니오
            </button>
            <button onClick={() => setView("warning")}
              className="flex-1 py-3 rounded-2xl text-white text-[15px] active:opacity-70 transition-opacity"
              style={{ ...jua, background: "#4a2e0f", border: "none", boxShadow: "0 4px 14px rgba(74,46,15,0.35)" }}>
              예
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 2. Exit Confirm (퇴장 확인 팝업) ──
  if (view === "exit_confirm") return (
    <div className="bg-white relative size-full overflow-hidden">
      <div className="absolute h-[931px] left-[-18px] opacity-80 top-0 w-[429px]">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgCommunityForest} />
      </div>
      <div className="absolute inset-[20%_15%_20%_15%] pointer-events-none flex items-center justify-center">
        <img alt="곰돌이" className="w-full h-full object-contain" src={imgCommunityBearProfile} />
      </div>
      <div className="absolute bottom-[80px] left-0 right-0 px-8">
        <div className="w-full rounded-3xl px-6 py-5 flex flex-col items-center gap-4 shadow-xl" style={{ background: "rgba(255,243,197,0.92)", backdropFilter: "blur(6px)" }}>
          <p className="text-center text-[18px] text-[#4a2e0f] tracking-[0.5px] m-0" style={jua}>
            커뮤니티에서 나가시겠습니까?
          </p>
          <div className="flex w-full gap-3">
            <button onClick={() => setView("map")}
              className="flex-1 py-3 rounded-2xl text-[15px] active:opacity-70 transition-opacity"
              style={{ ...jua, background: "#e8d9b8", color: "#4a2e0f", border: "none" }}>
              아니오
            </button>
            <button onClick={onBack}
              className="flex-1 py-3 rounded-2xl text-white text-[15px] active:opacity-70 transition-opacity"
              style={{ ...jua, background: "#4a2e0f", border: "none", boxShadow: "0 4px 14px rgba(74,46,15,0.35)" }}>
              예
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 3. Warning (주의 경고 화면) ──
  if (view === "warning") return (
    <div className="absolute inset-0 overflow-hidden flex flex-col">
      <img src={imgCommunityMap} alt="" className="absolute inset-0 size-full object-cover" />
      <div className="relative z-10 shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 60px), 60px)" }}>
        <div className="relative flex items-center justify-center px-4 pb-2" style={{ minHeight: 58 }}>
          <button onClick={() => setView("welcome")} className="absolute left-4 w-9 h-9 flex items-center justify-center rounded-full active:bg-black/10">
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
              <path d="M15 18L9 12L15 6" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <LogoBubble />
        </div>
      </div>
      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="rounded-3xl shadow-xl px-6 py-7 flex flex-col items-center gap-4 w-[288px]" style={{ background: "rgba(255,243,197,0.95)" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#ef4444"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={jua} className="text-[20px] text-[#c0392b] m-0">주의</p>
          <p style={jua} className="text-[13px] text-[#4a2e0f] text-center leading-relaxed m-0">커뮤니티의 내용을 너무 믿지 마시오.</p>
          <button onClick={() => setView("map")} className="w-full py-3 rounded-2xl text-white text-[15px] active:opacity-70"
            style={{ ...jua, background: "#2d2d2d" }}>확인</button>
        </div>
      </div>
    </div>
  );

  // ── 4. Map view (지도 화면) ──
  if (view === "map") {
    const clusters = clusterPosts(filteredPosts);
    const mapMarkers = clusters.map(c => ({
      lat: c.lat, 
      lng: c.lng, 
      type: "pick" as const, 
      color: c.color,
      icon: c.icon,
      clusterCount: c.posts.length,
      id: c.posts.length === 1 ? String(c.posts[0].id) : undefined,
    }));

    return (
      <div className="absolute inset-0 flex flex-col overflow-hidden">
        <div className="absolute inset-0" style={{ isolation: "isolate" }}>
          <InteractiveMap markers={mapMarkers} zoom={14} centerTo={mapFocus ?? undefined} disableClick userGpsPos={userGps} followGps={false}
            onMarkerClick={marker => {
              const cluster = clusters.find(c => Math.abs(c.lat - marker.lat) < 0.00001 && Math.abs(c.lng - marker.lng) < 0.00001);
              if (!cluster) return;
              if (cluster.posts.length === 1) setSelectedPost(cluster.posts[0]);
              else setClusterPosts_s(cluster.posts);
            }}
          />
        </div>

        <div className="relative shrink-0 pointer-events-auto" style={{ background: "rgba(255,249,237,0.93)", backdropFilter: "blur(8px)", zIndex: 10 }}>
          <Header onBackPress={() => setView("exit_confirm")} />
          <CatTabs active={activeTab} onChange={setActiveTab} />
        </div>

        <div className="absolute right-3 flex flex-col gap-2 pointer-events-auto" style={{ top: 160, zIndex: 11 }}>
          <button onClick={goToMyLocation}
            className="w-11 h-11 rounded-2xl flex items-center justify-center active:opacity-70 active:scale-95 transition-all"
            style={{ background: "white", boxShadow: "0 3px 12px rgba(0,0,0,0.18)", border: "1.5px solid #e8d9b8" }} title="내 위치로">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3.5" fill="#2979ff"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#2979ff" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="7" stroke="#2979ff" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button onClick={goToNearestPin}
            className="w-11 h-11 rounded-2xl flex items-center justify-center active:opacity-70 active:scale-95 transition-all"
            style={{ background: "white", boxShadow: "0 3px 12px rgba(0,0,0,0.18)", border: "1.5px solid #e8d9b8" }} title="가장 가까운 핀">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#f47c20" opacity="0.9"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
          </button>
        </div>

        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 pointer-events-auto" style={{ zIndex: 10 }}>
          <button onClick={() => setView("postlist")}
            className="flex items-center gap-2 px-5 py-3 rounded-full active:scale-95 transition-transform text-[14px]"
            style={{ ...jua, background: "#fff3c5", color: "#4a2e0f", border: "2px solid #c59b4e", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="#4a2e0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            목록 보기
          </button>
          <button onClick={() => setView("newpost")}
            className="flex items-center gap-2 px-5 py-3 rounded-full active:scale-95 transition-transform text-white text-[14px]"
            style={{ ...jua, background: "#f47c20", boxShadow: "0 4px 16px rgba(244,124,32,0.45)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            게시물 등록
          </button>
        </div>

        {selectedPost && <PostDetailBottomSheet post={selectedPost} onClose={() => setSelectedPost(null)} onDelete={() => { setPosts(prev => prev.filter(p => p.id !== selectedPost.id)); setSelectedPost(null); }} />}
        {clusterPosts_s && <ClusterModal posts={clusterPosts_s} onSelect={setSelectedPost} onClose={() => setClusterPosts_s(null)} />}
      </div>
    );
  }

  // ── 5. Post list (목록 화면) ──
  if (view === "postlist") return (
    <div className="absolute inset-0 overflow-hidden flex flex-col">
      <img src={imgCommunityForest} alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-white/50" />

      <div className="relative z-20 w-full shrink-0 pointer-events-auto" style={{ background: "rgba(255,249,237,0.95)", backdropFilter: "blur(6px)" }}>
        <div className="relative">
          <Header onBackPress={() => setView("map")} />
          <button onClick={() => setView("map")}
            className="absolute flex items-center gap-1.5 px-3 py-1.5 rounded-full active:opacity-70"
            style={{ ...jua, top: "50%", right: 16, transform: "translateY(-50%)", background: "#fff3c5", border: "1.5px solid #c59b4e", color: "#4a2e0f", fontSize: 12, boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
            <svg width="12" height="15" viewBox="0 0 24 30" fill="none">
              <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 18 8 18s8-11.5 8-18c0-4.42-3.58-8-8-8z" fill="#f47c20"/>
              <circle cx="12" cy="10" r="3.2" fill="white"/>
            </svg>
            지도
          </button>
        </div>
        <CatTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "검색" && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-[#c59b4e]" style={{ background: "#fff9ed" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="#b25e09" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="#b25e09" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요" style={{ ...jua, fontSize: "15px", flex: 1, background: "transparent", border: "none", outline: "none", color: "#4a2e0f" }}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
            </div>
          </div>
        )}
      </div>

      <div className="relative z-0 flex-1 px-4 pt-3 pb-36 flex flex-col gap-3 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {loadingPosts && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-t-[#f47c20] animate-spin" style={{ borderWidth: 3, borderColor: "#c59b4e33", borderTopColor: "#f47c20" }} />
            <p style={jua} className="text-[13px] text-[#4a2e0f]">불러오는 중…</p>
          </div>
        )}

        {!loadingPosts && sortedPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "#fff3c5" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#b25e09" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <p style={jua} className="text-[15px] text-[#4a2e0f] m-0">게시물이 없습니다</p>
              <p className="text-[12px] text-[#a07840] m-0" style={{ fontFamily: "system-ui,sans-serif" }}>첫 번째 게시물을 등록해 보세요</p>
            </div>
            <button onClick={() => setView("newpost")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white active:opacity-70"
              style={{ ...jua, background: "#f47c20", fontSize: 13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              게시물 등록하기
            </button>
          </div>
        )}

        {!loadingPosts && sortedPosts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onSelect={() => setSelectedPost(post)}
            onDelete={e => handleDelete(String(post.id), e)}
            onLike={e => handleLike(String(post.id), e)}
            onResolve={e => handleResolve(String(post.id), e)}
            isOwner={savedUser?.user_id === post.author_id}
          />
        ))}

        <div 
          className={
            activeTab === "검색" 
              ? "h-56 shrink-0" 
              : (activeTab === "전체" || activeTab === "기타")
              ? "h-80 shrink-0" 
              : "h-32 shrink-0"
          } 
        />
        
      </div>

      <button onClick={() => setView("newpost")}
        className="absolute bottom-6 right-5 z-20 w-14 h-14 rounded-2xl flex items-center justify-center text-white active:scale-95 active:opacity-80 transition-all"
        style={{ ...jua, background: "#f47c20", boxShadow: "0 6px 20px rgba(244,124,32,0.5)", fontSize: 28 }}>+</button>

      {selectedPost && <PostDetailBottomSheet post={selectedPost} onClose={() => setSelectedPost(null)} onDelete={() => { setPosts(prev => prev.filter(p => p.id !== selectedPost.id)); setSelectedPost(null); }} />}
    </div>
  );

  // ── 6. New post form (글쓰기 화면) ──
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "rgba(255,249,237,0.97)" }}>
      <img src={imgCommunityForest} alt="" className="absolute inset-0 size-full object-cover" style={{ zIndex: 0 }} />
      <div className="absolute inset-0 bg-white/50" style={{ zIndex: 0 }} />

      <div className="relative shrink-0" style={{ zIndex: 10, background: "rgba(255,249,237,0.97)", backdropFilter: "blur(6px)" }}>
        <Header onBackPress={() => setView("postlist")} />
      </div>

      <div className="relative flex-1" style={{ zIndex: 10, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        <div className="flex flex-col gap-3 px-4 pt-3 pb-20">

        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff9ed", border: "1px solid #ead9a8" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#f5d996", borderBottom: "1px solid #e8c97e" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="#7c5a30"/>
              <rect x="14" y="3" width="7" height="7" rx="1" fill="#7c5a30"/>
              <rect x="3" y="14" width="7" height="7" rx="1" fill="#7c5a30"/>
              <rect x="14" y="14" width="7" height="7" rx="1" fill="#7c5a30"/>
            </svg>
            <p style={jua} className="text-[14px] text-[#4a2e0f] m-0">카테고리</p>
          </div>
          <div className="px-4 py-3 flex gap-2 flex-wrap">
            {COMMUNITY_CATEGORIES.filter(c => c !== "전체" && c !== "검색").map(c => {
              const t = catTheme(c);
              const isActive = newCat === c;
              return (
                <button key={c}
                  style={isActive
                    ? { ...jua, background: t.badge, color: "white", border: `1.5px solid ${t.badge}`, boxShadow: `0 2px 8px ${t.badge}44` }
                    : { ...jua, background: "rgba(255,255,255,0.8)", color: "#4a2e0f", border: "1.5px solid #c59b4e" }
                  }
                  onClick={() => setNewCat(c as CommunityCategory)}
                  className="px-3 py-1.5 rounded-full text-[12px] transition-all active:scale-95">{c}</button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff9ed", border: "1px solid #ead9a8" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#f5d996", borderBottom: "1px solid #e8c97e" }}>
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#7c5a30" strokeWidth="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="#7c5a30"/>
                <path d="M21 15l-5-5L5 21" stroke="#7c5a30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={jua} className="text-[14px] text-[#4a2e0f] m-0">사진 첨부</p>
            </div>
            <span className="text-[11px] text-[#a07840]" style={{ fontFamily: "system-ui" }}>(선택)</span>
          </div>
          <div className="p-3">
            <input id="post-photo-upload" type="file" accept="image/*" className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64Url = reader.result as string;
                    setPostImgFile(file); 
                    setPostImgPreview(base64Url);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            {!postImgPreview ? (
              <label htmlFor="post-photo-upload"
                className="h-[110px] rounded-xl flex flex-col items-center justify-center cursor-pointer active:scale-[0.99] transition-all border-2 border-dashed"
                style={{ background: "#faf3e0", borderColor: "#d4b97a" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="mb-1.5">
                  <path d="M12 5V19M5 12H19" stroke="#a07840" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={jua} className="text-[12px] text-[#a07840] m-0">탭하여 사진 추가</p>
              </label>
            ) : (
              <div className="relative h-[160px] w-full rounded-xl overflow-hidden shadow-inner group">
                <img src={postImgPreview} alt="첨부된 사진" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setPostImgFile(null); setPostImgPreview(""); }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center font-bold z-10 active:scale-90 transition-all"
                  style={{ fontSize: 13 }}>✕</button>
                <label htmlFor="post-photo-upload"
                  className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <span style={jua} className="bg-black/50 px-3 py-1.5 rounded-full text-[12px] text-white">사진 변경</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#fff9ed", border: "1px solid #ead9a8" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#f5d996", borderBottom: "1px solid #e8c97e" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#7c5a30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p style={jua} className="text-[14px] text-[#4a2e0f] m-0">내용</p>
          </div>
          <div className="p-3">
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="내용을 입력하세요."
              className="w-full h-[100px] resize-none rounded-xl px-3 py-3 outline-none placeholder:text-[#b0946a]"
              style={{ ...jua, fontSize: "15px", background: "#faf3e0", border: "1.5px solid #d4b97a" }}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
          </div>
        </div>

        <div className="rounded-2xl shadow-sm" style={{ background: "#fff9ed", border: "1px solid #ead9a8", overflow: "visible" }}>
          <div className="px-4 py-3 flex items-center justify-between rounded-t-2xl" style={{ background: "#f5d996", borderBottom: "1px solid #e8c97e" }}>
            <div className="flex items-center gap-2">
              <svg width="12" height="15" viewBox="0 0 24 30" fill="none">
                <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 18 8 18s8-11.5 8-18c0-4.42-3.58-8-8-8z" fill="#7c5a30"/>
                <circle cx="12" cy="10" r="3.2" fill="white"/>
              </svg>
              <p style={jua} className="text-[14px] text-[#4a2e0f] m-0">위치 등록</p>
            </div>
            <span className="text-[11px] text-[#a07840]" style={{ fontFamily: "system-ui" }}>(선택)</span>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {postLat !== null ? (
              <>
                <div className="rounded-xl flex items-center justify-between px-3 py-2.5" style={{ background: "#faf3e0", border: "1.5px solid #d4b97a" }}>
                  <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#4a2e0f", margin: 0 }}>
                    📍 {postAddress || `${postLat.toFixed(4)}, ${postLng!.toFixed(4)}`}
                  </p>
                  <button onClick={() => { setPostLat(null); setPostLng(null); setPostAddress(""); }}
                    style={{ background: "none", border: "none", color: "#b09060", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>
                {postLng !== null && (
                  <div className="rounded-xl overflow-hidden" style={{ height: 120, position: "relative", border: "1.5px solid #d4b97a" }}>
                    <InteractiveMap markers={[{ lat: postLat, lng: postLng, type: "pick", icon: catTheme(newCat).icon }]} centerTo={[postLat, postLng]} zoom={15} disableClick />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative">
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#faf3e0", border: "1.5px solid #d4b97a" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" stroke="#b25e09" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="#b25e09" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input value={placeQuery} onChange={e => handlePlaceQueryChange(e.target.value)}
                      placeholder="장소 검색 (예: 강남역, 서울시청)"
                      style={{ ...jua, fontSize: "13px", flex: 1, background: "transparent", border: "none", outline: "none", color: "#4a2e0f" }}
                      autoComplete="off" autoCorrect="off" spellCheck={false} />
                    {searchingPlace && <div className="w-3.5 h-3.5 rounded-full animate-spin shrink-0" style={{ borderWidth: 2, borderColor: "#b25e0933", borderTopColor: "#b25e09" }} />}
                  </div>
                  {placeSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden" style={{ background: "#fff9ed", zIndex: 50, border: "1px solid #d9c07a" }}>
                      {placeSuggestions.map((p, i) => (
                        <button key={i} onClick={() => selectPlace(p)}
                          className="w-full text-left px-3 py-2.5 flex flex-col gap-0.5 active:bg-[#ffe896] border-b border-[#f0dcaa] last:border-0"
                          style={{ background: "none", border: "none", borderBottom: "1px solid #f0dcaa", cursor: "pointer" }}>
                          <span style={{ ...jua, fontSize: 13, color: "#4a2e0f" }}>{p.name}</span>
                          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: "#a07840" }}>{p.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={captureLocation} disabled={gettingLoc}
                  className="w-full h-[42px] rounded-xl flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-50"
                  style={{ background: "#f5d996", border: "1.5px dashed #c5b078" }}>
                  {gettingLoc ? (
                    <div className="w-4 h-4 rounded-full animate-spin" style={{ borderWidth: 2, borderColor: "#b25e0933", borderTopColor: "#b25e09" }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="3.5" fill="#b25e09"/>
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#b25e09" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="12" r="7" stroke="#b25e09" strokeWidth="2" fill="none"/>
                    </svg>
                  )}
                  <span style={{ ...jua, fontSize: 13, color: "#7c5a30" }}>
                    {gettingLoc ? "위치 가져오는 중..." : "현재 위치로 등록"}
                  </span>
                </button>
                {locationError && (
                  <div className="rounded-xl px-3 py-2" style={{ background: "#fff1f0", border: "1px solid #f1b6ae" }}>
                    <p style={{ ...jua, fontSize: 11, lineHeight: 1.45, color: "#a33b30", margin: 0 }}>{locationError}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <button onClick={submitPost} disabled={submitting || !newDesc.trim()}
          className="w-full py-4 rounded-2xl text-white text-[16px] active:opacity-70 transition-opacity disabled:opacity-40"
          style={{ ...jua, background: "#2d2d2d", boxShadow: "0 4px 14px rgba(0,0,0,0.25)" }}>
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full animate-spin inline-block" style={{ borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "white" }} />
              등록 중…
            </span>
          ) : "등록"}
        </button>
        </div>
      </div>
    </div>
  );
}