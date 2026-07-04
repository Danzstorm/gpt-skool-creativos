import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon generado por código: mismo mark que el logo del header (spark en
// tile violeta), pero como vector nítido en vez de un emoji renderizado.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          borderRadius: 7,
        }}
      >
        <svg width="19" height="19" viewBox="0 0 100 100">
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
