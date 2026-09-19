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
          background: "#050506",
          position: "relative",
        }}
      >
        {/* Luz ambiental: violeta al centro y un ámbar suave arriba-izquierda.
            Satori no soporta conic-gradient ni backdrop-filter: solo lineal/radial. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "radial-gradient(circle at 50% 40%, rgba(169,30,255,.35), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "radial-gradient(circle at 15% 10%, rgba(254,194,0,.18), transparent 45%)",
          }}
        />
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #FEC200, #F400EB 55%, #4A44FE)",
            boxShadow: "0 0 80px rgba(244,0,235,.45)",
            marginBottom: 36,
          }}
        />
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
