// homepage-sections.jsx
// Shared styles, hooks, and the top-of-page sections (Nav, Hero, Graph).
// Exports: HomeStyles, useReveal, WaitlistForm, Nav, Hero, GraphSection

const HOME_CSS = `
.page { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
@media (max-width: 720px){ .page { padding: 0 18px; } }

section { position: relative; }
.section-pad { padding: clamp(70px, 11vh, 150px) 0; }

/* ============ NAV ============ */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 8000;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  border-bottom: 1px solid var(--line);
}
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 62px; }
.brand { display: flex; align-items: center; gap: 11px; font-family: var(--font-display); font-weight: 700; letter-spacing: 0.04em; font-size: 17px; }
.brand .glyph {
  width: 22px; height: 22px; display: grid; place-items: center;
  background: var(--accent); color: var(--accent-ink);
  font-family: var(--font-mono); font-weight: 700; font-size: 13px;
  clip-path: polygon(0 0,100% 0,100% 70%,70% 100%,0 100%);
}
.brand .ver { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); letter-spacing: .15em; padding: 2px 6px; border: 1px solid var(--line); border-radius: 4px; white-space: nowrap; }
@media (max-width: 720px){ .brand .ver { display: none; } }
.nav-links { display: flex; align-items: center; gap: 30px; }
.nav-links a { font-family: var(--font-mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-dim); transition: color .2s; }
.nav-links a:hover { color: var(--ink); }
.nav-cta {
  font-family: var(--font-mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  background: var(--accent); color: var(--accent-ink); border: none;
  padding: 10px 16px; font-weight: 600;
  clip-path: polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);
  transition: transform .15s, filter .2s;
}
.nav-cta:hover { filter: brightness(1.08); transform: translateY(-1px); }
.nav-live { display: inline-flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em; color: var(--hot); }
@media (max-width: 880px){ .nav-links a { display: none; } }

/* ============ HERO ============ */
.hero { padding-top: 130px; padding-bottom: 90px; }
.hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; }
.hero-grid.centered { grid-template-columns: 1fr; text-align: center; justify-items: center; gap: 44px; }
@media (max-width: 980px){ .hero-grid, .hero-grid.centered { grid-template-columns: 1fr; text-align: left; justify-items: stretch; } }

.hero h1 {
  font-family: var(--font-display); font-weight: 700;
  font-size: clamp(2.7rem, 6.6vw, 5.2rem); line-height: 0.96; letter-spacing: -0.01em;
  margin: 20px 0 0; text-wrap: balance;
}
.hero h1 .ln2 { color: var(--accent); display: block; }
.hero-lede { margin: 26px 0 0; max-width: 540px; }
.hero-grid.centered .hero-lede { margin-left: auto; margin-right: auto; }
.hero-lede .punch { font-size: clamp(1.05rem, 1.7vw, 1.35rem); color: var(--ink); line-height: 1.45; font-weight: 500; }
.hero-lede .punch b { color: var(--hot); font-weight: 600; }
.hero-lede .sub { margin-top: 16px; font-size: 15px; color: var(--ink-dim); line-height: 1.6; }
.canon-stamp {
  margin-top: 22px; display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-mono); font-size: 12px; letter-spacing: .04em; color: var(--ink);
  border: 1px solid var(--line-strong); padding: 9px 14px; background: var(--bg-1);
}
.canon-stamp .chk { color: var(--ok); flex: none; }

.stamp-badge {
  position: absolute; top: 96px; right: 8px; z-index: 5;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--hot); border: 1.5px solid var(--hot); padding: 7px 11px;
  transform: rotate(7deg); opacity: .82;
}
@media (max-width: 980px){ .stamp-badge { display: none; } }

/* ============ WAITLIST FORM ============ */
.waitlist { margin-top: 30px; max-width: 480px; }
.hero-grid.centered .waitlist { margin-left: auto; margin-right: auto; }
.waitlist-row { display: flex; gap: 0; border: 1px solid var(--line-strong); background: var(--bg-1); }
.waitlist input {
  flex: 1; background: transparent; border: none; outline: none; color: var(--ink);
  font-family: var(--font-mono); font-size: 14px; padding: 15px 16px;
}
.waitlist input::placeholder { color: var(--ink-faint); }
.waitlist button {
  background: var(--accent); color: var(--accent-ink); border: none; font-weight: 700;
  font-family: var(--font-mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  padding: 0 22px; transition: filter .2s;
}
.waitlist button:hover { filter: brightness(1.08); }
.waitlist input:focus { box-shadow: inset 0 0 0 1px var(--accent); }
.waitlist.disabled .waitlist-row { opacity: .55; cursor: not-allowed; }
.waitlist.disabled input { color: var(--ink-faint); cursor: not-allowed; }
.waitlist.disabled input::placeholder { color: var(--ink-faint); }
.waitlist.disabled button { background: var(--bg-3); color: var(--ink-faint); cursor: not-allowed; }
.waitlist.disabled button:hover { filter: none; }
.waitlist-note { margin-top: 11px; font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-faint); letter-spacing: .02em; }
.waitlist-note .cnt { color: var(--accent); }
.waitlist-ok {
  border: 1px solid var(--ok); background: color-mix(in srgb, var(--ok) 8%, var(--bg-1));
  padding: 16px 18px; font-family: var(--font-mono); font-size: 13px; color: var(--ink); line-height: 1.5;
}
.waitlist-ok .tag { color: var(--ok); letter-spacing: .1em; display: block; margin-bottom: 6px; font-size: 11px; }
.caret { animation: blink 1.1s steps(1) infinite; color: var(--accent); }
@keyframes blink { 50% { opacity: 0; } }

/* ============ GRAPH ============ */
.graph-wrap { background: var(--bg-1); border: 1px solid var(--line); padding: 16px; }
.graph-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; letter-spacing: .14em; color: var(--ink-dim); padding: 2px 4px 12px; }
.graph-head .live-dot { margin-right: 8px; }
.graph-svg { width: 100%; height: auto; display: block; }
.edge-label { font-size: 8.5px; fill: var(--ink-faint); letter-spacing: .08em; }
.dashing { animation: dash 1.4s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -16; } }
.node-disc { filter: drop-shadow(0 2px 8px rgba(0,0,0,.5)); }
.node-label { font-size: 10.5px; fill: var(--ink); font-weight: 600; letter-spacing: .02em; }
.node-badge { font-size: 7px; fill: var(--hot); letter-spacing: .12em; }
.node { animation: float 7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.node-ring { animation: spin 30s linear infinite; transform-box: fill-box; transform-origin: center; }
@keyframes spin { to { transform: rotate(360deg); } }
.graph-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 14px 4px 2px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 9.5px; letter-spacing: .1em; color: var(--ink-faint); }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }

/* ============ SECTION HEADERS ============ */
.sec-head { max-width: 760px; }
.sec-head h2 { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.9rem, 4vw, 3.1rem); line-height: 1.02; letter-spacing: -0.01em; margin: 16px 0 0; text-wrap: balance; }
.sec-head p { margin: 18px 0 0; font-size: 16px; color: var(--ink-dim); line-height: 1.65; max-width: 620px; }
.sec-num { font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); letter-spacing: .2em; }
`;

function HomeStyles() {
  return <style>{HOME_CSS}</style>;
}

function useReveal() {
  React.useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    // safety net: never leave content permanently hidden
    const t = setTimeout(() => els.forEach((el) => el.classList.add('in')), 2500);
    return () => { io.disconnect(); clearTimeout(t); };
  });
}

function WaitlistForm({ count = 1418, cta = 'Request Access', placeholder = 'crawler@dungeon.world' }) {
  // Sign-ups temporarily disabled pending launch.
  return (
    <form className="waitlist disabled" onSubmit={(e) => e.preventDefault()} aria-disabled="true">
      <div className="waitlist-row bracket">
        <input
          type="email"
          placeholder="Sign ups coming soon"
          aria-label="Email signup — coming soon"
          disabled
        />
        <button type="button" disabled>{cta}</button>
      </div>
      <div className="waitlist-note">▸ <span className="cnt">Sign ups coming soon</span> · check back for the launch signal</div>
    </form>
  );
}

function Nav() {
  return (
    <nav className="nav">
      <div className="page nav-inner">
        <div className="brand">
          <span className="glyph">C</span>
          CrawlDirector
          <span className="ver">v0.1 · PRE-ALPHA</span>
        </div>
        <div className="nav-links">
          <a href="#graph">The Graph</a>
          <a href="#review">Review</a>
          <a href="#system">The System</a>
          <a href="#simulate">Simulate</a>
          <span className="nav-live"><span className="live-dot" />LIVE</span>
          <a href="#waitlist" className="nav-cta">Join Waitlist</a>
        </div>
      </div>
    </nav>
  );
}

function Hero({ layout = 'split', headline }) {
  const parts = (headline || 'Build the Crawl. Curate the Chaos.').split(/(?<=\.)\s+/).filter(Boolean);
  const ln1 = parts[0] || headline;
  const ln2 = parts.slice(1).join(' ');
  return (
    <header className="hero">
      <div className={`page hero-grid ${layout === 'centered' ? 'centered' : ''}`}>
        <div className="hero-copy">
          <span className="kicker">FAN-BUILT · DUNGEON CRAWLER WORLD CONSOLE</span>
          <h1>
            {ln1}
            {ln2 && <span className="ln2">{ln2}</span>}
          </h1>
          <div className="hero-lede">
            <p className="punch">Most campaign managers help you take notes. This one helps you run an <b>interstellar death game.</b></p>
            <p className="sub">Manage crawlers, sponsors, factions, floors, viewer economics, and world-shaping events as a living graph of relationships and consequences. AI becomes your writers' room — not your replacement.</p>
          </div>
          <div className="canon-stamp"><span className="chk">◆</span><span>Nothing becomes canon until <b>you</b> approve it.</span></div>
          <div id="waitlist-hero">
            <WaitlistForm cta="Coming Soon" />
          </div>
        </div>
        <div className="hero-visual">
          <EntityGraph />
        </div>
      </div>
      <div className="page"><div className="stamp-badge">Reality Is Pending Review</div></div>
    </header>
  );
}

Object.assign(window, { HomeStyles, useReveal, WaitlistForm, Nav, Hero });
