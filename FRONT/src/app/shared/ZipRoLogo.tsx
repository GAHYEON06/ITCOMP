import React from "react";
import { jua, LOGO_ASPECT, LOGO_LETTERS } from "./constants";

export function ZipRoLogo({ imgSrc, width }: { imgSrc: string; width: number }) {
  const height = width * LOGO_ASPECT;
  const scale  = width / 378.667;
  return (
    <div style={{ position: "relative", width, height, flexShrink: 0, backgroundImage: `url(${imgSrc})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      {LOGO_LETTERS.map(({ t, cx, cy, fs, c, r }) => (
        <div key={t} style={{
          position: "absolute",
          left: `${cx}%`, top: `${cy}%`,
          transform: "translate(-50%, -50%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ transform: `rotate(${r}deg)` }}>
            <p style={{ ...jua, fontSize: fs * scale, color: c, lineHeight: "normal", margin: 0 }}>{t}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
