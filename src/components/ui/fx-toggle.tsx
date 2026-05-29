"use client";

import { useState } from "react";
import { MonitorPlay, MonitorOff } from "lucide-react";

/**
 * Toggles the broadcast-FX overlays (grain/scanlines/vignette). The preference
 * is read server-side from the `cd-fx` cookie (see app/layout.tsx), applied
 * before paint, and passed in as `defaultOn`; this control keeps the cookie +
 * the live `fx` class in sync.
 */
export function FxToggle({ defaultOn = true }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("fx", next);
    // 1 year; SameSite=Lax is fine for a cosmetic preference.
    document.cookie = `cd-fx=${next ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("cd-fx", next ? "on" : "off");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? "Broadcast FX on — click to disable" : "Broadcast FX off — click to enable"}
      aria-pressed={on}
      className="hud-tag cursor-pointer transition-colors hover:text-[var(--ink)]"
    >
      {on ? <MonitorPlay aria-hidden size={12} /> : <MonitorOff aria-hidden size={12} />}
      FX
    </button>
  );
}
