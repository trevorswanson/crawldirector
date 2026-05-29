// console-app.jsx — shell: nav router + topbar + tweaks + mount
const { useState: useStateA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#F0C349",
  "navRail": false,
  "scanlines": true,
  "grain": true,
  "vignette": true,
  "ticker": true
}/*EDITMODE-END*/;

const NAV = [
  { id: "review", label: "Review Queue", icon: "review", badge: true, group: "dm" },
  { id: "world", label: "World Browser", icon: "layers", group: "dm" },
  { id: "studio", label: "AI · Persona Studio", icon: "studio", group: "dm" },
  { id: "sim", label: "Simulation", icon: "sim", group: "dm" },
  { id: "graph", label: "Relationship Graph", icon: "graph", group: "dm" },
  { id: "crawler", label: "Crawler Interface", icon: "crawler", group: "player" },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useStateA("review");
  const [pending, setPending] = useStateA(CAMPAIGN.pending);

  // apply visual tweaks to global CSS vars / overlays
  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    const ink = t.accent === "#F0C349" ? "#1a1306" : "#0a0908";
    document.documentElement.style.setProperty("--accent-ink", ink);
    document.getElementById("fx-scanlines").style.display = t.scanlines ? "block" : "none";
    document.getElementById("fx-grain").style.display = t.grain ? "block" : "none";
    document.querySelector(".fx-vignette").style.display = t.vignette ? "block" : "none";
  }, [t.accent, t.scanlines, t.grain, t.vignette]);

  const bump = () => setPending((p) => p + 1);
  const rail = t.navRail;

  return (
    <div className="app" style={{ gridTemplateColumns: rail ? "62px minmax(0,1fr)" : "232px minmax(0,1fr)" }}>
      {/* brand */}
      <div className="brand">
        <div style={{ width: 26, height: 26, border: "1.5px solid var(--accent)", display: "grid", placeItems: "center", color: "var(--accent)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>C</div>
        {!rail && <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: ".06em", fontSize: 15 }}>CrawlDirector</span>}
      </div>

      {/* topbar */}
      <div className="topbar">
        <button style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--bg-3)", border: "1px solid var(--line-strong)", padding: "6px 11px", color: "var(--ink)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }}></span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{CAMPAIGN.name}</span>
          <Icon name="chevronDown" size={14} style={{ color: "var(--ink-faint)" }} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--bg)", border: "1px solid var(--line)", padding: "6px 11px", width: 260, color: "var(--ink-faint)" }}>
          <Icon name="search" size={14} />
          <span style={{ fontSize: 12.5 }}>Search · Ask the Campaign…</span>
        </div>

        {t.ticker && (
          <div style={{ flex: 1, overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}>
            <div className="ticker-track" style={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>
              {[0, 1].map((k) => (
                <span key={k}><span style={{ color: "var(--hot)" }}>● LIVE</span>&nbsp;&nbsp;Floor 9 siege timer 72:00:00&nbsp;&nbsp;·&nbsp;&nbsp;Grull Legion standing ▲ 71&nbsp;&nbsp;·&nbsp;&nbsp;Donut clip #1 network-wide&nbsp;&nbsp;·&nbsp;&nbsp;System persona drift pending review&nbsp;&nbsp;·&nbsp;&nbsp;Borant filed a complaint&nbsp;&nbsp;·&nbsp;&nbsp;</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginLeft: t.ticker ? 0 : "auto", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span className="hud-tag"><Icon name="clock" size={12} />Floor {CAMPAIGN.floor} · Day {CAMPAIGN.day}</span>
          <button onClick={() => setScreen("review")} className="hud-tag" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", cursor: "pointer" }}>{pending} pending</button>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-4)", border: "1px solid var(--line-strong)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-dim)" }}>TS</div>
        </div>
      </div>

      {/* nav */}
      <nav className="nav">
        <div style={{ flex: 1, padding: "12px 0" }}>
          {!rail && <div className="kicker dim" style={{ padding: "8px 18px 10px", fontSize: 9 }}>DM Console</div>}
          {NAV.filter((n) => n.group === "dm").map((n) => <NavItem key={n.id} n={n} active={screen === n.id} rail={rail} pending={pending} onClick={() => setScreen(n.id)} />)}
          <div style={{ height: 1, background: "var(--line)", margin: rail ? "12px 12px" : "12px 18px" }}></div>
          {!rail && <div className="kicker dim" style={{ padding: "8px 18px 10px", fontSize: 9 }}>Player-facing</div>}
          {NAV.filter((n) => n.group === "player").map((n) => <NavItem key={n.id} n={n} active={screen === n.id} rail={rail} pending={pending} onClick={() => setScreen(n.id)} />)}
        </div>
        {!rail && (
          <div style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
            <div className="kicker dim nolead" style={{ fontSize: 9, marginBottom: 8 }}>Canon integrity</div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 7 }}>
              {[["DM", "var(--ink-dim)", 64], ["AI", "var(--ai)", 22], ["LCK", "var(--sys)", 14]].map(([l, c, w]) => (
                <div key={l} style={{ flex: w, height: 4, background: c, opacity: .7 }} title={l}></div>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)" }}>64% DM · 22% AI-origin · 14% locked</div>
          </div>
        )}
      </nav>

      {/* main */}
      <main className="main">
        <div key={screen} className="fade-in" style={{ height: "100%" }}>
          {screen === "review" && <ReviewScreen />}
          {screen === "world" && <WorldScreen />}
          {screen === "studio" && <StudioScreen onSentToQueue={bump} />}
          {screen === "sim" && <SimScreen onSentToQueue={bump} />}
          {screen === "graph" && <GraphScreen />}
          {screen === "crawler" && <CrawlerScreen />}
        </div>
      </main>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={["#F0C349", "#74b6ff", "#c08bff", "#ff5b3a"]} onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Layout" />
        <TweakToggle label="Collapse nav to rail" value={t.navRail} onChange={(v) => setTweak("navRail", v)} />
        <TweakToggle label="Live ticker" value={t.ticker} onChange={(v) => setTweak("ticker", v)} />
        <TweakSection label="Broadcast FX" />
        <TweakToggle label="Scanlines" value={t.scanlines} onChange={(v) => setTweak("scanlines", v)} />
        <TweakToggle label="Film grain" value={t.grain} onChange={(v) => setTweak("grain", v)} />
        <TweakToggle label="Vignette" value={t.vignette} onChange={(v) => setTweak("vignette", v)} />
      </TweaksPanel>
    </div>
  );
}

function NavItem({ n, active, rail, pending, onClick }) {
  return (
    <button onClick={onClick} title={rail ? n.label : undefined} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: rail ? "11px 0" : "10px 18px",
      justifyContent: rail ? "center" : "flex-start", background: active ? "var(--bg-3)" : "transparent",
      borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`, border: "none", cursor: "pointer",
      color: active ? "var(--ink)" : "var(--ink-dim)",
    }}>
      <Icon name={n.icon} size={18} style={{ color: active ? "var(--accent)" : "var(--ink-faint)", flexShrink: 0 }} />
      {!rail && <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, flex: 1, textAlign: "left" }}>{n.label}</span>}
      {!rail && n.badge && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, transparent)", padding: "1px 6px", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)" }}>{pending}</span>}
    </button>
  );
}

(function injectTickerCSS() {
  const s = document.createElement("style");
  s.textContent = `
    .ticker-track { display: inline-block; animation: ticker 38s linear infinite; }
    @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  `;
  document.head.appendChild(s);
})();

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
