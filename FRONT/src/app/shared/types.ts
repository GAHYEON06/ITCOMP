export type Role   = "피보호자" | "보호자";
export type Screen = "role-select" | "pibohoja" | "bohoja" | "id-setup" | "login" | "loading" | "main" | "general-login" | "개인정보" | "설정" | "모니터링" | "커뮤니티" | "보안화면" | "즐겨찾는장소";
export type EmergencyState = null | "countdown" | "submitted" | "sos-ringing";

export type { Place as NavPlace, SafeRoute } from "../components/NavigationFlow";

export interface Guardian {
  id: number;
  name: string;
  msgOnEmergency: boolean;
  monitoringAlert: boolean;
}

export interface WardNotif {
  id: number;
  type: "sos" | "location" | "battery" | "curfew" | "arrive";
  message: string;
  time: string;
  read: boolean;
}

export interface Ward {
  id: number; name: string; status: string; battery: number; address: string;
  homeLat: number; homeLng: number;
  route: [number, number][];
  notifications: WardNotif[];
  wardCode?: string;
  userId?: string;
  phone?: string;
  monitoringAllowed?: boolean;
  currentLat?: number;
  currentLng?: number;
}

export const COMMUNITY_CATEGORIES = ["전체", "공사", "어두움", "고장", "기타", "검색"] as const;
export type CommunityCategory = typeof COMMUNITY_CATEGORIES[number];

export type CommunityPost = {
  id: number;
  nickname: string;
  category: CommunityCategory;
  description: string;
  likes: number;
  liked: boolean;
  img: string;
  lat?: number;
  lng?: number;
  address?: string;
  done?: number;
  doneByMe?: boolean;
};