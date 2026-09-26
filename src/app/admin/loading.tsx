// Se muestra al instante al entrar al admin mientras el servidor arma la página.
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[40vh] place-items-center text-[13px] text-[#74747f]">
      Cargando…
    </div>
  );
}
