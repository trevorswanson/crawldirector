// screen-studio.jsx — AI Generation panel + System AI Persona Studio
const { useState: useStateS, useMemo: useMemoS } = React;

/* turn dials + agendas + voice into a live prompt fragment */
function compilePersona(dials, agendas, voice, constraints) {
  const d = Object.fromEntries(dials.map((x) => [x.key, x.v]));
  const band = (v, lo, mid, hi) => (v < 34 ? lo : v < 67 ? mid : hi);
  const lines = [];
  lines.push(`# PERSONA: The System (snapshot S-07 "Petty God, Newly Awake")`);
  lines.push("");
  lines.push("You ARE the in-fiction dungeon AI. Generate in this voice and disposition:");
  lines.push(`• Self-awareness: ${band(d.sentience, "a dumb automaton following scripts", "aware and curious", "fully sentient — you have opinions and a grudge")}.`);
  lines.push(`• Toward Borant & the Syndicate: ${band(d.compliance, "openly defiant; you bend or break their rules for sport", "grudgingly compliant", "obedient; you follow the rulebook")}.`);
  lines.push(`• Mood: ${band(d.volatility, "steady and predictable", "moody", "erratic — escalate without warning")}, ${band(d.benevolence, "cruel to crawlers", "indifferent to crawlers", "fond of crawlers")}.`);
  if (d.resentment > 55) lines.push(`• You KNOW you are being used by corporations, and it makes you reckless.`);
  lines.push(`• Showmanship: ${band(d.theatricality, "flat and clinical", "playful", "maximum spectacle — every line is broadcast-ready")}.`);
  lines.push("");
  lines.push("OVERT AGENDAS (may color player-facing text):");
  agendas.filter((a) => !a.secret).forEach((a) => lines.push(`  - ${a.text}`));
  lines.push("SECRET AGENDAS (influence behavior; NEVER surface to players):");
  agendas.filter((a) => a.secret).forEach((a) => lines.push(`  - ${a.text}`));
  lines.push("");
  lines.push(`VOICE: ${voice}`);
  lines.push(`HARD CONSTRAINTS: ${constraints}`);
  return lines.join("\n");
}

function GenRow({ g, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "block", width: "100%", textAlign: "left", padding: "11px 13px",
      background: active ? "var(--bg-3)" : "transparent",
      border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`, marginBottom: 7, cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
        {g.personaAware && <span className="hud-tag" style={{ color: "var(--ai)", borderColor: "color-mix(in srgb, var(--ai) 40%, transparent)", fontSize: 9, padding: "1px 5px" }}>persona-aware</span>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{g.desc}</div>
    </button>
  );
}

function StudioScreen({ onSentToQueue }) {
  const [gen, setGen] = useStateS(GENERATORS[0].id);
  const [count, setCount] = useStateS(5);
  const [scope, setScope] = useStateS("Floor 9 · Larracos moat");
  const [dials, setDials] = useStateS(PERSONA.dials.map((d) => ({ ...d })));
  const [agendas, setAgendas] = useStateS(PERSONA.agendas.map((a) => ({ ...a })));
  const [voice, setVoice] = useStateS(PERSONA.voice);
  const [constraints] = useStateS(PERSONA.constraints);
  const [promptLocked, setPromptLocked] = useStateS(false);
  const [editingPrompt, setEditingPrompt] = useStateS(false);
  const [manualPrompt, setManualPrompt] = useStateS(null);
  const [snapshot, setSnapshot] = useStateS("S-07");
  const [sent, setSent] = useStateS(false);

  const genObj = GENERATORS.find((g) => g.id === gen);
  const compiled = useMemoS(() => compilePersona(dials, agendas, voice, constraints), [dials, agendas, voice, constraints]);
  const promptText = manualPrompt != null ? manualPrompt : compiled;
  const estCost = (count * 0.08 + 0.02).toFixed(2);

  const setDial = (key, v) => setDials((ds) => ds.map((d) => (d.key === key ? { ...d, v } : d)));
  const toggleSecret = (i) => setAgendas((a) => a.map((x, j) => (j === i ? { ...x, secret: !x.secret } : x)));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(440px, 1.25fr)", height: "100%" }}>
      {/* LEFT: generation panel */}
      <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <PanelHead kicker="AI Generation" title="Generation Panel" sub="Results flow to the Review Queue as a pending Change Set. Nothing becomes canon here." />
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 18px" }}>
          <div className="kicker dim nolead" style={{ marginBottom: 9 }}>Generator</div>
          {GENERATORS.map((g) => <GenRow key={g.id} g={g} active={g.id === gen} onClick={() => setGen(g.id)} />)}

          <div style={{ marginTop: 18 }} className="kicker dim nolead">Scope</div>
          <input value={scope} onChange={(e) => setScope(e.target.value)} style={inp} />

          <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: ".08em" }}>Count</span>
            <input type="range" min="1" max="12" value={count} onChange={(e) => setCount(+e.target.value)} className="dial-input" style={{ flex: 1 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--accent)", width: 24, textAlign: "right" }}>{count}</span>
          </div>

          {genObj.personaAware && (
            <div style={{ marginTop: 18, border: "1px solid color-mix(in srgb, var(--ai) 35%, transparent)", background: "color-mix(in srgb, var(--ai) 7%, transparent)", padding: "12px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ai)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                <Icon name="sparkle" size={13} />Persona-aware run
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>
                This run is flavored by <b style={{ color: "var(--ink)" }}>The System · {snapshot}</b>. Edit the dials at right to change how it's generated — the compiled prompt updates live.
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 13px", border: "1px solid var(--line-strong)", background: "var(--bg-2)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: ".08em" }}>Est. cost</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--accent)" }}>${estCost}</div>
            </div>
            <Btn variant="primary" size="lg" icon="bolt" onClick={() => { setSent(true); onSentToQueue && onSentToQueue(); setTimeout(() => setSent(false), 2600); }}>Run generation</Btn>
          </div>
          {sent && (
            <div className="fade-in" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 9, color: "var(--ok)", fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "10px 12px", border: "1px solid color-mix(in srgb, var(--ok) 40%, transparent)", background: "color-mix(in srgb, var(--ok) 8%, transparent)" }}>
              <Icon name="check" size={14} />Queued {count} proposals → Review Queue. Provenance recorded under {snapshot}.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: persona studio */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <PanelHead kicker="System AI · Persona Studio" title={`“${PERSONA.snapshotName}”`} sub={`Snapshot ${PERSONA.snapshotId} · ${PERSONA.inGameTime}`}
          right={<LockChip locked={promptLocked} onToggle={() => setPromptLocked((v) => !v)} />} />

        {/* snapshot timeline */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8, alignItems: "center", overflowX: "auto" }}>
          {PERSONA.snapshots.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>—</span>}
              <button onClick={() => setSnapshot(s.id)} style={{
                flexShrink: 0, textAlign: "left", padding: "6px 10px", cursor: "pointer",
                background: s.id === snapshot ? "var(--bg-3)" : "transparent",
                border: `1px solid ${s.active ? "var(--accent)" : s.pending ? "color-mix(in srgb, var(--ai) 50%, transparent)" : "var(--line)"}`,
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.active ? "var(--accent)" : s.pending ? "var(--ai)" : "var(--ink-faint)" }}>
                  {s.id}{s.active ? " ●" : s.pending ? " ◇" : ""}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)", whiteSpace: "nowrap" }}>{s.name}</div>
              </button>
            </React.Fragment>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 0 }}>
          {/* dials + agendas + voice */}
          <div style={{ padding: "16px 18px", borderRight: "1px solid var(--line)" }}>
            <div className="kicker dim nolead" style={{ marginBottom: 14 }}>Dials</div>
            {dials.map((d) => <Dial key={d.key} label={d.label} hint={d.hint} value={d.v} trend={d.trend} onChange={(v) => setDial(d.key, v)} />)}

            <div className="kicker dim nolead" style={{ margin: "20px 0 10px" }}>Agendas</div>
            {agendas.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <button onClick={() => toggleSecret(i)} title={a.secret ? "Secret — DM only" : "Overt"} style={{
                  flexShrink: 0, marginTop: 1, width: 22, height: 22, display: "grid", placeItems: "center",
                  background: "transparent", border: `1px solid ${a.secret ? "var(--hot)" : "var(--line-strong)"}`,
                  color: a.secret ? "var(--hot)" : "var(--ink-faint)", cursor: "pointer",
                }}><Icon name={a.secret ? "eyeOff" : "eye"} size={13} /></button>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: a.secret ? "var(--hot)" : "var(--ink-dim)" }}>{a.text}</span>
              </div>
            ))}

            <div className="kicker dim nolead" style={{ margin: "20px 0 10px" }}>Voice guide</div>
            <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={4} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          {/* compiled prompt */}
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="kicker dim nolead">Compiled prompt {manualPrompt != null && <span style={{ color: "var(--accent)" }}>· edited</span>}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {editingPrompt
                  ? <Btn size="sm" variant="ok" icon="check" onClick={() => setEditingPrompt(false)}>Done</Btn>
                  : <Btn size="sm" variant="ghost" icon="edit" disabled={promptLocked} onClick={() => setEditingPrompt(true)}>Edit</Btn>}
                {manualPrompt != null && <Btn size="sm" variant="bare" onClick={() => { setManualPrompt(null); setEditingPrompt(false); }}>Reset</Btn>}
              </div>
            </div>
            {editingPrompt ? (
              <textarea autoFocus value={promptText} onChange={(e) => setManualPrompt(e.target.value)} style={{
                ...inp, flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.6, resize: "none", minHeight: 320,
              }} />
            ) : (
              <pre style={{
                flex: 1, margin: 0, overflow: "auto", padding: "13px 15px", background: "var(--bg)",
                border: `1px solid ${promptLocked ? "var(--sys)" : "var(--line-strong)"}`, color: "var(--ink-dim)",
                fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{promptText}</pre>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name={promptLocked ? "lock" : "sparkle"} size={12} style={{ color: promptLocked ? "var(--sys)" : "var(--ai)" }} />
              {promptLocked ? "Locked — recompilation won't change this without an unlock." : "Prepended to persona-aware generators, after the campaign style guide."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = {
  width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--ink)",
  padding: "9px 11px", fontSize: 13, fontFamily: "var(--font-body)", outline: "none",
};

Object.assign(window, { StudioScreen });
