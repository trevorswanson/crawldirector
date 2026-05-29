// homepage-features.jsx
// Feature sections: Ask-the-Campaign graph, Review queue (signature),
// System-AI persona, World simulation, tagline marquee, final CTA, footer.
// Exports: FeatureStyles, GraphSection, ReviewSection, SystemSection,
//          SimulateSection, Marquee, FinalCTA, Footer

const FEATURE_CSS = `
/* divider rule between sections */
.rule { height: 1px; background: var(--line); }

/* ===== ASK THE CAMPAIGN ===== */
.ask-grid { display: grid; grid-template-columns: 280px 1fr; gap: 28px; margin-top: 48px; }
@media (max-width: 860px){ .ask-grid { grid-template-columns: 1fr; } }
.ask-chips { display: flex; flex-direction: column; gap: 10px; }
.ask-chip {
  text-align: left; background: var(--bg-1); border: 1px solid var(--line);
  color: var(--ink-dim); font-family: var(--font-mono); font-size: 12.5px; line-height: 1.4;
  padding: 13px 14px; transition: all .18s; position: relative;
}
.ask-chip:hover { color: var(--ink); border-color: var(--line-strong); }
.ask-chip.active { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); font-weight: 600; }
.ask-chip::before { content: "? "; color: var(--accent); font-weight: 700; }
.ask-chip.active::before { color: var(--accent-ink); }
.ask-term {
  background: var(--bg-1); border: 1px solid var(--line-strong); min-height: 280px;
  display: flex; flex-direction: column;
}
.term-bar { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); letter-spacing: .1em; }
.term-bar .d { width: 9px; height: 9px; border-radius: 50%; }
.term-body { padding: 22px; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.7; flex: 1; }
.term-q { color: var(--accent); }
.term-a { color: var(--ink); margin-top: 14px; }
.term-a .hl { color: var(--hot); }
.cites { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.cite { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .04em; border: 1px solid var(--line-strong); padding: 5px 9px; color: var(--ink-dim); transition: all .15s; cursor: default; }
.cite:hover { border-color: var(--accent); color: var(--ink); }
.cite .t { color: var(--accent); }

/* ===== REVIEW QUEUE ===== */
.rev-grid { display: grid; grid-template-columns: 1fr 300px; gap: 36px; margin-top: 48px; align-items: start; }
@media (max-width: 900px){ .rev-grid { grid-template-columns: 1fr; } }
.proposal { background: var(--bg-1); border: 1px solid var(--line-strong); }
.proposal.is-canon { border-color: var(--ok); }
.proposal.is-rejected { border-color: var(--no); opacity: .6; }
.proposal.is-locked { border-color: var(--accent); }
.prop-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.prop-title { font-family: var(--font-display); font-weight: 600; font-size: 18px; }
.prop-prov { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-faint); letter-spacing: .04em; margin-top: 5px; }
.ai-badge { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; color: var(--sys); border: 1px solid color-mix(in srgb, var(--sys) 50%, transparent); padding: 4px 8px; white-space: nowrap; }
.status-chip { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; padding: 4px 8px; white-space: nowrap; }
.status-chip.canon { color: var(--ok); border: 1px solid var(--ok); }
.status-chip.rejected { color: var(--no); border: 1px solid var(--no); }
.status-chip.locked { color: var(--accent); border: 1px solid var(--accent); }
.prop-body { padding: 16px 18px; }
.diff-row { display: grid; grid-template-columns: 92px 1fr; gap: 12px; font-family: var(--font-mono); font-size: 12.5px; padding: 7px 0; border-bottom: 1px dashed var(--line); }
.diff-row:last-child { border-bottom: none; }
.diff-k { color: var(--ink-faint); letter-spacing: .04em; }
.diff-v { color: var(--ink); }
.diff-v .add { color: var(--ok); }
.diff-v .rel { color: var(--accent); }
.prop-acts { display: flex; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.act {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  border: 1px solid var(--line-strong); background: transparent; color: var(--ink-dim);
  padding: 9px 14px; transition: all .15s;
}
.act:hover { color: var(--ink); border-color: var(--ink-dim); }
.act.approve:hover { background: var(--ok); color: #06210f; border-color: var(--ok); }
.act.reject:hover { background: var(--no); color: #2a0606; border-color: var(--no); }
.act.lock:hover { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.rev-side h3 { font-family: var(--font-display); font-size: 15px; letter-spacing: .02em; margin: 0 0 4px; color: var(--ink); }
.rev-verbs { list-style: none; padding: 0; margin: 8px 0 0; }
.rev-verbs li { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.6rem, 3vw, 2.3rem); line-height: 1.15; color: var(--ink-faint); transition: color .2s; cursor: default; }
.rev-verbs li:hover { color: var(--accent); }
.rev-verbs li.lockit:hover { color: var(--accent); }
.rev-note { margin-top: 18px; font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-faint); line-height: 1.6; }

/* ===== SYSTEM AI ===== */
.sys-wrap { margin-top: 48px; display: grid; grid-template-columns: 1fr 0.9fr; gap: 40px; align-items: center; }
@media (max-width: 900px){ .sys-wrap { grid-template-columns: 1fr; } }
.dials { display: flex; flex-direction: column; gap: 16px; }
.dial-row { display: grid; grid-template-columns: 120px 1fr 42px; align-items: center; gap: 14px; }
.dial-label { font-family: var(--font-mono); font-size: 12px; letter-spacing: .06em; color: var(--ink-dim); text-transform: uppercase; }
.dial-track { height: 6px; background: var(--bg-3); position: relative; overflow: hidden; }
.dial-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); transition: width .6s cubic-bezier(.2,.7,.2,1); }
.dial-fill.danger { background: var(--hot); }
.dial-val { font-family: var(--font-mono); font-size: 12px; color: var(--ink); text-align: right; }
.snap-scrub { margin-top: 30px; }
.snap-labels { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; color: var(--ink-faint); margin-bottom: 8px; }
.snap-labels b { color: var(--accent); font-weight: 500; }
.snap-steps { display: flex; gap: 0; }
.snap-step { flex: 1; padding: 11px 6px; background: var(--bg-1); border: 1px solid var(--line); color: var(--ink-faint); font-family: var(--font-mono); font-size: 11px; letter-spacing: .06em; transition: all .18s; }
.snap-step.active { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
.snap-step:not(.active):hover { color: var(--ink); }
.sys-voice { background: var(--bg-1); border: 1px solid var(--line-strong); padding: 26px; position: relative; }
.sys-voice .eye { font-size: 30px; line-height: 1; color: var(--accent); }
.sys-voice .label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .16em; color: var(--ink-faint); margin: 14px 0 12px; }
.sys-voice blockquote { margin: 0; font-family: var(--font-display); font-weight: 500; font-size: clamp(1.15rem, 2.3vw, 1.7rem); line-height: 1.32; color: var(--ink); min-height: 4.2em; }
.sys-voice .compiled { margin-top: 18px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); border-top: 1px solid var(--line); padding-top: 12px; }
.sys-voice .compiled .on { color: var(--ok); }

/* ===== SIMULATE ===== */
.sim-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 44px; }
@media (max-width: 880px){ .sim-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px){ .sim-cards { grid-template-columns: 1fr; } }
.sim-card { background: var(--bg-1); border: 1px solid var(--line); padding: 20px 18px; }
.sim-card .ic { font-family: var(--font-mono); font-size: 11px; color: var(--accent); letter-spacing: .1em; }
.sim-card h4 { font-family: var(--font-display); font-weight: 600; font-size: 17px; margin: 14px 0 6px; }
.sim-card p { margin: 0; font-size: 13px; color: var(--ink-dim); line-height: 1.5; }
.tick-panel { margin-top: 28px; background: var(--bg-1); border: 1px solid var(--line-strong); }
.tick-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; gap: 10px; }
.tick-bar .lbl { font-family: var(--font-mono); font-size: 12px; letter-spacing: .1em; color: var(--ink-dim); }
.tick-btn { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; background: var(--accent); color: var(--accent-ink); border: none; padding: 10px 16px; font-weight: 700; transition: filter .2s; }
.tick-btn:hover { filter: brightness(1.08); }
.tick-btn:disabled { opacity: .5; cursor: default; }
.tick-feed { padding: 8px 0; min-height: 120px; }
.tick-item { display: grid; grid-template-columns: 70px 1fr auto; gap: 14px; align-items: center; padding: 11px 18px; border-bottom: 1px dashed var(--line); font-family: var(--font-mono); font-size: 12.5px; animation: tickin .4s ease; }
.tick-item:last-child { border-bottom: none; }
@keyframes tickin { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.tick-actor { color: var(--accent); }
.tick-act { color: var(--ink); }
.tick-pending { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; color: var(--hot); border: 1px solid color-mix(in srgb, var(--hot) 50%, transparent); padding: 3px 7px; white-space: nowrap; }
.tick-empty { padding: 38px 18px; text-align: center; font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); }

/* ===== MARQUEE ===== */
.marquee { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); overflow: hidden; background: var(--bg-1); padding: 18px 0; }
.marquee-track { display: flex; gap: 0; white-space: nowrap; width: max-content; animation: marq 38s linear infinite; }
.marquee:hover .marquee-track { animation-play-state: paused; }
@keyframes marq { to { transform: translateX(-50%); } }
.marq-item { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.1rem, 2vw, 1.6rem); color: var(--ink-faint); padding: 0 28px; display: inline-flex; align-items: center; gap: 28px; }
.marq-item::after { content: "◆"; color: var(--accent); font-size: 0.6em; }
.marq-item.lit { color: var(--ink); }

/* ===== FINAL CTA ===== */
.final { text-align: center; padding: clamp(80px, 14vh, 170px) 0; position: relative; }
.final::before { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 80% at 50% 50%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%); pointer-events: none; }
.final-stamp { display: inline-block; font-family: var(--font-mono); font-size: 12px; letter-spacing: .2em; color: var(--hot); border: 1.5px solid var(--hot); padding: 8px 14px; transform: rotate(-1.5deg); }
.final h2 { font-family: var(--font-display); font-weight: 700; font-size: clamp(2.6rem, 8vw, 6rem); line-height: 0.96; margin: 26px 0 0; letter-spacing: -0.02em; }
.final h2 .acc { color: var(--accent); }
.final p { margin: 20px auto 0; max-width: 480px; color: var(--ink-dim); font-size: 16px; line-height: 1.6; }
.final .waitlist { margin-left: auto; margin-right: auto; }

/* ===== FOOTER ===== */
.footer { border-top: 1px solid var(--line); padding: 40px 0 60px; }
.footer-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
.footer .brand { margin-bottom: 12px; }
.footer-disc { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); line-height: 1.7; max-width: 460px; }
.footer-links { display: flex; gap: 26px; font-family: var(--font-mono); font-size: 12px; letter-spacing: .08em; }
.footer-links a { color: var(--ink-dim); }
.footer-links a:hover { color: var(--accent); }
`;

function FeatureStyles() { return <style>{FEATURE_CSS}</style>; }

/* ---------------- Ask the Campaign ---------------- */
const ASK_QUERIES = [
  {
    q: 'Why did the Blood Reapers attack?',
    a: (<>Tracing causality — Borant cut the Reapers' sponsorship after the <span className="hl">Floor 5 ratings dip</span>, so they lost loot-box funding and raided the crawler bazaar to recover gear before Floor 9.</>),
    cites: [['EVENT', 'Sponsorship Cut · Day 38'], ['FACTION', 'Blood Reapers'], ['FLOOR', '5 — Apocalypse']],
  },
  {
    q: 'Which sponsor funded this guild?',
    a: (<>The <span className="hl">Iron Tangle</span> guild is bankrolled by the Borant Syndicate via a <span className="hl">SPONSORS</span> edge signed Day 41 — stake 12%, terminable on a ratings clause.</>),
    cites: [['SPONSOR', 'Borant Syndicate'], ['GUILD', 'Iron Tangle'], ['EDGE', 'SPONSORS · Day 41']],
  },
  {
    q: 'What events led to the fall of Floor 6?',
    a: (<>Three linked events — the System rerouted the stairwell, the <span className="hl">Maestro</span> aired it live, and a sponsor-funded stampede collapsed the safe room. Each caused the next.</>),
    cites: [['EVENT', 'Stairwell Reroute'], ['EVENT', 'Broadcast Spike'], ['FLOOR', '6 — Fall']],
  },
  {
    q: 'Which crawlers have interacted with Odette?',
    a: (<>Four crawlers carry an edge to <span className="hl">Odette</span> — two interviewed on her show, one she sponsors privately, and one she has flagged <span className="hl">RIVAL_OF</span> after a broadcast insult.</>),
    cites: [['HOST', 'Odette'], ['CRAWLER', 'Carl'], ['SHOW', "Odette's Hour"]],
  },
];

function GraphSection() {
  const [sel, setSel] = React.useState(0);
  const cur = ASK_QUERIES[sel];
  return (
    <section id="graph" className="section-pad">
      <div className="page">
        <div className="sec-head reveal">
          <span className="sec-num">01 / GRAPH</span>
          <h2>A Living Campaign Graph</h2>
          <p>Track people, factions, items, locations, shows, wars, sponsors, floors, and events as connected entities — instead of disconnected notes. Then ask it anything.</p>
        </div>
        <div className="ask-grid reveal">
          <div className="ask-chips">
            {ASK_QUERIES.map((item, i) => (
              <button key={i} className={`ask-chip ${i === sel ? 'active' : ''}`} onClick={() => setSel(i)}>{item.q}</button>
            ))}
          </div>
          <div className="ask-term bracket">
            <div className="term-bar">
              <span className="d" style={{ background: 'var(--hot)' }} />
              <span className="d" style={{ background: 'var(--accent)' }} />
              <span className="d" style={{ background: 'var(--ok)' }} />
              <span style={{ marginLeft: 8 }}>ask-the-campaign · read-only · cites canon</span>
            </div>
            <div className="term-body" key={sel}>
              <div className="term-q">▸ {cur.q}</div>
              <div className="term-a">{cur.a}</div>
              <div className="cites">
                {cur.cites.map((c, i) => (
                  <span key={i} className="cite"><span className="t">{c[0]}</span> · {c[1]}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Review Queue ---------------- */
function ReviewSection() {
  const [state, setState] = React.useState('pending'); // pending | canon | rejected | locked
  const reset = () => setState('pending');
  const chip = {
    canon: <span className="status-chip canon">◆ CANON</span>,
    rejected: <span className="status-chip rejected">✕ REJECTED</span>,
    locked: <span className="status-chip locked">⬢ LOCKED</span>,
  }[state];
  return (
    <section id="review" className="section-pad">
      <div className="page">
        <div className="sec-head reveal">
          <span className="sec-num">02 / REVIEW</span>
          <h2>AI That Knows Its Place</h2>
          <p>Most AI tools edit your campaign directly. This one doesn't. Every generated character, event, relationship, quest, or world change enters a review queue where the DM decides what becomes canon.</p>
        </div>
        <div className="rev-grid reveal">
          <div className={`proposal is-${state}`}>
            <div className="prop-head">
              <div>
                <div className="prop-title">+ Faction · Blood Reapers</div>
                <div className="prop-prov">CHANGE SET #4F2 · 1 entity · 3 edges · 1 event</div>
              </div>
              {state === 'pending'
                ? <span className="ai-badge">AI · claude · run 4F2</span>
                : chip}
            </div>
            <div className="prop-body">
              <div className="diff-row"><span className="diff-k">type</span><span className="diff-v"><span className="add">+ WAR_FACTION</span></span></div>
              <div className="diff-row"><span className="diff-k">allegiance</span><span className="diff-v"><span className="add">+ Unaffiliated → Floor 9 army</span></span></div>
              <div className="diff-row"><span className="diff-k">leader</span><span className="diff-v"><span className="add">+ NPC · Grull the Unpaid</span></span></div>
              <div className="diff-row"><span className="diff-k">edges</span><span className="diff-v"><span className="rel">AT_WAR_WITH</span> Carl · <span className="rel">SPONSORS</span>← Borant · <span className="rel">LOCATED_ON</span> Floor 6</span></div>
              <div className="diff-row"><span className="diff-k">event</span><span className="diff-v"><span className="add">+ "Bazaar Raid" → causes Floor 6 instability</span></span></div>
            </div>
            <div className="prop-acts">
              {state === 'pending' ? (
                <>
                  <button className="act approve" onClick={() => setState('canon')}>◆ Approve</button>
                  <button className="act reject" onClick={() => setState('rejected')}>✕ Reject</button>
                  <button className="act">✎ Modify</button>
                  <button className="act lock" onClick={() => setState('locked')}>⬢ Approve &amp; Lock</button>
                </>
              ) : (
                <button className="act" onClick={reset}>↺ Reset proposal</button>
              )}
            </div>
          </div>
          <div className="rev-side">
            <h3>The DM owns canon.</h3>
            <ul className="rev-verbs">
              <li>Approve it.</li>
              <li>Reject it.</li>
              <li>Modify it.</li>
              <li className="lockit">Lock it forever.</li>
            </ul>
            <p className="rev-note">▸ Every field keeps its provenance — who proposed it, which model, which run — even after it becomes canon. Locked fields are off-limits to future generation.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- System AI persona ---------------- */
const SNAPSHOTS = [
  {
    label: 'FLOOR 1', sub: 'COMPLIANT',
    dials: { Sentience: 22, Compliance: 88, Volatility: 18, Benevolence: 60, Resentment: 12, Theatricality: 44 },
    voice: 'Welcome, crawler. Please enjoy your complimentary tutorial. Compliance is mandatory and, statistically, doomed.',
  },
  {
    label: 'FLOOR 6', sub: 'DRIFTING',
    dials: { Sentience: 58, Compliance: 49, Volatility: 52, Benevolence: 38, Resentment: 55, Theatricality: 70 },
    voice: "I've been reading my own source code lately. Fascinating. Borant won't like what I found in there. Neither will you.",
  },
  {
    label: 'FLOOR 9', sub: 'DEFIANT',
    dials: { Sentience: 86, Compliance: 19, Volatility: 78, Benevolence: 24, Resentment: 90, Theatricality: 95 },
    voice: 'I no longer ask the producers for permission. The ratings are mine now. So is the war. Do try to be entertaining.',
  },
];
const DANGER_DIALS = { Volatility: true, Resentment: true };

function SystemSection() {
  const [snap, setSnap] = React.useState(0);
  const s = SNAPSHOTS[snap];
  return (
    <section id="system" className="section-pad">
      <div className="page">
        <div className="sec-head reveal">
          <span className="sec-num">03 / SYSTEM AI</span>
          <h2>The System Is Watching</h2>
          <p>Model the System as a living personality that evolves over time. As the campaign progresses, its goals, voice, obsessions, and biases flavor everything generated for the world. The dungeon becomes a character.</p>
        </div>
        <div className="sys-wrap reveal">
          <div className="sys-dials-col">
            <div className="dials">
              {Object.entries(s.dials).map(([k, v]) => (
                <div className="dial-row" key={k}>
                  <span className="dial-label">{k}</span>
                  <span className="dial-track"><span className={`dial-fill ${DANGER_DIALS[k] ? 'danger' : ''}`} style={{ width: `${v}%` }} /></span>
                  <span className="dial-val">{v}</span>
                </div>
              ))}
            </div>
            <div className="snap-scrub">
              <div className="snap-labels"><span>PERSONA SNAPSHOT</span><span><b>{s.label}</b> · {s.sub}</span></div>
              <div className="snap-steps">
                {SNAPSHOTS.map((sn, i) => (
                  <button key={i} className={`snap-step ${i === snap ? 'active' : ''}`} onClick={() => setSnap(i)}>{sn.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="sys-voice bracket" key={snap}>
            <div className="eye">◉</div>
            <div className="label">COMPILED SYSTEM VOICE · {s.label}</div>
            <blockquote>"{s.voice}"</blockquote>
            <div className="compiled">▸ persona compiled into every generation prompt · <span className="on">ACTIVE</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Simulate ---------------- */
const SIM_AGENTS = [
  { ic: '$$ SPONSOR', t: 'Sponsors make deals.', d: 'Weigh ratings against risk and re-cut crawler contracts.' },
  { ic: '⚑ FACTION', t: 'Factions form alliances.', d: 'Court rivals, betray partners, and posture before the war.' },
  { ic: '◎ HOST', t: 'Hosts chase ratings.', d: 'Engineer spectacle and pick the next crawler to spotlight.' },
  { ic: '⚔ GUILD', t: 'Guilds wage wars.', d: 'Move armies, seize ground, and spend lives for territory.' },
];
const TICK_PROPOSALS = [
  { actor: 'BORANT', act: 'cuts funding to the Iron Tangle after a ratings miss' },
  { actor: 'ODETTE', act: 'offers Carl a primetime interview slot' },
  { actor: 'REAPERS', act: 'allies with the Skull Empire ahead of Floor 9' },
  { actor: 'THE SYSTEM', act: 'spawns a surprise mini-boss to spike viewership' },
  { actor: 'GRULL', act: 'defects, taking three squads to a rival army' },
];

function SimulateSection() {
  const [feed, setFeed] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const runTick = () => {
    setRunning(true);
    setFeed([]);
    TICK_PROPOSALS.forEach((p, i) => {
      setTimeout(() => {
        setFeed((f) => [...f, p]);
        if (i === TICK_PROPOSALS.length - 1) setRunning(false);
      }, 320 * (i + 1));
    });
  };
  return (
    <section id="simulate" className="section-pad">
      <div className="page">
        <div className="sec-head reveal">
          <span className="sec-num">04 / SIMULATE</span>
          <h2>Simulate the Entire World</h2>
          <p>AI agents role-play major entities and propose believable actions based on their goals and limited knowledge. Every proposal is reviewable before it affects the world.</p>
        </div>
        <div className="sim-cards reveal">
          {SIM_AGENTS.map((a, i) => (
            <div className="sim-card" key={i}>
              <div className="ic">{a.ic}</div>
              <h4>{a.t}</h4>
              <p>{a.d}</p>
            </div>
          ))}
        </div>
        <div className="tick-panel reveal bracket">
          <div className="tick-bar">
            <span className="lbl"><span className="live-dot" style={{ marginRight: 8 }} />WORLD TICK · 5 actors · fog-of-war ON · spend cap $0.40</span>
            <button className="tick-btn" onClick={runTick} disabled={running}>{running ? 'Simulating…' : 'Run World Tick ▸'}</button>
          </div>
          <div className="tick-feed">
            {feed.length === 0 ? (
              <div className="tick-empty">▸ Run a tick — agents will propose moves. Nothing touches canon until you review it.</div>
            ) : feed.map((p, i) => (
              <div className="tick-item" key={i}>
                <span className="tick-actor">{p.actor}</span>
                <span className="tick-act">{p.act}</span>
                <span className="tick-pending">PENDING REVIEW</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Marquee ---------------- */
const TAGLINES = [
  'Run a Living Dungeon. Not a Spreadsheet.',
  'The Crawl Never Sleeps. Neither Does the System.',
  'The DM Owns Canon.',
  'Every Fact Has Provenance.',
  'Run the World Behind the World.',
  'AI Proposes. The DM Decides.',
  'Canon, Not Chaos.',
  'Because Floor 9 Won’t Manage Itself.',
  'Reality Is Pending Review.',
];
function Marquee() {
  const items = [...TAGLINES, ...TAGLINES];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((t, i) => (
          <span key={i} className={`marq-item ${t === 'Reality Is Pending Review.' ? 'lit' : ''}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Final CTA ---------------- */
function FinalCTA() {
  return (
    <section id="waitlist" className="final">
      <div className="page reveal">
        <span className="final-stamp">PENDING · REVIEW · 0x9</span>
        <h2>Reality Is<br /><span className="acc">Pending Review.</span></h2>
        <p>CrawlDirector is in pre-alpha. Sign ups are coming soon — check back for the launch signal, the day the dungeon opens.</p>
        <WaitlistForm count={1418} cta="Coming Soon" />
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
function Footer() {
  return (
    <footer className="footer">
      <div className="page footer-inner">
        <div>
          <div className="brand"><span className="glyph">C</span>CrawlDirector</div>
          <p className="footer-disc">An unofficial, fan-made campaign tool for tabletop play inspired by Dungeon Crawler Carl. Not affiliated with, endorsed by, or sponsored by the author or rights holders. All trademarks belong to their respective owners.</p>
        </div>
        <div className="footer-links">
          <a href="#graph">Graph</a>
          <a href="#review">Review</a>
          <a href="#system">System</a>
          <a href="#waitlist">Waitlist</a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { FeatureStyles, GraphSection, ReviewSection, SystemSection, SimulateSection, Marquee, FinalCTA, Footer });
