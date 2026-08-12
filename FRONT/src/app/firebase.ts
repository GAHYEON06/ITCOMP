import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyA454lCTmAS13Ga0VBenB8uJ2UQtj7OxTU",
  authDomain: "zip-r0.firebaseapp.com",
  projectId: "zip-r0",
  storageBucket: "zip-r0.firebasestorage.app",
  messagingSenderId: "562424953151",
  appId: "1:562424953151:web:53063228611e9834e3fb8a",
  measurementId: "G-LKKDQV45V7",
};

const VAPID_KEY =
  "BIoKliomXmqxY8VBbDyMN_Pwdq4j4G7ZsXlEQPK-WjFokAF8f88JdGKrD8aXQeTu1D7x8Gk68j32yIdkMsX_2kI";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let _messaging: Messaging | null = null;

function getMsg(): Messaging | null {
  if (_messaging) return _messaging;
  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch {
    return null;
  }
}

/** 알림 권한 요청 → FCM 토큰 반환 (실패 시 null) */
export async function requestFcmToken(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const messaging = getMsg();
    if (!messaging) return null;

    // 서비스 워커 등록
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    return token ?? null;
  } catch {
    return null;
  }
}

export type FcmPayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

/** 포그라운드 메시지 수신 핸들러 등록 */
export function onForegroundMessage(handler: (payload: FcmPayload) => void): () => void {
  const messaging = getMsg();
  if (!messaging) return () => {};
  return onMessage(messaging, handler as Parameters<typeof onMessage>[1]);
}
