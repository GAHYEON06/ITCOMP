import imgGeminiGeneratedImageZ9Dq63Z9Dq63Z9Dq1 from "./32d92a87cd7ba01ced4b77d9c2e371791503fb70.png";
import imgImage4 from "./640204bb917a7d1a9d335f4373adb1382fa4d6a6.png";
import img from "./36603cc534ed944df658c1944648282faded2339.png";

function Button() {
  return (
    <div className="bg-[#413c3c] flex-[1_0_0] min-w-px relative rounded-[8px]" data-name="Button">
      <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex items-center justify-center p-[12px] relative size-full">
          <p className="[word-break:break-word] font-['Inter:Regular','Noto_Sans_KR:Regular',sans-serif] font-normal leading-none not-italic relative shrink-0 text-[#f5f5f5] text-[16px] whitespace-nowrap">등록</p>
        </div>
      </div>
      <div aria-hidden className="absolute border border-[#484141] border-solid inset-0 pointer-events-none rounded-[8px]" />
    </div>
  );
}

function ButtonGroup() {
  return (
    <div className="absolute bg-[#f9f1de] content-stretch flex items-center left-[69px] top-[633px] w-[225px]" data-name="Button Group">
      <Button />
    </div>
  );
}

function Frame() {
  return (
    <div className="absolute h-[740px] left-[15px] overflow-x-clip overflow-y-auto top-[94px] w-[363px]">
      <div className="absolute bg-[rgba(255,255,255,0.85)] h-[740px] left-0 rounded-[32px] top-0 w-[363px]" />
      <div className="absolute bg-[#f9f1de] border border-[#e4dabf] border-solid h-[677px] left-[14px] rounded-[32px] top-[32px] w-[335px]" />
      <div className="absolute bg-[#d9d9d9] h-[34px] left-[32px] top-[46px] w-[299px]" />
      <div className="-translate-x-1/2 absolute bg-white h-[139px] left-1/2 top-[108px] w-[305px]" />
      <p className="[word-break:break-word] absolute font-['Inter:Regular','Noto_Sans_KR:Regular',sans-serif] font-normal leading-[normal] left-[86px] not-italic text-[48px] text-black top-[148px] whitespace-nowrap">사진 첨부</p>
      <ButtonGroup />
      <p className="[word-break:break-word] absolute font-['Inter:Regular','Noto_Sans_KR:Regular',sans-serif] font-normal leading-[normal] left-[76px] not-italic text-[16px] text-black top-[287px] whitespace-nowrap">주변 상황 설명 및 상태 쓰는 란</p>
      <p className="[word-break:break-word] absolute font-['Inter:Regular','Noto_Sans_KR:Regular',sans-serif] font-normal leading-[normal] left-[125px] not-italic text-[16px] text-black top-[410px] whitespace-nowrap">정확한 위치 설명</p>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute contents left-[3px] top-[68px]">
      <div className="absolute h-[52px] left-[3px] top-[68px] w-[166px]" data-name="image 4">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgImage4} />
      </div>
      <p className="-translate-x-1/2 [word-break:break-word] absolute font-['Jua:Regular',sans-serif] leading-[normal] left-[86px] not-italic text-[24px] text-black text-center top-[83px] tracking-[1.2px] whitespace-nowrap">ZIP_COM</p>
    </div>
  );
}

export default function Community() {
  return (
    <div className="bg-white relative size-full" data-name="community-게시물 작성">
      <div className="absolute h-[931px] left-[-18px] opacity-40 top-0 w-[429px]" data-name="Gemini_Generated_Image_z9dq63z9dq63z9dq 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgGeminiGeneratedImageZ9Dq63Z9Dq63Z9Dq1} />
      </div>
      <div className="absolute bg-[#d9d9d9] h-[14px] left-0 top-[22px] w-[393px]" />
      <Frame />
      <Group />
      <div className="absolute flex inset-[4.34%_45.13%_86.66%_35.62%] items-center justify-center" style={{ containerType: "size" }}>
        <div className="flex-none h-[hypot(30.7025cqw,70.6749cqh)] rotate-[-23.21deg] w-[hypot(69.2975cqw,-29.3251cqh)]">
          <div className="relative size-full" data-name="개체">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-full left-[-0.39%] max-w-none top-0 w-[100.78%]" src={img} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}