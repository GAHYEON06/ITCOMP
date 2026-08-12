// firebase.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyA454lCTmAS13Ga0VBenB8uJ2UQtj7OxTU",
  authDomain: "zip-r0.firebaseapp.com",
  projectId: "zip-r0",
  storageBucket: "zip-r0.firebasestorage.app",
  messagingSenderId: "562424953151",
  appId: "1:562424953151:web:53063228611e9834e3fb8a"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// 토큰 발급 및 서버 전송 함수
export async function requestForToken(token) {
  try {
    const currentToken = await getToken(messaging, {
      vapidKey: "BIoKliomXmqxY8VBbDyMN_Pwdq4j4G7ZsXlEQPK-WjFokAF8f88JdGKrD8aXQeTu1D7x8Gk68j32yIdkMsX_2kI" // 웹 푸시 인증서 키
    });
    
    if (currentToken) {
      console.log("FCM 토큰 발급 성공:", currentToken);
      
      // 백엔드로 FCM 토큰 전송 (백엔드의 POST /fcm/register 또는 /api/v1/fcm/register 호출)
      await fetch("https://zip-r0.vercel.app/fcm/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // 사용자의 로그인 토큰
        },
        body: JSON.stringify({ fcm_token: currentToken })
      });
    } else {
      console.log("알림 권한이 거부되었거나 토큰을 가져올 수 없습니다.");
    }
  } catch (error) {
    console.log("토큰 발급 중 에러 발생:", error);
  }
}

// 포그라운드(앱이 켜져 있을 때) 메시지 수신 리스너
export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });