import { ImageResponse } from "next/og";
import { getAppSettings } from "@/lib/app-settings";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const settings = await getAppSettings();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            top: -260,
            left: 250,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0) 70%)",
          }}
        />
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            marginBottom: 36,
          }}
        >
          <svg width="66" height="66" viewBox="0 0 100 100">
            <path
              d="M50,0 L64.14,35.86 L100,50 L64.14,64.14 L50,100 L35.86,64.14 L0,50 L35.86,35.86 Z"
              fill="white"
            />
          </svg>
        </div>
        <div style={{ fontSize: 62, fontWeight: 700, color: "#f4f4f5", letterSpacing: "-0.02em" }}>
          {`GPT ${settings.community_name}`}
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa", marginTop: 14 }}>
          Los GPTs de la comunidad, en un solo lugar
        </div>
      </div>
    ),
    { ...size }
  );
}
