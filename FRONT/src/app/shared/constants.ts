import mainPaths from "@/imports/Main피보호자/svg-jf129ggkg0";
import { COMMUNITY_CATEGORIES } from "./types";
import type { CommunityPost, Ward, WardNotif } from "./types";

export { COMMUNITY_CATEGORIES };

export { mainPaths };

export const jua: React.CSSProperties = { fontFamily: "'Jua', sans-serif" };

export const VWORLD_KEY = "1BD705BC-E920-3526-B69B-B1E5B4C5C659";

export const DESIGN_W = 393;
export const DESIGN_H = 852;

export const FADE_MS = 260;

export const TRANSITION_CSS = `
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    background: #fff3c5;
    /* position:fixed prevents layout shift when keyboard opens on mobile */
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
  }
  @keyframes zp-fade-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes zp-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    [style*="zp-fade"] { animation: none !important; }
  }
  /* Eliminate 300ms tap delay on all interactive elements */
  * { touch-action: manipulation; }
  /* Re-allow scroll on elements that need it */
  .overflow-y-auto, .overflow-y-scroll { touch-action: pan-y; }
`;

export const BT_PATTERN = /bluetooth|wireless|airpod|headset|headphone|earbud|bose|jabra|sony|beats|sennheiser/i;
export const BUILTIN_PATTERN = /speaker|earpiece|built.?in|phone/i;

export const LOGO_ASPECT = 213 / 378.667; // height/width of the logo image

export const LOGO_LETTERS = [
  { t: "Z", cx: 19.34, cy: 67.19, fs: 55, c: "white",   r: 11.37  },
  { t: "S", cx: 28.62, cy: 37.00, fs: 33, c: "#f0f0f0", r: 11.37  },
  { t: "a", cx: 41.90, cy: 37.08, fs: 33, c: "#f0f0f0", r: -10.13 },
  { t: "f", cx: 54.56, cy: 36.29, fs: 33, c: "#f0f0f0", r: -11.27 },
  { t: "e", cx: 67.35, cy: 35.90, fs: 33, c: "#f0f0f0", r: 6.09   },
  { t: "I", cx: 38.16, cy: 66.40, fs: 55, c: "white",   r: -9.91  },
  { t: "P", cx: 56.86, cy: 66.40, fs: 55, c: "white",   r: -9.05  },
  { t: "R", cx: 75.65, cy: 62.42, fs: 40, c: "white",   r: 14.74  },
  { t: "O", cx: 82.62, cy: 72.31, fs: 40, c: "white",   r: 0      },
] as const;

export const LEAF_ANIM = [
  { opacity: [0,0,1,1] as number[], times: [0,0.1429,0.2143,1], ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.5,0.5714,1],    ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.2857,0.3571,1], ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.5714,0.6429,1], ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.6429,0.7143,1], ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.0714,0.1429,1], ease: ["linear","easeIn","linear"]  as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.4286,0.5,1],    ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,1,1]   as number[], times: [0,0.0714,1],         ease: ["easeIn","linear"]           as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.3571,0.4286,1], ease: ["linear","easeOut","linear"] as string[] },
  { opacity: [0,0,1,1] as number[], times: [0,0.2143,0.2857,1], ease: ["linear","easeOut","linear"] as string[] },
] as const;

export const TEXT_OPACITY = [0,0.16667,0.33333,0.5,0.66667,0.83333,1,0.73966,0.51165,0.31536,0.15616,0.0445,0.01,0.17667,0.34333,0.51,0.67667,0.84333,0.98309,0.72512,0.49895,0.30468,0.14799,0.03967,0.01167,0.17833,0.345,0.51167,0.67833,0.845,0.9803,0.72271,0.49684,0.30292,0.14664,0.03888,0.01667,0.18333,0.35,0.51667,0.68333,0.85,0.97199,0.71549,0.49054,0.29764,0.14263,0.03658,0.01833,0.185,0.35167,0.51833,0.685,0.85167,0.96923,0.7131,0.48844,0.29589,0.1413,0.03582,0.02,0.18667,0.35333,0.52,0.68667,0.85333,0.96648,0.7107,0.48635,0.29414,0.13998,0.03507,0];
export const TEXT_TIMES  = [0,0.0143,0.0286,0.0429,0.0571,0.0714,0.0857,0.1,0.1143,0.1286,0.1429,0.1571,0.1714,0.1857,0.2,0.2143,0.2286,0.2429,0.2571,0.2714,0.2857,0.3,0.3143,0.3286,0.3429,0.3571,0.3714,0.3857,0.4,0.4143,0.4286,0.4429,0.4571,0.4714,0.4857,0.5,0.5143,0.5286,0.5429,0.5571,0.5714,0.5857,0.6,0.6143,0.6286,0.6429,0.6571,0.6714,0.6857,0.7,0.7143,0.7286,0.7429,0.7571,0.7714,0.7857,0.8,0.8143,0.8286,0.8429,0.8571,0.8714,0.8857,0.9,0.9143,0.9286,0.9429,0.9571,0.9714,0.9857,0.9998,0.9999,1];

export const LEAF_IMGS_PLACEHOLDER = null; // actual values set in SharedUI using imported images

// wrapper: aspect + position (from Loading-2/index.tsx)
export const LEAF_WRAPPERS = [
  { cls: "aspect-[50.84708590042737/50.89684417190597]",   pos: "left-[37.15%] right-[49.91%] top-[calc(50%+267.45px)]" },
  { cls: "aspect-[20.792565122364095/21.337221991665558]",  pos: "left-[40.71%] right-[54%] top-[calc(50%+78.67px)]" },
  { cls: "aspect-[35.623879854403185/34.16859347268087]",   pos: "left-[33.84%] right-[57.09%] top-[calc(50%+196.08px)]" },
  { cls: "aspect-[24.519500327664616/25.80869367294065]",   pos: "left-[28.24%] right-[65.52%] top-[calc(50%+54.9px)]" },
  { cls: "aspect-[28.822228198254265/28.419771659138632]",  pos: "left-[16.03%] right-[76.64%] top-[calc(50%+54.21px)]" },
  { cls: "aspect-[53.16375632909046/52.2655807986622]",     pos: "left-[33.84%] right-[52.63%] top-[calc(50%+344.13px)]" },
  { cls: "aspect-[27.396504486458298/27.368127092033887]",  pos: "left-[53.94%] right-[39.08%] top-[calc(50%+85.68px)]" },
  { cls: "aspect-[69.52151197422313/66.86011587384132]",    pos: "left-[48.6%] right-[33.71%] top-[calc(50%+387.43px)]" },
  { cls: "aspect-[36.70640978525353/36.95394711484096]",    pos: "left-[40.46%] right-[50.2%] top-[calc(50%+154.48px)]" },
  { cls: "aspect-[43.94909116194458/43.505730640044476]",   pos: "left-[19.08%] right-[69.73%] top-[calc(50%+235.07px)]" },
] as const;

// inner rotation/size (from Loading-2/index.tsx)
export const LEAF_INNER = [
  "h-[hypot(51.1762cqw,47.4967cqh)]  rotate-[-47.11deg] w-[hypot(48.8238cqw,-52.5033cqh)]",
  "h-[hypot(98.6058cqw,-1.32297cqh)] rotate-[-90.79deg] w-[hypot(-1.39419cqw,-98.677cqh)]",
  "h-[hypot(-31.0452cqw,63.1549cqh)] rotate-[27.14deg]  w-[hypot(68.9548cqw,36.8451cqh)]",
  "h-[hypot(66.9979cqw,27.5432cqh)]  rotate-[-66.6deg]  w-[hypot(33.0021cqw,-72.4568cqh)]",
  "h-[hypot(41.392cqw,52.2146cqh)]   rotate-[-38.8deg]  w-[hypot(58.608cqw,-47.7854cqh)]",
  "h-[hypot(-24.3887cqw,74.3314cqh)] rotate-[18.46deg]  w-[hypot(75.6113cqw,25.6686cqh)]",
  "h-[hypot(47.6293cqw,50.6668cqh)]  rotate-[-43.26deg] w-[hypot(52.3707cqw,-49.3332cqh)]",
  "h-[hypot(31.4353cqw,63.0248cqh)]  rotate-[-27.41deg] w-[hypot(68.5647cqw,-36.9752cqh)]",
  "h-[hypot(-49.6499cqw,44.212cqh)]  rotate-[48.12deg]  w-[hypot(50.3501cqw,55.788cqh)]",
  "h-[hypot(30.3608cqw,68.5037cqh)]  rotate-[-24.12deg] w-[hypot(69.6392cqw,-31.4963cqh)]",
] as const;

export const STATUS_META: Record<string, { color: string; bg: string; text: string }> = {
  "이동중":     { color: "#d46b00", bg: "#fff0d6", text: "🚶 이동중" },
  "집에 있음":  { color: "#2e7d32", bg: "#e8f5e9", text: "🏠 집에 있음" },
  "학교에 있음":{ color: "#1565c0", bg: "#e3f2fd", text: "📚 학교에 있음" },
  "위험":       { color: "#c62828", bg: "#ffeaea", text: "⚠️ 위험" },
};

export const NOTIF_META: Record<WardNotif["type"], { icon: string; color: string; bg: string }> = {
  sos:      { icon: "🚨", color: "#c62828", bg: "#ffeaea" },
  location: { icon: "📍", color: "#d46b00", bg: "#fff0d6" },
  battery:  { icon: "🔋", color: "#b8860b", bg: "#fffde7" },
  curfew:   { icon: "🌙", color: "#5c35b0", bg: "#f3e8ff" },
  arrive:   { icon: "🏠", color: "#2e7d32", bg: "#e8f5e9" },
};

export const INITIAL_POSTS: CommunityPost[] = [
  { id: 1, nickname: "닉네임1", category: "공사", description: "이 구간에 공사 중입니다. 주의하세요.", likes: 3, liked: false, img: "", lat: 37.4985, lng: 127.0275, address: "서울 강남구 역삼동" },
  { id: 2, nickname: "닉네임2", category: "어두움", description: "가로등이 꺼져 있어서 어두워요.", likes: 1, liked: false, img: "", lat: 37.5665, lng: 126.9780, address: "서울 중구 명동" },
  { id: 3, nickname: "닉네임3", category: "공사", description: "인도가 막혀 있습니다.", likes: 5, liked: false, img: "", lat: 37.5133, lng: 127.0998, address: "서울 송파구 잠실동" },
  { id: 4, nickname: "닉네임4", category: "기타", description: "인도가 막혀 있습니다.", likes: 7, liked: false, img: "" },
  { id: 5, nickname: "닉네임5", category: "고장", description: "인도가 막혀 있습니다.", likes: 7, liked: false, img: "" },
];

export const INITIAL_WARDS: Ward[] = [
  {
    id: 1, name: "김민준", status: "이동중", battery: 78,
    address: "서울 강남구 역삼동",
    homeLat: 37.5005, homeLng: 127.0360,
    route: [
      [37.5005,127.0360],[37.5007,127.0356],[37.5009,127.0351],[37.5011,127.0346],
      [37.5013,127.0340],[37.5015,127.0334],[37.5016,127.0328],[37.5017,127.0321],
      [37.5018,127.0314],[37.5018,127.0307],[37.5017,127.0300],[37.5015,127.0294],
      [37.5013,127.0289],[37.5010,127.0284],[37.5007,127.0280],[37.5004,127.0277],
      [37.5001,127.0274],[37.4998,127.0272],[37.4995,127.0271],[37.4993,127.0270],
    ],
    notifications: [
      { id: 1, type: "sos",      message: "SOS 신호가 발생했습니다",      time: "오늘 14:23", read: false },
      { id: 2, type: "location", message: "지정 구역을 벗어났습니다",      time: "오늘 13:45", read: false },
      { id: 3, type: "battery",  message: "배터리가 20% 이하입니다",       time: "오늘 12:10", read: true  },
      { id: 4, type: "curfew",   message: "귀가 예정 시간이 지났습니다",   time: "어제 22:05", read: true  },
    ],
  },
  {
    id: 2, name: "이서연", status: "집에 있음", battery: 45,
    address: "서울 강남구 역삼동 자택",
    homeLat: 37.5025, homeLng: 127.0290,
    route: [
      [37.5025,127.0290],[37.5025,127.0290],[37.5025,127.0290],[37.5025,127.0290],
    ],
    notifications: [
      { id: 5, type: "arrive",   message: "자택에 도착했습니다",           time: "오늘 16:32", read: false },
      { id: 6, type: "battery",  message: "배터리가 45%입니다",            time: "오늘 15:00", read: true  },
    ],
  },
  {
    id: 3, name: "박지호", status: "학교에 있음", battery: 92,
    address: "서울 강남구 역삼초등학교",
    homeLat: 37.5025, homeLng: 127.0290,
    route: [
      [37.5025,127.0290],[37.5027,127.0286],[37.5030,127.0282],[37.5033,127.0279],
      [37.5036,127.0276],[37.5039,127.0274],[37.5042,127.0273],[37.5044,127.0273],
    ],
    notifications: [
      { id: 7, type: "arrive",   message: "학교에 도착했습니다",           time: "오늘 08:55", read: false },
      { id: 8, type: "location", message: "등교 경로를 벗어났습니다",      time: "오늘 08:40", read: true  },
      { id: 9, type: "curfew",   message: "어제 귀가가 늦었습니다",        time: "어제 21:50", read: true  },
    ],
  },
];
