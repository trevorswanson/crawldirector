// screen-sim.jsx — Multi-agent simulation runtime
const { useState: useStateSim } = React;

// sample proposed actions a world tick / cascade would emit
const SIM_RESULTS = [
  { actor: "The Grull Legion", icon: "FACTION", action: "Press the moat at dawn — commit reserves to the breach.", kind: "Event", effects: ["Grull standing +6", "Skull Empire standing −4"], depth: 0 },
  { actor: "Skull Empire", icon: "FACTION", action: "Fall back to the keep; poison the eastern well behind them.", kind: "Event", effects: ["Larracos: well CONTAMINATED", "edge: Skull —DEFIES→ siege rules"], depth: 1, causedBy: "The Barbican Falls" },
  { actor: "The System", icon: "SYSTEM_AI", action: "Broadcast a “Sponsored Siege” segment; offer both armies a loot incentive.", kind: "System Message", effects: ["PERSONA_SHIFT: theatricality +4", "edge: System —MANIPULATES→ both armies"], depth: 1, causedBy: "The Barbican Falls" },
  { actor: "The Maestro", icon: "NPC", action: "Pull strings to feature Princess Donut in the war coverage.", kind: "Event", effects: ["Donut fame +0.3M", "edge: Maestro —RIVAL_OF→ Donut strengthens"], depth: 2, causedBy: "Sponsored Siege segment" },
  { actor: "Borant Syndicate", icon: "ORGANIZATION", action: "File a formal complaint about the System's unsanctioned incentives.", kind: "Event", effects: ["edge: Borant —DEFIES→ System (mutual)", "System resentment +5"], depth: 2, causedBy: "Sponsored Siege segment" },
];

function SimScreen({ onSentToQueue }) {
  const [mode, setMode] = useStateSim("tick");
  const [selected, setSelected] = useStateSim(["ent-system", "ent-grull", "ent-skull"]);
  const [depth, setDepth] = useStateSim(2);
  const [fanout, setFanout] = useStateSim(3);
  const [spend, setSpend] = useStateSim(5);
  const [omniscient, setOmniscient] = useStateSim(false);
  const [running, setRunning] = useStateSim(false);
  const [results, setResults] = useStateSim([]);
  const [sent, setSent] = useStateSim(false);

  const modeObj = SIM_MODES.find((m) => m.id === mode);
  const multi = mode === "tick";
  const estCost = (selected.length * depth * 0.18 + 0.1).toFixed(2);

  const toggleActor = (id) => setSelected((s) => {
    if (mode !== "tick") return [id];
    return s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
  });

  const run = () => {
    setRunning(true); setResults([]); setSent(false);
    const visible = SIM_RESULTS.filter((r) => r.depth <= depth);
    visible.forEach((r, i) => setTimeout(() => setResults((rs) => [...rs, r]), 420 * (i + 1)));
    setTimeout(() => setRunning(false), 420 * (visible.length + 1));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "270px 320px minmax(0,1fr)", height: "100%" }}>
      {/* actors */}
      <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <PanelHead kicker="Actors" title={multi ? "Select actors" : "Select an actor"} sub={multi ? "World tick — each acts, aware of the others." : "One agent, one proposal."} />
        <div style={{ overflowY: "auto", flex: 1, padding: "10px 12px" }}>
          {SIM_ACTORS.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button key={a.id} onClick={() => toggleActor(a.id)} disabled={!a.enabled} style={{
                display: "flex", width: "100%", textAlign: "left", gap: 10, alignItems: "center", padding: "10px 11px", marginBottom: 6,
                background: on ? "var(--bg-3)" : "transparent", cursor: a.enabled ? "pointer" : "not-allowed",
                border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, opacity: a.enabled ? 1 : 0.45,
              }}>
                <span style={{ width: 9, height: 9, flexShrink: 0, borderRadius: "50%", background: NODE_TYPE_COLOR[a.type] || "var(--ink)" }}></span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>{a.type} · {a.profile}</div>
                </span>
                {on && <span style={{ marginLeft: "auto", color: "var(--accent)" }}><Icon name="check" size={15} /></span>}
                {!a.enabled && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-faint)" }}>opt-in</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* config */}
      <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <PanelHead kicker="Run config" title="Bounds &amp; scope" />
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 18px" }}>
          <div className="kicker dim nolead" style={{ marginBottom: 9 }}>Run mode</div>
          {SIM_MODES.map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); if (m.id !== "tick") setSelected((s) => s.slice(0, 1)); }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, cursor: "pointer",
              background: m.id === mode ? "var(--bg-3)" : "transparent", border: `1px solid ${m.id === mode ? "var(--accent)" : "var(--line)"}`,
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{m.name}{m.id === "scenario" && <span className="hud-tag" style={{ marginLeft: 8, fontSize: 9, padding: "1px 5px", color: "var(--import)", borderColor: "color-mix(in srgb, var(--import) 40%, transparent)" }}>experimental</span>}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", lineHeight: 1.4 }}>{m.desc}</div>
            </button>
          ))}

          <div className="kicker dim nolead" style={{ margin: "20px 0 14px" }}>Bounds</div>
          <Dial label="Max depth" value={depth * 20} onChange={(v) => setDepth(Math.max(1, Math.round(v / 20)))} hint={`Cascade depth · ${depth} hop${depth > 1 ? "s" : ""}`} />
          <Dial label="Fan-out cap" value={fanout * 14} onChange={(v) => setFanout(Math.max(1, Math.round(v / 14)))} hint={`Max reactions per event · ${fanout}`} />
          <Dial label="Spend cap" value={spend * 10} onChange={(v) => setSpend(Math.max(1, Math.round(v / 10)))} hint={`$${spend}.00 hard limit`} />

          <div className="kicker dim nolead" style={{ margin: "20px 0 10px" }}>Knowledge scope</div>
          <div style={{ display: "flex", border: "1px solid var(--line-strong)" }}>
            {[{ k: false, t: "In-character", d: "fog of war" }, { k: true, t: "Omniscient", d: "all canon" }].map((o) => (
              <button key={String(o.k)} onClick={() => setOmniscient(o.k)} style={{
                flex: 1, padding: "9px 8px", background: omniscient === o.k ? "var(--bg-3)" : "transparent",
                borderBottom: `2px solid ${omniscient === o.k ? "var(--accent)" : "transparent"}`, border: "none", cursor: "pointer",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: omniscient === o.k ? "var(--ink)" : "var(--ink-dim)" }}>{o.t}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)" }}>{o.d}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--line)", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>Est. spend</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: +estCost > spend ? "var(--no)" : "var(--accent)" }}>${estCost}</div>
          </div>
          <Btn variant="primary" icon="play" size="lg" disabled={running || selected.length === 0} onClick={run}>{running ? "Running…" : "Run simulation"}</Btn>
        </div>
      </div>

      {/* results cascade */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <PanelHead kicker={`${modeObj.name} · proposed actions`} title="Subagent proposals"
          sub="Nothing is canon — every action lands in the Review Queue as a pending batch."
          right={results.length > 0 && !running ? <Btn variant="ok" icon="arrowRight" onClick={() => { setSent(true); onSentToQueue && onSentToQueue(); }}>Send batch to queue</Btn> : null} />
        <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>
          {results.length === 0 && !running && (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--ink-faint)", textAlign: "center" }}>
              <div>
                <Icon name="sim" size={42} style={{ opacity: .4 }} />
                <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink-dim)" }}>No run yet</div>
                <div style={{ fontSize: 12.5, marginTop: 6, maxWidth: 340 }}>Pick {multi ? "actors" : "an actor"}, set your bounds, and run. Proposed actions appear here as a bounded cascade before you review them.</div>
              </div>
            </div>
          )}
          {sent && (
            <div className="fade-in" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 9, color: "var(--ok)", fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "11px 13px", border: "1px solid color-mix(in srgb, var(--ok) 40%, transparent)", background: "color-mix(in srgb, var(--ok) 8%, transparent)" }}>
              <Icon name="check" size={14} />{results.length} proposed actions queued as one batch → Review Queue.
            </div>
          )}
          {results.map((r, i) => (
            <div key={i} className="fade-in" style={{ display: "flex", gap: 14, marginBottom: 2 }}>
              {/* depth rail */}
              <div style={{ flexShrink: 0, width: 18 + r.depth * 22, display: "flex", justifyContent: "flex-end", paddingTop: 16 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: NODE_TYPE_COLOR[r.icon] || "var(--ink)", boxShadow: "0 0 0 4px var(--bg-1)" }}></span>
              </div>
              <div className="panel" style={{ flex: 1, marginBottom: 12, borderColor: "var(--line-strong)" }}>
                <div style={{ padding: "10px 13px", display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--line)" }}>
                  <SourceBadge source="AI" small />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.actor}</span>
                  <span className="hud-tag" style={{ fontSize: 9, padding: "1px 5px" }}>{r.kind}</span>
                  {r.causedBy && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="arrowRight" size={11} />caused by “{r.causedBy}”</span>}
                </div>
                <div style={{ padding: "11px 13px" }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 9 }}>{r.action}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {r.effects.map((e, j) => (
                      <span key={j} className="mono" style={{ fontSize: 10.5, color: "var(--add)", border: "1px solid color-mix(in srgb, var(--add) 35%, transparent)", padding: "2px 7px", background: "color-mix(in srgb, var(--add) 8%, transparent)" }}>{e}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {running && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-faint)", fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "12px 0 12px 60px" }}>
              <span className="live-dot" style={{ background: "var(--ai)" }}></span>agents deliberating{omniscient ? " (omniscient)" : " (fog of war)"}…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SimScreen });
