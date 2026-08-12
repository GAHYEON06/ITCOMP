import type { CommunityPost } from "./types";

// 전역 커뮤니티 핀 저장소 — 화면 전환 후에도 데이터 유지
let _pins: CommunityPost[] = [];
let _listeners: (() => void)[] = [];

export function getCommunityPins(): CommunityPost[] {
  return _pins.filter(p => p.lat !== undefined && p.lng !== undefined);
}

export function addCommunityPin(post: CommunityPost) {
  // 날짜 누락 시 사용할 오늘 날짜 생성 (YYYY.MM.DD)
  const today = new Date().toISOString().split("T")[0].replace(/-/g, ".");

  // 날짜 및 사진 데이터 누락 방지 및 통합 처리
  const normalizedPost: CommunityPost = {
    ...post,
    createdAt: post.createdAt || post.date || today,
    date: post.date || post.createdAt || today,
    img: post.img || (post as any).imageUrl || (post as any).photo || "",
  };

  _pins = _pins.filter(p => p.id !== normalizedPost.id);
  _pins.push(normalizedPost);
  _listeners.forEach(fn => fn());
}

export function initCommunityPins(posts: CommunityPost[]) {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, ".");
  const withLocation = posts.filter(p => p.lat !== undefined && p.lng !== undefined);

  withLocation.forEach(p => {
    const normalizedPost: CommunityPost = {
      ...p,
      createdAt: p.createdAt || p.date || today,
      date: p.date || p.createdAt || today,
      img: p.img || (p as any).imageUrl || (p as any).photo || "",
    };

    if (!_pins.find(x => x.id === normalizedPost.id)) {
      _pins.push(normalizedPost);
    }
  });
}

export function removeCommunityPin(id: number) {
  _pins = _pins.filter(p => p.id !== id);
  _listeners.forEach(fn => fn());
}

export function subscribePins(fn: () => void) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}