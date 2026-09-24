import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useDismissable } from "@/hooks/useDismissable";
import { cn, humanDisplayName } from "@/lib/utils";
import {
  TEXT_SIZE_DEFAULT,
  TEXT_SIZE_KEY,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  applyTextSize,
  clampTextSize,
  parseTextSize,
} from "@/lib/text-size";
import { positionAccountMenuBox, stopAmbientMusic } from "@/lib/ambient-music";
import MusicMenu, { accountIconClass, accountRowClass } from "./MusicMenu";

interface Props {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SidebarFooter({ fullName, email, avatarUrl, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [textSize, setTextSize] = useState(TEXT_SIZE_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useDismissable<HTMLDialogElement>(settingsOpen, () => setSettingsOpen(false));

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- portal solo tras hidratar */
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (profileRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const profile = profileRef.current;
    if (!open || !menu || !profile) return;
    const box = positionAccountMenuBox(profile.getBoundingClientRect(), menu.offsetHeight);
    menu.style.width = `${box.width}px`;
    menu.style.left = `${box.left}px`;
    menu.style.top = `${box.top}px`;
  }, [open]);

  useEffect(() => {
    const saved = parseTextSize(localStorage.getItem(TEXT_SIZE_KEY));
    if (saved != null) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- persistencia post-hidratación */
      setTextSize(saved);
      applyTextSize(saved);
    }
  }, []);

  useEffect(() => {
    const dialog = settingsRef.current;
    if (!dialog) return;
    if (settingsOpen && !dialog.open) dialog.showModal();
    if (!settingsOpen && dialog.open) dialog.close();
  }, [settingsOpen, settingsRef]);

  function changeTextSize(value: number) {
    const size = clampTextSize(value);
    setTextSize(size);
    applyTextSize(size);
    localStorage.setItem(TEXT_SIZE_KEY, String(size));
  }

  const personName = humanDisplayName(fullName);
  const displayName = personName || email || "Cuenta";
  // Foto de Google: avatarUrl viene de la sesión (user_metadata), no inventar otra fuente.
  const showAvatar = !!avatarUrl && !avatarFailed;

  const settingsDialog = (
    <dialog
      ref={settingsRef}
      className="settings-dialog fixed inset-0 m-auto h-fit max-h-[85dvh] w-[min(420px,90vw)] overflow-auto rounded-[18px] border border-[#ffffff20] bg-[#141416] p-[26px] text-[#eee] backdrop:bg-[#0008]"
      onClose={() => setSettingsOpen(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      {/* `!mb-5`: legacy h2{margin:0}. */}
      <h2 className="!mb-5">Configuración</h2>
      <div>
        <label className="my-[18px] flex items-center justify-between gap-2.5 text-[13px]">
          <span>Tamaño de letra</span>
          <output id="textSizeValue" className="text-[#aaa] tabular-nums">
            {textSize}%
          </output>
        </label>
        <input
          className="w-full accent-[#b6b6bd]"
          id="textSize"
          type="range"
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={TEXT_SIZE_STEP}
          value={textSize}
          onChange={(e) => changeTextSize(Number(e.target.value))}
          aria-label="Tamaño de letra"
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-[#777780]">
          <span>Más pequeña</span>
          <span>Más grande</span>
        </div>
        <button
          id="resetTextSize"
          type="button"
          onClick={() => changeTextSize(TEXT_SIZE_DEFAULT)}
          className="mt-5 w-full rounded-lg border border-[#ffffff20] px-2.5 py-2 !text-[11px] !text-[#aaa]"
        >
          Restablecer
        </button>
      </div>
    </dialog>
  );

  return (
    // Pie anclado abajo (Martin .profile { margin-top: auto }). Solo el botón
    // de cuenta vive en el flujo: menú y settings van a body para no partir
    // el flex avatar+nombre.
    <div ref={rootRef} className="chat-sidebar-footer relative z-[1] mt-auto w-full shrink-0">
      {open &&
        createPortal(
          // Ancho y posición: positionAccountMenuBox. overflow visible: el
          // submenú de música cuelga a la derecha.
          <div
            ref={menuRef}
            className="account-menu fixed z-[80] rounded-[14px] border border-[#ffffff16] bg-[#111113] p-2 [box-shadow:0_16px_50px_#0006]"
          >
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={cn(accountRowClass, "min-h-11 p-3 text-[13px] no-underline")}
              >
                <svg viewBox="0 0 24 24" aria-hidden className={cn(accountIconClass, "!stroke-[1.4]")}>
                  <path d="M12 3 4.5 6.5v4.2c0 5 3.2 8.8 7.5 10.3 4.3-1.5 7.5-5.3 7.5-10.3V6.5Z" />
                </svg>
                Admin
              </Link>
            )}
            <MusicMenu />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className={cn(accountRowClass, "min-h-11 [border:0] px-3 py-[11px] !leading-5")}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className={cn(accountIconClass, "block basis-[18px] !stroke-[1.5] text-[#a4a4ae]")}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M8 16.9 6.6 18.3m10.8 0L16 16.9M8 7.1 6.6 5.7" />
              </svg>
              Configuración
            </button>
            <form action="/api/auth/signout" method="POST" onSubmit={() => stopAmbientMusic()}>
              {/* Fuera de text-size (.account-menu>button): 13px fijo. */}
              <button type="submit" className={cn(accountRowClass, "[border:0] p-3 !text-[13px]")}>
                <svg viewBox="0 0 24 24" aria-hidden className={cn(accountIconClass, "!stroke-[1.4]")}>
                  <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10M15 8l4 4-4 4M10 12h9" />
                </svg>
                Salir
              </button>
            </form>
          </div>,
          document.body
        )}

      {mounted ? createPortal(settingsDialog, document.body) : null}

      <button
        ref={profileRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full min-w-0 shrink-0 cursor-pointer flex-row items-center justify-start gap-[11px]",
          "[border-width:1px_0_0] [border-style:solid_none_none] border-t-[#ffffff0a] bg-transparent pt-[22px] text-left",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#999]"
        )}
        aria-label="Cuenta"
        aria-expanded={open}
      >
        <span
          className={cn(
            // Flex y no grid: la .grid del catálogo (legacy) sacaba la foto del círculo.
            "relative flex h-[30px] w-[30px] min-h-[30px] min-w-[30px] flex-[0_0_30px] items-center justify-center overflow-hidden rounded-[50%]",
            "border border-[#d46a802e] bg-[linear-gradient(140deg,#783d47,#43262d)] text-[11px] leading-none text-[#eeeef2]",
            "shadow-[inset_0_1px_1px_#ffffff20,0_0_16px_#f05a7410]"
          )}
          aria-hidden
        >
          <span className="z-0">{initialsOf(fullName, email)}</span>
          {showAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl!}
              alt=""
              width={30}
              height={30}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="absolute inset-0 z-[1] block h-full w-full max-w-none rounded-[50%] object-cover"
            />
          ) : null}
        </span>
        <div className="flex min-w-0 flex-[1_1_auto] flex-col items-start gap-0.5 overflow-hidden">
          <strong className="mb-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-normal text-[#eeeef2]">
            {displayName}
          </strong>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#8e909c]">
            Espacio creativo
          </span>
        </div>
      </button>
    </div>
  );
}

export default memo(SidebarFooter);
