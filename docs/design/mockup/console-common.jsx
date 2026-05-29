// console-common.jsx
// Shared HUD components + tiny inline-SVG icon set. Exported to window.
const { useState, useRef, useEffect } = React;

/* ----------------------------- icons ----------------------------- */
function Icon({ name, size = 16, stroke = 1.6, style }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", style };
  const paths = {
    review: <><path d="M4 5h16M4 12h16M4 19h10" /><path d="M16 17l2 2 4-4" /></>,
    studio: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
    sim: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.7 7.7l3 7.4M16.3 7.7l-3 7.4M8 6h8" /></>,
    graph: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="9" r="2" /><circle cx="9" cy="18" r="2" /><path d="M6.7 7l10.6 1.5M7.6 16.3l9.8-7M9 16l-3-8" /></>,
    crawler: <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    unlock: <><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
    check: <path d="M5 12l4 4 10-10" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    edit: <><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M14 5l4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
    warn: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 10.6a2.5 2.5 0 0 0 3.4 3.4" /><path d="M9.4 5.2A9.9 9.9 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3 3.6M6.1 6.6A16 16 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 3.3-.6" /></>,
    coin: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H10M12 8v8" /></>,
    layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
    sparkle: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />,
    play: <path d="M7 5l12 7-12 7z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /><path d="M7.5 14h9" /></>,
  };
  return <svg {...p}>{paths[name] || null}</svg>;
}

/* --------------------------- source badge ------------------------ */
function SourceBadge({ source, small }) {
  const p = PROV[source] || PROV.DM;
  return (
    <span className="src-badge" data-src={source} style={{
      fontFamily: "var(--font-mono)", fontSize: small ? 9 : 10, letterSpacing: ".1em",
      padding: small ? "1px 5px" : "2px 7px", textTransform: "uppercase",
      color: p.color, border: `1px solid ${p.color}`,
      background: `color-mix(in srgb, ${p.color} 12%, transparent)`, whiteSpace: "nowrap",
    }}>{p.short}</span>
  );
}

/* --------------------------- status pill ------------------------- */
function StatusPill({ status }) {
  const map = {
    PENDING: { c: "var(--accent)", t: "Pending" },
    CANON: { c: "var(--ok)", t: "Canon" },
    LOCKED: { c: "var(--sys)", t: "Locked" },
    STALE: { c: "var(--hot)", t: "Stale" },
    REJECTED: { c: "var(--no)", t: "Rejected" },
  };
  const s = map[status] || map.PENDING;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)",
      fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: s.c }}>
      <span style={{ width: 6, height: 6, background: s.c, display: "inline-block", borderRadius: "50%" }}></span>{s.t}
    </span>
  );
}

/* ----------------------------- lock chip ------------------------- */
function LockChip({ locked, onToggle }) {
  return (
    <button onClick={onToggle} title={locked ? "Locked — click to unlock" : "Unlocked — click to lock"} style={{
      display: "inline-flex", alignItems: "center", gap: 5, background: "transparent",
      border: `1px solid ${locked ? "var(--sys)" : "var(--line-strong)"}`,
      color: locked ? "var(--sys)" : "var(--ink-faint)", padding: "2px 6px",
      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase",
    }}>
      <Icon name={locked ? "lock" : "unlock"} size={11} />{locked ? "Locked" : "Lock"}
    </button>
  );
}

/* ------------------------------ button --------------------------- */
function Btn({ children, variant = "ghost", icon, onClick, disabled, size = "md", title, style }) {
  const sizes = { sm: { p: "5px 9px", f: 11 }, md: { p: "8px 13px", f: 12 }, lg: { p: "11px 18px", f: 13 } };
  const sz = sizes[size];
  const variants = {
    primary: { background: "var(--accent)", color: "var(--accent-ink)", border: "1px solid var(--accent)" },
    ok: { background: "color-mix(in srgb, var(--ok) 16%, transparent)", color: "var(--ok)", border: "1px solid var(--ok)" },
    no: { background: "transparent", color: "var(--no)", border: "1px solid color-mix(in srgb, var(--no) 50%, transparent)" },
    ghost: { background: "var(--bg-3)", color: "var(--ink-dim)", border: "1px solid var(--line-strong)" },
    bare: { background: "transparent", color: "var(--ink-dim)", border: "1px solid transparent" },
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: sz.p, fontSize: sz.f,
      fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase",
      transition: "filter .15s, background .15s", opacity: disabled ? 0.4 : 1,
      cursor: disabled ? "not-allowed" : "pointer", ...variants[variant], ...style,
    }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = "brightness(1.15)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}>
      {icon && <Icon name={icon} size={sz.f + 2} />}{children}
    </button>
  );
}

/* ------------------------- panel header -------------------------- */
function PanelHead({ kicker, title, right, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "14px 18px", borderBottom: "1px solid var(--line)", gap: 16 }}>
      <div>
        {kicker && <div className="kicker" style={{ marginBottom: 7 }}>{kicker}</div>}
        <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: ".01em" }}>{title}</div>
        {sub && <div style={{ color: "var(--ink-faint)", fontSize: 12, marginTop: 4 }}>{sub}</div>}
      </div>
      {right && <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/* ----------------------------- dial ------------------------------ */
// HUD slider with a ticked track and a trend marker.
function Dial({ label, hint, value, onChange, trend, accent = "var(--accent)" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-dim)" }}>
          {label}
          {trend && <span style={{ color: trend === "up" ? "var(--hot)" : "var(--sys)", marginLeft: 7 }}>{trend === "up" ? "▲ rising" : "▼ falling"}</span>}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: accent, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", top: "50%", height: 4, transform: "translateY(-50%)",
          background: "var(--bg-3)", border: "1px solid var(--line)" }}>
          <div style={{ height: "100%", width: `${value}%`, background: accent, opacity: .55 }}></div>
        </div>
        <input type="range" min="0" max="100" value={value} onChange={(e) => onChange(+e.target.value)}
          className="dial-input" style={{ position: "relative", width: "100%", margin: 0 }} />
      </div>
      {hint && <div style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

/* --------------------------- empty hint -------------------------- */
function FieldKey({ children }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)",
    letterSpacing: ".06em", textTransform: "uppercase", minWidth: 92, display: "inline-block" }}>{children}</span>;
}

/* dial input CSS (range thumb) injected once */
(function injectDialCSS() {
  if (document.getElementById("dial-css")) return;
  const s = document.createElement("style");
  s.id = "dial-css";
  s.textContent = `
    .dial-input { -webkit-appearance: none; appearance: none; background: transparent; height: 18px; cursor: pointer; }
    .dial-input::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 18px; background: var(--ink); border: 1px solid var(--bg); box-shadow: 0 0 0 1px var(--line-strong); cursor: grab; }
    .dial-input::-webkit-slider-thumb:active { cursor: grabbing; background: var(--accent); }
    .dial-input::-moz-range-thumb { width: 12px; height: 18px; background: var(--ink); border: 1px solid var(--bg); cursor: grab; border-radius: 0; }
    .dial-input::-moz-range-track { background: transparent; }
  `;
  document.head.appendChild(s);
})();

Object.assign(window, { Icon, SourceBadge, StatusPill, LockChip, Btn, PanelHead, Dial, FieldKey });
