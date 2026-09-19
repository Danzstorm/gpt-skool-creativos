// Luz ambiental: tres manchas de color de marca (ámbar / magenta / índigo)
// muy desenfocadas detrás del contenido. El padre debe ser `relative`. Las
// clases aurora-a/b/c (globals.css) las hacen derivar bajo no-preference.
export default function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-a absolute rounded-full blur-[120px]"
        style={{
          width: "40%",
          aspectRatio: "1",
          top: "-10%",
          left: "-8%",
          background: "#FEC200",
          opacity: 0.1,
          willChange: "transform",
        }}
      />
      <div
        className="aurora-b absolute rounded-full blur-[120px]"
        style={{
          width: "45%",
          aspectRatio: "1",
          top: "20%",
          right: "-12%",
          background: "#F400EB",
          opacity: 0.12,
          willChange: "transform",
        }}
      />
      <div
        className="aurora-c absolute rounded-full blur-[120px]"
        style={{
          width: "50%",
          aspectRatio: "1",
          bottom: "-25%",
          left: "20%",
          background: "#4A44FE",
          opacity: 0.1,
          willChange: "transform",
        }}
      />
    </div>
  );
}
