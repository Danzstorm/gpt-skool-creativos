"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Gpt } from "@/lib/types";
import EnergyCanvas, { ENERGY_GPT } from "@/components/ui/EnergyCanvas";

interface Props {
  gpt: Gpt;
  onStarter: (text: string) => void;
  children?: ReactNode;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function GptHero({ gpt, onStarter, children }: Props) {
  const introRef = useRef<HTMLDivElement>(null);
  const switchVersion = useRef(0);
  const firstPaint = useRef(true);
  const latestGpt = useRef(gpt);
  const [displayed, setDisplayed] = useState(gpt);

  useEffect(() => {
    latestGpt.current = gpt;
  });

  useEffect(() => {
    const next = latestGpt.current;
    if (firstPaint.current) {
      firstPaint.current = false;
      setDisplayed(next);
      return;
    }

    const el = introRef.current;
    const version = ++switchVersion.current;
    if (!el || prefersReducedMotion()) {
      setDisplayed(next);
      return;
    }

    const from = Number(getComputedStyle(el).opacity) || 1;
    el.getAnimations().forEach((animation) => animation.cancel());
    const out = el.animate([{ opacity: from }, { opacity: 0 }], {
      duration: 190,
      easing: "ease-in-out",
      fill: "forwards",
    });

    void out.finished
      .then(() => {
        if (version !== switchVersion.current) return;
        setDisplayed(latestGpt.current);
        out.cancel();
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 260,
          easing: "ease-in-out",
        });
      })
      .catch(() => {
        if (version !== switchVersion.current) return;
        setDisplayed(latestGpt.current);
      });
  }, [gpt.id]);

  const description = displayed.description?.trim() || "";
  const starters = Array.isArray(displayed.conversation_starters)
    ? displayed.conversation_starters.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  useEffect(() => {
    const root = introRef.current;
    if (!root) return;
    let motionTimer = 0;

    function row(): HTMLElement | null {
      return root?.querySelector<HTMLElement>(".gpt-title-row") ?? null;
    }

    function onMove(event: PointerEvent) {
      const heading = row();
      const title = heading?.querySelector("h1");
      if (!heading || !title) return;
      const titleRect = title.getBoundingClientRect();
      heading.style.setProperty("--title-x", `${event.clientX - titleRect.left}px`);
      heading.style.setProperty("--title-y", `${event.clientY - titleRect.top}px`);

      const bounds = heading.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
      heading.style.setProperty("--flow-x", `${progress * 100}%`);
      heading.classList.add("is-moving");
      window.clearTimeout(motionTimer);
      motionTimer = window.setTimeout(() => heading.classList.remove("is-moving"), 180);

      const distance = Math.hypot(
        Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right),
        Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom),
      );
      heading.style.setProperty(
        "--lava-drift",
        `${Math.max(-70, Math.min(70, (event.clientX - (bounds.left + bounds.width / 2)) * 0.22))}px`,
      );
      if (distance === 0) heading.classList.add("color-awake");
      if (heading.classList.contains("color-awake")) {
        const t = Math.max(0, Math.min(1, (distance - 35) / 100));
        heading.style.setProperty("--color-presence", String(1 - t * t * (3 - 2 * t)));
        if (distance >= 135) heading.classList.remove("color-awake");
      }
    }

    function onLeave() {
      const heading = row();
      if (!heading) return;
      heading.style.setProperty("--color-presence", "0");
      heading.classList.remove("color-awake");
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.clearTimeout(motionTimer);
    };
  }, []);

  return (
    <div className="chat-intro !m-0 !flex !w-full !shrink-0 !transform-none !flex-col !items-center !pb-[30px] !pt-0 !text-center" id="chatIntro" ref={introRef}>
      <div className="gpt-title-row !mx-auto !flex !w-fit !min-w-0 !max-w-full !flex-row !flex-nowrap !items-center !justify-center !gap-[5px] ![transform:translateX(-8px)] [transition:--lava-drift_.22s_ease-out]">
        <div className="brand-energy !relative !ml-[-8px] !mr-0 !mt-0 !mb-0 !h-[58px] !w-[58px] !shrink-0 !overflow-visible" aria-hidden>
          <EnergyCanvas size={ENERGY_GPT.size} speed={ENERGY_GPT.speed} />
        </div>
        <h1
          data-title={displayed.name}
          className="relative !bg-none !font-light !leading-[1.2] !text-[#eeeef2] !tracking-[-.5px] ![word-spacing:normal] ![-webkit-text-fill-color:#eeeef2] ![overflow-wrap:break-word] ![font-family:'Plus_Jakarta_Sans',sans-serif] [transition:filter_.3s_ease] after:!font-light after:!tracking-[-.5px] after:![word-spacing:normal] after:![font-family:inherit] after:![-webkit-text-fill-color:transparent]"
        >
          {displayed.name}
        </h1>
      </div>
      {description && (
        <p
          // my-[1em]: Martin conserva el margen por defecto del <p>.
          className="gpt-intro-copy my-[1em] !bg-none !font-normal !leading-[1.6] !text-[#8e909c] !tracking-normal ![word-spacing:normal] ![-webkit-text-fill-color:#8e909c] ![background-clip:border-box] ![-webkit-background-clip:border-box] [overflow-wrap:break-word] ![font-family:var(--font-display),'Plus_Jakarta_Sans',sans-serif] [white-space:pre-wrap]"
        >
          {description}
        </p>
      )}
      {children}
      {starters.length > 0 && (
        <div className="examples">
          {starters.slice(0, 4).map((starter) => (
            <button key={starter} type="button" onClick={() => onStarter(starter)}>
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
