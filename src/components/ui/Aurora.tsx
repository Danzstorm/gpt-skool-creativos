// Luz ambiental de marca: dos manchas rojo/rosa, muy desenfocadas.
// Solo en login/unauthorized — el chat es una herramienta y va sobre negro.
export default function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-a absolute rounded-full blur-[140px]"
        style={{
          width: "42%",
          aspectRatio: "1",
          top: "-12%",
          left: "-10%",
          background: "#FF003C",
          opacity: 0.08,
          willChange: "transform",
        }}
      />
      <div
        className="aurora-b absolute rounded-full blur-[140px]"
        style={{
          width: "38%",
          aspectRatio: "1",
          top: "28%",
          right: "-14%",
          background: "#F80092",
          opacity: 0.06,
          willChange: "transform",
        }}
      />
    </div>
  );
}
