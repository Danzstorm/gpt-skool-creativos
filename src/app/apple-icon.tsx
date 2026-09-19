import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #FEC200 0%, #FF6D1A 16%, #FF003C 32%, #F80092 50%, #F400EB 64%, #A91EFF 82%, #4A44FE 100%)",
        }}
      >
        <svg width="104" height="104" viewBox="0 0 100 100">
          <path
            d="M50,0 L64.14,35.86 L100,50 L64.14,64.14 L50,100 L35.86,64.14 L0,50 L35.86,35.86 Z"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
