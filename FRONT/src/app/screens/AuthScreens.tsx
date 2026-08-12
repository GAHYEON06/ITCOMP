import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { imgCharacterB64 as imgCharacter } from "../inlineImages";
import imgLeafA from "@/imports/Loading-2/fda34ed29b3ac5cdd4b6375a53a7e7b55606ca8c.png";
import imgLeafB from "@/imports/Loading-2/83795503889567fd120b8de6de15d223ff4a1a82.png";
import imgLeafC from "@/imports/Loading-2/3c3b1eeeb1fa6d3ea8fb45c3e1e3e8e98b4943f1.png";
import imgLeafD from "@/imports/Loading-2/f6dd02823fd49ecff1217815f177361651219301.png";
import imgLoadingCharacter from "@/imports/Loading-2/bc1360748006a9302efb741af52d877071e65e53.png";
import imgLoadingBg from "@/imports/Loading-2/94e4a2fedbf363b021d26cae1904ddf02ea01500.png";
import { jua, LEAF_ANIM, LEAF_WRAPPERS, LEAF_INNER, TEXT_OPACITY, TEXT_TIMES } from "../shared/constants";
import { Role } from "../shared/types";
import { BackButton, EyeIcon, Field, Leaf, SubmitButton } from "../shared/SharedUI";

const LEAF_IMGS = [imgLeafA, imgLeafA, imgLeafB, imgLeafB, imgLeafB, imgLeafC, imgLeafC, imgLeafD, imgLeafD, imgLeafA];

export function RoleSelectScreen({ onNext, onLogin }: { onNext: (role: Role) => void; onLogin?: () => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const glow = (role: Role) => ({
    background: "rgba(255,116,160,0.7)",
    boxShadow: selected === role ? "0 0 14px 6px rgba(255,116,160,0.85),0 0 30px 10px rgba(255,80,130,0.4)" : "none",
    filter: selected === role ? "brightness(1.18)" : "brightness(1)",
    transform: selected === role ? "scale(1.04)" : "scale(1)",
  });
  return (
    <>
      <div className="absolute h-[115px] left-[17px] top-[326px] w-[365px] pointer-events-none" style={{ backgroundImage: `url(${imgCharacter})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={jua} className="-translate-x-1/2 absolute leading-[0] left-[196px] not-italic text-[#6e3c09] text-[20px] text-center top-[364px] tracking-[1px] w-[290px]">
        <p className="leading-[normal] mb-0">ZIP_RO에 오신 것을 환영합니다!</p>
        <p className="leading-[normal]">아래 보기를 고르고 제출해주세요</p>
      </div>
      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[275px] left-[46px] rounded-[30px] top-[466px] w-[301px]" />
      <p style={jua} className="absolute leading-[normal] left-[121px] not-italic text-[#f37272] text-[20px] top-[496px] tracking-[1px]">당신은 누구인가요?</p>
      <button onClick={() => setSelected("피보호자")} className="absolute h-[34px] left-[99px] overflow-clip rounded-[4px] top-[545px] w-[195px] flex items-center justify-center p-[12px] transition-all duration-100" style={glow("피보호자")}>
        <span style={jua} className="leading-[normal] shrink-0 text-[#f3f3f3] text-[16px] tracking-[0.8px] whitespace-nowrap">피보호자</span>
      </button>
      <button onClick={() => setSelected("보호자")} className="absolute h-[34px] left-[99px] overflow-clip rounded-[4px] top-[605px] w-[195px] flex items-center justify-center p-[12px] transition-all duration-100" style={glow("보호자")}>
        <span style={jua} className="leading-[normal] shrink-0 text-[#f3f3f3] text-[16px] tracking-[0.8px] whitespace-nowrap">보호자</span>
      </button>
      <div className="absolute left-[84px] top-[665px] w-[225px] flex flex-col gap-[10px]">
        <button onClick={() => selected && onNext(selected)} disabled={!selected} className="w-full relative rounded-[8px] transition-all duration-150"
          style={{ background: selected ? "#413c3c" : "#7a7676", cursor: selected ? "pointer" : "not-allowed" }}>
          <div className="flex items-center justify-center p-[12px]">
            <p className="font-normal leading-none shrink-0 text-[#f5f5f5] text-[16px] whitespace-nowrap">제출</p>
          </div>
          <div aria-hidden className="absolute border border-[#484141] border-solid inset-0 pointer-events-none rounded-[8px]" />
        </button>
        <div className="flex justify-end">
          <button onClick={onLogin} className="transition-opacity active:opacity-60" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <p style={jua} className="leading-none text-[#6e3c09] text-[16px] whitespace-nowrap tracking-[0.8px]">로그인하기</p>
          </button>
        </div>
      </div>
    </>
  );
}

export function PibohojaScreen({ onNext, onBack, onLogin }: { onNext: (data: { name: string; email: string; phone: string }) => void; onBack: () => void; onLogin: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const ok = name.trim() && email.trim() && phone.trim();
  return (
    <>
      <BackButton onPress={onBack} />
      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[425px] left-[46px] rounded-[30px] top-[310px] w-[301px]" />
      <Field label="이름" value={name} onChange={setName} bgColor="#b25e09" labelTop={345} inputTop={374} leftOffset={62}
        onNext={() => emailRef.current?.focus()} />
      <Field label="메일" value={email} onChange={setEmail} type="email" bgColor="#b97837" labelTop={441} inputTop={470} leftOffset={60}
        fieldRef={emailRef} onNext={() => phoneRef.current?.focus()} />
      <Field label="휴대폰" value={phone} onChange={setPhone} type="tel" bgColor="#ac835b" labelTop={542} inputTop={571} leftOffset={60}
        fieldRef={phoneRef} onNext={() => ok && onNext({ name, email, phone })} isLast />
      <SubmitButton onPress={() => onNext({ name, email, phone })} enabled={!!ok} top={674} />
      <button
        type="button"
        onClick={onLogin}
        className="absolute left-[236px] top-[635px] w-[96px] text-right active:opacity-60"
        style={{ ...jua, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <span className="text-[#989791] text-[15px] leading-[1.4]">로그인하기</span>
      </button>
    </>
  );
}

export function BohojaScreen({ onNext, onBack, onLogin }: { onNext: (data: { name: string; email: string; phone: string; wardCode: string }) => void; onBack: () => void; onLogin: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); const [code, setCode] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef  = useRef<HTMLInputElement>(null);
  const ok = name.trim() && email.trim() && phone.trim() && code.trim();
  return (
    <>
      <BackButton onPress={onBack} />
      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[515px] left-[46px] rounded-[30px] top-[310px] w-[301px]" />
      <Field label="이름" value={name} onChange={setName} bgColor="#b25e09" labelTop={345} inputTop={374} leftOffset={62}
        onNext={() => emailRef.current?.focus()} />
      <Field label="메일" value={email} onChange={setEmail} type="email" bgColor="#b97837" labelTop={441} inputTop={470} leftOffset={60}
        fieldRef={emailRef} onNext={() => phoneRef.current?.focus()} />
      <Field label="휴대폰" value={phone} onChange={setPhone} type="tel" bgColor="#ac835b" labelTop={542} inputTop={571} leftOffset={60}
        fieldRef={phoneRef} onNext={() => codeRef.current?.focus()} />
      <Field label="코드 입력" value={code} onChange={setCode} bgColor="#a75635" labelTop={639} inputTop={668} leftOffset={60}
        fieldRef={codeRef} onNext={() => ok && onNext({ name, email, phone, wardCode: code })} isLast />
      <SubmitButton onPress={() => onNext({ name, email, phone, wardCode: code })} enabled={!!ok} top={752} />
      <button
        type="button"
        onClick={onLogin}
        className="absolute left-[236px] top-[732px] w-[96px] text-right active:opacity-60"
        style={{ ...jua, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <span className="text-[#989791] text-[15px] leading-[1.4]">로그인하기</span>
      </button>
    </>
  );
}

export function IdSetupScreen({ onSignup }: {
  onSignup: (username: string, password: string) => Promise<void>;
}) {
  const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pwRef = useRef<HTMLInputElement>(null);
  const ok = id.trim() && pw.trim() && !loading;

  async function handleSubmit() {
    if (!ok) return;
    setError("");
    setLoading(true);
    try {
      await onSignup(id.trim(), pw.trim());
    } catch (e) {
      setError((e as Error).message ?? "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="absolute h-[115px] left-[17px] top-[307px] w-[365px] pointer-events-none" style={{ backgroundImage: `url(${imgCharacter})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={jua} className="-translate-x-1/2 absolute leading-[0] left-[196px] not-italic text-[#6e3c09] text-[20px] text-center top-[345px] tracking-[1px] w-[290px]">
        <p className="leading-[normal] mb-0">사용할 아이디와 비밀번호를</p>
        <p className="leading-[normal]">설정해주세요.</p>
      </div>
      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[322px] left-[46px] rounded-[30px] top-[466px] w-[301px]" />
      <Field label="아이디" value={id} onChange={setId} bgColor="#37acb9" labelTop={491} inputTop={517} leftOffset={60}
        onNext={() => pwRef.current?.focus()} />
      <Field label="비밀번호" value={pw} onChange={setPw} type="password" bgColor="#58a2aa" labelTop={584} inputTop={611} leftOffset={60}
        fieldRef={pwRef} onNext={handleSubmit} isLast />
      {error && (
        <p className="absolute left-[60px] text-[#c0392b] text-[13px]" style={{ top: 700, ...jua }}>{error}</p>
      )}
      <SubmitButton onPress={handleSubmit} enabled={!!ok} top={721} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(255,243,197,0.7)", zIndex: 50 }}>
          <div className="w-8 h-8 rounded-full border-4 border-[#b25e09]/30 border-t-[#b25e09] animate-spin" />
        </div>
      )}
    </>
  );
}

export function LoginScreen({ onNext }: { onNext: (username: string, password: string, autoLogin?: boolean) => Promise<void> }) {
  const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false); const [autoLogin, setAutoLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ok = id.trim() && pw.trim() && !loading;
  const idRef = useRef<HTMLInputElement>(null); const pwRef = useRef<HTMLInputElement>(null);

  async function handleLogin() {
    if (!ok) return;
    setError("");
    setLoading(true);
    try { await onNext(id.trim(), pw.trim(), autoLogin); }
    catch (e) { setError((e as Error).message ?? "로그인에 실패했습니다."); }
    finally { setLoading(false); }
  }
  return (
    <>
      <div className="absolute h-[115px] left-[17px] top-[307px] w-[365px] pointer-events-none" style={{ backgroundImage: `url(${imgCharacter})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={jua} className="-translate-x-1/2 absolute leading-[0] left-[196px] not-italic text-[#6e3c09] text-[20px] text-center top-[345px] tracking-[1px] w-[290px]">
        <p className="leading-[normal] mb-0">회원가입이 완료되었습니다. </p>
        <p className="leading-[normal]">로그인을 진행해주십시오.</p>
      </div>
      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[322px] left-[46px] rounded-[30px] top-[466px] w-[301px]" />
      <p className="absolute font-normal leading-[1.4] left-[60px] text-[#1e1e1e] text-[16px] top-[491px] w-[272px]">아이디</p>
      <div className="absolute left-[60px] top-[517px] w-[272px] rounded-[8px] cursor-text" style={{ background: "#90de9e", border: "1px solid #d9d9d9" }} onClick={() => idRef.current?.focus()}>
        <div className="flex items-center overflow-clip px-[16px] py-[12px] rounded-[inherit] size-full">
          <input ref={idRef} type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="입력" className="flex-[1_0_0] min-w-px bg-transparent leading-none outline-none text-[16px] placeholder:text-[#b3b3b3]" style={{ color: "white", caretColor: "white", fontFamily: "Inter, sans-serif", fontSize: "16px" }} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pwRef.current?.focus(); } }} />
        </div>
        <div aria-hidden className="absolute border border-[#d9d9d9] border-solid inset-[-0.5px] pointer-events-none rounded-[8.5px]" />
      </div>
      <p className="absolute font-normal leading-[1.4] left-[60px] text-[#1e1e1e] text-[16px] top-[584px] w-[272px]">비밀번호</p>
      <div className="absolute left-[60px] top-[611px] w-[272px] rounded-[8px] cursor-text" style={{ background: "#459e56", border: "1px solid #d9d9d9" }} onClick={() => pwRef.current?.focus()}>
        <div className="flex items-center overflow-clip px-[16px] py-[12px] rounded-[inherit] size-full gap-2">
          <input ref={pwRef} type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="입력" className="flex-[1_0_0] min-w-px bg-transparent leading-none outline-none text-[16px] placeholder:text-[#b3b3b3]" style={{ color: "white", caretColor: "white", fontFamily: "Inter, sans-serif", fontSize: "16px" }} autoComplete="current-password" enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleLogin(); } }} />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowPw(p => !p); }} className="shrink-0 flex items-center justify-center opacity-80 hover:opacity-100"><EyeIcon open={showPw} /></button>
        </div>
        <div aria-hidden className="absolute border border-[#d9d9d9] border-solid inset-[-0.5px] pointer-events-none rounded-[8.5px]" />
      </div>
      <div className="absolute left-[60px] top-[674px] flex items-center gap-2">
        <button onClick={() => setAutoLogin(!autoLogin)} className="w-5 h-5 rounded-[4px] border border-[#707071] flex items-center justify-center transition-colors shrink-0" style={{ background: autoLogin ? "#707071" : "transparent" }}>
          {autoLogin && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#2F2F32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <span style={jua} className="text-[#989791] text-[15px] leading-[1.4]">자동 로그인</span>
      </div>
      {error && <p className="absolute left-[60px] text-[#c0392b] text-[13px]" style={{ top: 700, ...jua }}>{error}</p>}
      <div className="absolute left-[84px] top-[721px] w-[225px]">
        <button onClick={handleLogin} disabled={!ok} className="w-full relative rounded-[8px] transition-all duration-150" style={{ background: ok ? "#413c3c" : "#7a7676", cursor: ok ? "pointer" : "not-allowed" }}>
          <div className="flex items-center justify-center p-[12px]">
            <p className="font-normal leading-none shrink-0 text-[#f5f5f5] text-[16px] whitespace-nowrap">{loading ? "로그인 중..." : "로그인"}</p>
          </div>
          <div aria-hidden className="absolute border border-[#484141] border-solid inset-0 pointer-events-none rounded-[8px]" />
        </button>
      </div>
    </>
  );
}

export function GeneralLoginScreen({ onLogin, onSignup }: { onLogin: (username: string, password: string, autoLogin?: boolean) => Promise<void>; onSignup?: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ok = id.trim() && pw.trim() && !loading;
  const idRef  = useRef<HTMLInputElement>(null);
  const pwRef  = useRef<HTMLInputElement>(null);

  async function handleLogin() {
    if (!ok) return;
    setError("");
    setLoading(true);
    try { await onLogin(id.trim(), pw.trim(), autoLogin); }
    catch (e) { setError((e as Error).message ?? "로그인에 실패했습니다."); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div className="absolute h-[115px] left-[17px] top-[307px] w-[365px] pointer-events-none" style={{ backgroundImage: `url(${imgCharacter})`, backgroundSize: "cover", backgroundPosition: "center" }} />

      <div style={jua} className="-translate-x-1/2 absolute leading-[0] left-[196px] not-italic text-[#6e3c09] text-[20px] text-center top-[345px] tracking-[1px] w-[290px]">
        <p className="leading-[normal] mb-0">안녕하세요.</p>
        <p className="leading-[normal]">로그인을 진행해주세요.</p>
      </div>

      <div className="absolute bg-[#fff3c5] border border-[#b3b3b3] border-solid h-[322px] left-[49px] rounded-[30px] top-[466px] w-[301px]" />

      <p className="absolute font-normal leading-[1.4] left-[73px] text-[#1e1e1e] text-[16px] top-[491px]">아이디</p>

      <div className="absolute left-[66px] top-[517px] w-[272px] rounded-[8px] cursor-text"
        style={{ background: "#90de9e", border: "1px solid #d9d9d9" }}
        onClick={() => idRef.current?.focus()}>
        <div className="flex items-center overflow-clip px-[16px] py-[12px] rounded-[inherit] size-full">
          <input ref={idRef} type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="입력"
            className="flex-[1_0_0] min-w-px bg-transparent leading-none outline-none text-[16px] placeholder:text-[#b3b3b3] w-full"
            style={{ color: "white", caretColor: "white", fontFamily: "Inter, sans-serif", fontSize: "16px" }}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            enterKeyHint="next" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pwRef.current?.focus(); } }} />
        </div>
        <div aria-hidden className="absolute border border-[#d9d9d9] border-solid inset-[-0.5px] pointer-events-none rounded-[8.5px]" />
      </div>

      <div className="absolute flex flex-col gap-[8px] items-start left-[73px] top-[584px] w-[272px]">
        <p className="font-normal leading-[1.4] text-[#1e1e1e] text-[16px]">비밀번호</p>
      </div>

      <div className="absolute left-[66px] top-[613px] w-[272px] rounded-[8px] cursor-text"
        style={{ background: "#459e56", border: "1px solid #d9d9d9" }}
        onClick={() => pwRef.current?.focus()}>
        <div className="flex items-center overflow-clip px-[16px] py-[12px] rounded-[inherit] size-full gap-2">
          <input ref={pwRef} type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="입력"
            className="flex-[1_0_0] min-w-px bg-transparent leading-none outline-none text-[16px] placeholder:text-[#b3b3b3]"
            style={{ color: "white", caretColor: "white", fontFamily: "Inter, sans-serif", fontSize: "16px" }}
            autoComplete="current-password"
            enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleLogin(); } }} />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowPw(p => !p); }}
            className="shrink-0 flex items-center justify-center opacity-80 hover:opacity-100">
            <EyeIcon open={showPw} />
          </button>
        </div>
        <div aria-hidden className="absolute border border-[#d9d9d9] border-solid inset-[-0.5px] pointer-events-none rounded-[8.5px]" />
      </div>

      <div className="absolute left-[73px] top-[677px] w-[255px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoLogin(!autoLogin)}
            className="w-5 h-5 rounded-[4px] border border-[#707071] flex items-center justify-center transition-colors shrink-0"
            style={{ background: autoLogin ? "#707071" : "transparent" }}>
            {autoLogin && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#2F2F32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <span style={jua} className="text-[#989791] text-[15px] leading-[1.4]">자동 로그인</span>
        </div>
        {onSignup && (
          <button onClick={onSignup} style={jua} className="text-[#989791] text-[15px] leading-[1.4]">
            회원가입하기
          </button>
        )}
      </div>

      {error && <p className="absolute left-[73px] text-[#c0392b] text-[13px]" style={{ top: 700, ...jua }}>{error}</p>}

      <div className="absolute left-[87px] top-[724px] w-[225px]">
        <button onClick={handleLogin} disabled={!ok}
          className="w-full relative rounded-[8px] transition-all duration-150"
          style={{ background: ok ? "#413c3c" : "#7a7676", cursor: ok ? "pointer" : "not-allowed" }}>
          <div className="flex items-center justify-center p-[12px]">
            <p className="font-normal leading-none shrink-0 text-[#f5f5f5] text-[16px] whitespace-nowrap">{loading ? "로그인 중..." : "로그인"}</p>
          </div>
          <div aria-hidden className="absolute border border-[#484141] border-solid inset-0 pointer-events-none rounded-[8px]" />
        </button>
      </div>
    </>
  );
}

export function LoadingScreen({ onDone, duration = 5000 }: { onDone: () => void; duration?: number }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), duration);
    return () => clearTimeout(t);
  }, [duration]);

  return (
    <div className="bg-white relative size-full">
      <div className="absolute h-[968px] left-[-62px] top-[-43px] w-[495px]">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgLoadingBg} />
      </div>

      {LEAF_WRAPPERS.map((w, i) => (
        <div key={i} className={`-translate-y-1/2 absolute flex items-center justify-center ${w.cls} ${w.pos}`} style={{ containerType: "size" }}>
          <div className={`flex-none ${LEAF_INNER[i]}`}>
            <Leaf anim={LEAF_ANIM[i]}>
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <img alt="" className="absolute left-0 max-w-none size-full top-0" src={LEAF_IMGS[i]} />
              </div>
            </Leaf>
          </div>
        </div>
      ))}

      <div className="absolute h-[115px] left-[8px] top-[177px] w-[365px]">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgLoadingCharacter} />
      </div>

      <motion.div
        className="[word-break:break-word] absolute font-['Jua:Regular',sans-serif] leading-[0] not-italic text-[#7e4c34] text-[29px] text-center top-[207px] tracking-[1.45px] w-[281px]"
        style={{ left: "calc(50% - 6px)", transform: "translateX(-50%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: TEXT_OPACITY }}
        transition={{ opacity: { duration: 7, times: TEXT_TIMES, ease: "linear", repeat: Infinity } }}
      >
        <p className="leading-[normal] mb-0">안전한 집을 향해 ...</p>
        <p className="leading-[normal]">조금만 기다려주세요</p>
      </motion.div>
    </div>
  );
}