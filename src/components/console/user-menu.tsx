"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(dm)/actions";

interface UserMenuProps {
  user: {
    name: string | null;
    email: string;
  };
  initials: string;
  fxEnabled: boolean;
}

export function UserMenu({ user, initials, fxEnabled }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fxOn, setFxOn] = useState(fxEnabled);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMouseDownInsideRef = useRef(false);

  function handleMouseDown() {
    isMouseDownInsideRef.current = true;
  }

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle global mouseup to safely reset mouseDown state
  useEffect(() => {
    function handleGlobalMouseUp() {
      isMouseDownInsideRef.current = false;
    }
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  // Handle focus leaving the container (e.g., when tabbing out)
  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (isMouseDownInsideRef.current) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (
      !(nextTarget instanceof Node) ||
      !event.currentTarget.contains(nextTarget)
    ) {
      setIsOpen(false);
    }
  }

  function toggleFx() {
    const next = !fxOn;
    setFxOn(next);
    document.documentElement.classList.toggle("fx", next);
    document.cookie = `cd-fx=${next ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("cd-fx", next ? "on" : "off");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      onMouseDown={handleMouseDown}
      className="relative flex items-center"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User menu"
        aria-expanded={isOpen}
        className="grid size-7 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-4)] font-mono text-[12px] text-[var(--ink-dim)] hover:bg-[var(--bg-3)] hover:text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors cursor-pointer"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 border border-[var(--line-strong)] bg-[var(--bg-1)] p-1 shadow-[0_18px_50px_rgba(0,0,0,.35)] fade-in">
          {/* User info header */}
          <div className="px-3 py-2 text-[13px]">
            <div className="font-bold text-[var(--ink)] truncate">
              {user.name || "Dungeon Master"}
            </div>
            <div className="text-[11.5px] text-[var(--ink-dim)] truncate mt-0.5">
              {user.email}
            </div>
          </div>

          <div className="my-1 h-px bg-[var(--line)]" />

          {/* Enable UI Effects Toggle Switch */}
          <button
            type="button"
            onClick={toggleFx}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[var(--ink-dim)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--ink)] cursor-pointer"
          >
            <span>Enable UI Effects</span>
            <div
              className={cn(
                "relative inline-flex h-[18px] w-[34px] shrink-0 cursor-pointer rounded-full border border-[var(--line-strong)] transition-colors duration-200 ease-in-out focus:outline-none",
                fxOn ? "bg-[var(--accent)]" : "bg-[var(--bg-4)]"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  fxOn
                    ? "translate-x-[16px] bg-[var(--accent-ink)]"
                    : "translate-x-0 bg-[var(--ink-dim)]"
                )}
              />
            </div>
          </button>

          {/* Account Settings Link (Planned) */}
          <div
            title="Account Settings — Planned"
            aria-disabled
            className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-[13px] text-[var(--ink-faint)] opacity-60"
          >
            <span>Account Settings</span>
            <span className="font-mono text-[9px] uppercase tracking-[.08em]">
              Planned
            </span>
          </div>

          <div className="my-1 h-px bg-[var(--line)]" />

          {/* Sign Out Button */}
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-[var(--ink-dim)] hover:text-[var(--no)] hover:bg-[var(--bg-3)] transition-colors duration-150 cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
