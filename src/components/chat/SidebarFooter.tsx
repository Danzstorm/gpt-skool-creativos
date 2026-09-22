import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useDismissable } from "@/hooks/useDismissable";
import { humanDisplayName } from "@/lib/utils";
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
import { stopAmbientMusic } from "@/lib/ambient-music";
import MusicMenu from "./MusicMenu";

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
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable<HTMLDivElement>(open, close);
  const settingsRef = useDismissable<HTMLDialogElement>(settingsOpen, () => setSettingsOpen(false));

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
  const subline = personName ? email : "Espacio creativo";
  const showAvatar = !!avatarUrl && !avatarFailed;

  return (
    <div ref={rootRef} style={{ marginTop: "auto", position: "relative" }}>
      {open && (
        <div className="account-menu account-open" style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 8 }}>
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden>
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
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M8 16.9 6.6 18.3m10.8 0L16 16.9M8 7.1 6.6 5.7" />
            </svg>
            Configuración
          </button>
          <form action="/api/auth/signout" method="POST" onSubmit={() => stopAmbientMusic()}>
            <button type="submit">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10M15 8l4 4-4 4M10 12h9" />
              </svg>
              Salir
            </button>
          </form>
        </div>
      )}

      <dialog
        ref={settingsRef}
        className="settings-dialog"
        onClose={() => setSettingsOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSettingsOpen(false);
        }}
      >
        <h2>Configuración</h2>
        <div className="type-settings">
          <label>
            <span>Tamaño de letra</span>
            <output id="textSizeValue">{textSize}%</output>
          </label>
          <input
            id="textSize"
            type="range"
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            step={TEXT_SIZE_STEP}
            value={textSize}
            onChange={(e) => changeTextSize(Number(e.target.value))}
            aria-label="Tamaño de letra"
          />
          <div className="type-range-labels">
            <span>Más pequeña</span>
            <span>Más grande</span>
          </div>
          <button id="resetTextSize" type="button" onClick={() => changeTextSize(TEXT_SIZE_DEFAULT)}>
            Restablecer
          </button>
        </div>
      </dialog>

      <button type="button" onClick={() => setOpen((v) => !v)} className="profile" aria-label="Cuenta">
        <span className="avatar" aria-hidden>
          {showAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl!}
              alt=""
              width={30}
              height={30}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            initialsOf(fullName, email)
          )}
        </span>
        <div>
          <strong>{displayName}</strong>
          <span>{subline}</span>
        </div>
      </button>
    </div>
  );
}

export default memo(SidebarFooter);
