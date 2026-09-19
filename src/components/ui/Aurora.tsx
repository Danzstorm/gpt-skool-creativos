// Luz ambiental mínima: un soplo de rojo de marca, no un muro magenta.
// Solo en login/unauthorized — el chat es una herramienta y va sobre negro.
export default function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-a absolute rounded-full blur-[140px]"
        style={{
          width: "32%",
          aspectRatio: "1",
          top: "-16%",
          left: "-8%",
          background: "#FF003C",
          opacity: 0.035,
          willChange: "transform",
        }}
      />
    </div>
  );
}
