"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Gpt } from "@/lib/types";
import EnergyCanvas from "@/components/ui/EnergyCanvas";

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

  function trackTitle(e: PointerEvent<HTMLDivElement>) {
    const title = e.currentTarget.querySelector("h1");
    if (!title) return;
    const rect = title.getBoundingClientRect();
    e.currentTarget.style.setProperty("--title-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--title-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div className="chat-intro" id="chatIntro" ref={introRef}>
      <div className="gpt-title-row" onPointerMove={trackTitle}>
        <div className="brand-energy" aria-hidden>
          <EnergyCanvas size={54} speed={0.0025} />
        </div>
        <h1 data-title={displayed.name}>{displayed.name}</h1>
      </div>
      {description && <p className="gpt-intro-copy">{description}</p>}
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
