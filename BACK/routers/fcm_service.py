import os
import json
import firebase_admin
from firebase_admin import credentials, messaging

if not firebase_admin._apps:
    firebase_cred_raw = os.getenv("FIREBASE_CREDENTIALS")
    
    if firebase_cred_raw:
        try:
            cleaned_cred = firebase_cred_raw.strip().strip("'").strip('"')
            cred_dict = json.loads(cleaned_cred, strict=False)
            
            if isinstance(cred_dict.get("private_key"), str):
                cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")

            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            print("🟢 [Vercel] Firebase Admin SDK Initialized Successfully!")
        except Exception as e:
            print(f"🔴 [Vercel] Firebase initialization failed: {e}")
    else:
        local_key_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "serviceAccountKey.json")
        if os.path.exists(local_key_path):
            cred = credentials.Certificate(local_key_path)
            firebase_admin.initialize_app(cred)
            print("🟢 [Local] Firebase Admin SDK Initialized Successfully!")
        else:
            print("⚠️ FIREBASE_CREDENTIALS 환경 변수 또는 serviceAccountKey.json 파일을 찾을 수 없습니다.")

def send_fcm_notification(target_token: str, title: str, body: str, data_payload: dict = None) -> bool:
    if not firebase_admin._apps:
        print("⚠️ Firebase가 초기화되지 않아 FCM을 보낼 수 없습니다.")
        return False
    if not target_token:
        return False
    try:
        formatted_data = {k: str(v) for k, v in (data_payload or {}).items()}
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=formatted_data,
            token=target_token,
        )
        response = messaging.send(message)
        print(f"🚀 FCM 전송 성공: {response}")
        return True
    except Exception as e:
        print(f"🔴 FCM 전송 실패: {e}")
        return False