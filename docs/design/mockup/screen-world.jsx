// screen-world.jsx — World Browser + Entity Detail
const { useState: useStateW, useMemo: useMemoW } = React;

const TYPE_COLOR = (t) => (window.NODE_TYPE_COLOR && NODE_TYPE_COLOR[t]) ||
  ({ MOB_TYPE: "var(--del)", TITLE: "var(--player)", SKILL: "var(--player)", ITEM: "var(--import)" }[t]) || "var(--ink)";

function TypeDot({ t, size = 9 }) {
  return <span style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", background: TYPE_COLOR(t), display: "inline-block" }}></span>;
}

/* ---------------------------- BROWSER ---------------------------- */
function Browser({ entities, onOpen, onCreateStub }) {
  const [q, setQ] = useStateW("");
  const [types, setTypes] = useStateW(() => new Set());
  const [src, setSrc] = useStateW("ALL");
  const [stat, setStat] = useStateW("ALL");
  const [aiUnedited, setAiUnedited] = useStateW(false);
  const [lockedOnly, setLockedOnly] = useStateW(false);
  const [creating, setCreating] = useStateW(false);
  const [newName, setNewName] = useStateW("");
  const [newType, setNewType] = useStateW("NPC");

  const counts = useMemoW(() => {
    const c = {}; entities.forEach((e) => { c[e.type] = (c[e.type] || 0) + 1; }); return c;
  }, [entities]);

  const results = entities.filter((e) => {
    if (q && !(`${e.name} ${e.summary} ${e.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (types.size && !types.has(e.type)) return false;
    if (src !== "ALL" && e.source !== src) return false;
    if (stat !== "ALL" && e.status !== stat) return false;
    if (aiUnedited && !(e.aiOrigin && e.neverEdited)) return false;
    if (lockedOnly && !e.locked) return false;
    return true;
  });

  const toggleType = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const chip = (val, cur, set) => ({
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".06em", padding: "4px 9px", textTransform: "uppercase", cursor: "pointer",
    background: val === cur ? "var(--accent)" : "transparent", color: val === cur ? "var(--accent-ink)" : "var(--ink-dim)",
    border: `1px solid ${val === cur ? "var(--accent)" : "var(--line-strong)"}`,
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "248px minmax(0,1fr)", height: "100%" }}>
      {/* facets */}
      <div style={{ borderRight: "1px solid var(--line)", overflowY: "auto", background: "var(--bg-1)", padding: "16px 16px 40px" }}>
        <div className="kicker dim nolead" style={{ marginBottom: 10 }}>Entity type</div>
        {ENTITY_TYPES.map((t) => (
          <button key={t} onClick={() => toggleType(t)} disabled={!counts[t]} style={{
            display: "flex", width: "100%", alignItems: "center", gap: 9, padding: "6px 8px", marginBottom: 2, textAlign: "left",
            background: types.has(t) ? "var(--bg-3)" : "transparent", border: "1px solid transparent",
            borderColor: types.has(t) ? "var(--line-strong)" : "transparent", cursor: counts[t] ? "pointer" : "default", opacity: counts[t] ? 1 : 0.35,
          }}>
            <TypeDot t={t} />
            <span style={{ fontSize: 12.5, color: types.has(t) ? "var(--ink)" : "var(--ink-dim)", flex: 1 }}>{t.replace("_", " ")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>{counts[t] || 0}</span>
          </button>
        ))}

        <div className="kicker dim nolead" style={{ margin: "20px 0 9px" }}>Source</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {["ALL", "DM", "AI", "PLAYER", "IMPORT"].map((s) => <button key={s} onClick={() => setSrc(s)} style={chip(s, src, setSrc)}>{s}</button>)}
        </div>

        <div className="kicker dim nolead" style={{ margin: "20px 0 9px" }}>Status</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {["ALL", "CANON", "PENDING", "LOCKED"].map((s) => <button key={s} onClick={() => setStat(s)} style={chip(s, stat, setStat)}>{s}</button>)}
        </div>

        <div className="kicker dim nolead" style={{ margin: "20px 0 9px" }}>Provenance filters</div>
        <button onClick={() => setAiUnedited((v) => !v)} style={facetToggle(aiUnedited, "var(--ai)")}>
          <Icon name={aiUnedited ? "check" : "sparkle"} size={13} />AI-origin &amp; never edited
        </button>
        <button onClick={() => setLockedOnly((v) => !v)} style={facetToggle(lockedOnly, "var(--sys)")}>
          <Icon name={lockedOnly ? "check" : "lock"} size={13} />Locked only
        </button>
      </div>

      {/* results */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "center", background: "var(--bg-1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--bg)", border: "1px solid var(--line-strong)", padding: "8px 12px", flex: 1, maxWidth: 420 }}>
            <Icon name="search" size={15} style={{ color: "var(--ink-faint)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entities, tags, summaries…" style={{ flex: 1, background: "transparent", border: "none", color: "var(--ink)", fontSize: 13, outline: "none" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>{results.length} / {entities.length}</span>
          <Btn variant="primary" icon="plus" size="sm" onClick={() => setCreating((v) => !v)} style={{ marginLeft: "auto" }}>Quick-create stub</Btn>
        </div>

        {creating && (
          <div className="fade-in" style={{ padding: "13px 22px", borderBottom: "1px solid var(--line)", background: "var(--bg-2)", display: "flex", gap: 10, alignItems: "center" }}>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New entity name…" style={{ flex: 1, maxWidth: 320, background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "8px 11px", fontSize: 13, outline: "none" }} />
            <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "8px 11px", fontSize: 13 }}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <Btn variant="ok" icon="check" size="sm" disabled={!newName.trim()} onClick={() => { onCreateStub(newName.trim(), newType); setNewName(""); setCreating(false); }}>Create stub</Btn>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>creates a thin reference · flesh out with AI later</span>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {results.map((e) => (
              <button key={e.id} onClick={() => onOpen(e.id)} className="panel" style={{
                textAlign: "left", padding: "14px 15px", cursor: "pointer", borderColor: "var(--line)",
                display: "flex", flexDirection: "column", gap: 9, transition: "border-color .15s, background .15s",
              }}
                onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = "var(--line-strong)"; ev.currentTarget.style.background = "var(--bg-2)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = "var(--line)"; ev.currentTarget.style.background = "var(--bg-1)"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <TypeDot t={e.type} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)", letterSpacing: ".08em" }}>{e.type.replace("_", " ")}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    {e.locked && <Icon name="lock" size={12} style={{ color: "var(--sys)" }} />}
                    <SourceBadge source={e.source} small />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>{e.name}</span>
                  {e.stub && <span className="hud-tag" style={{ fontSize: 8.5, padding: "1px 5px", color: "var(--ink-faint)" }}>STUB</span>}
                  {e.aiOrigin && e.neverEdited && <span title="AI-origin, never edited" style={{ color: "var(--ai)", display: "inline-flex" }}><Icon name="sparkle" size={12} /></span>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.5, flex: 1 }}>{e.summary}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusPill status={e.status} />
                  {e.floor && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)" }}>{e.floor}</span>}
                </div>
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <div style={{ display: "grid", placeItems: "center", height: 240, color: "var(--ink-faint)", textAlign: "center" }}>
              <div><Icon name="search" size={36} style={{ opacity: .4 }} /><div style={{ marginTop: 12, fontSize: 13 }}>No entities match. Adjust filters or quick-create a stub.</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function facetToggle(active, color) {
  return {
    display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "9px 10px", marginBottom: 7, textAlign: "left", cursor: "pointer",
    background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
    border: `1px solid ${active ? color : "var(--line-strong)"}`, color: active ? color : "var(--ink-dim)",
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".02em",
  };
}

/* --------------------------- ENTITY DETAIL ----------------------- */
function EntityDetail({ entity, byId, onOpen, onBack }) {
  const e = entity;
  const [lockedFields, setLockedFields] = useStateW(() => new Set(e.fields.filter((f) => f.locked).map((f) => f.k)));
  const [allLocked, setAllLocked] = useStateW(e.locked);
  const [dismissAi, setDismissAi] = useStateW(false);
  const conns = connectionsFor(e.id);
  const toggleField = (k) => setLockedFields((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 304px", height: "100%" }}>
      <div style={{ overflowY: "auto", minWidth: 0 }}>
        {/* back bar */}
        <div style={{ padding: "12px 26px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "var(--bg)", zIndex: 2 }}>
          <button onClick={onBack} className="hud-tag" style={{ cursor: "pointer" }}><Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} />World Browser</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>/ {e.type.replace("_", " ")} / {e.name}</span>
        </div>

        <div style={{ padding: "24px 26px", maxWidth: 760 }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <TypeDot t={e.type} size={11} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: ".1em", textTransform: "uppercase" }}>{e.type.replace("_", " ")}</span>
            <StatusPill status={e.status} />
            {e.stub && <span className="hud-tag" style={{ fontSize: 9, padding: "1px 6px", color: "var(--ink-faint)" }}>STUB</span>}
          </div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, letterSpacing: ".01em" }}>{e.name}</h1>
          <p style={{ margin: "10px 0 0", fontSize: 15, color: "var(--ink-dim)", lineHeight: 1.4 }}>{e.summary}</p>

          {/* AI-origin marker (dismissible) */}
          {e.aiOrigin && e.neverEdited && !dismissAi && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", border: "1px solid color-mix(in srgb, var(--ai) 40%, transparent)", background: "color-mix(in srgb, var(--ai) 8%, transparent)", color: "var(--ai)", fontSize: 12.5 }}>
              <Icon name="sparkle" size={15} />
              <span style={{ flex: 1, color: "var(--ink-dim)" }}>This entity is <b style={{ color: "var(--ai)" }}>AI-generated and never edited</b>. Review or edit it to make it your own.</span>
              <button onClick={() => setDismissAi(true)} style={{ background: "transparent", border: "none", color: "var(--ink-faint)" }}><Icon name="x" size={14} /></button>
            </div>
          )}

          {/* description */}
          {e.description && (
            <div style={{ marginTop: 22 }}>
              <div className="kicker dim nolead" style={{ marginBottom: 10 }}>Description</div>
              <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.7, textWrap: "pretty" }}>{e.description}</p>
            </div>
          )}

          {/* structured fields */}
          {e.fields.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Fields</div>
              <div className="panel">
                {e.fields.map((f, i) => {
                  const flocked = lockedFields.has(f.k) || allLocked;
                  return (
                    <div key={f.k} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr) auto", gap: 14, alignItems: "center", padding: "11px 14px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                      <FieldKey>{f.k}</FieldKey>
                      <span style={{ fontSize: 13.5, color: "var(--ink)", minWidth: 0 }}>{f.v}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        {f.ai && <span title="AI-generated field" style={{ color: "var(--ai)", display: "inline-flex" }}><Icon name="sparkle" size={12} /></span>}
                        <button onClick={() => toggleField(f.k)} title={flocked ? "Locked field — click to unlock" : "Click to lock field"} style={{
                          display: "inline-flex", alignItems: "center", gap: 4, background: "transparent",
                          border: `1px solid ${flocked ? "var(--sys)" : "var(--line)"}`, color: flocked ? "var(--sys)" : "var(--ink-faint)", padding: "3px 5px", cursor: "pointer",
                        }}><Icon name={flocked ? "lock" : "unlock"} size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* timeline */}
          {e.timeline.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div className="kicker dim nolead" style={{ marginBottom: 14 }}>Timeline · {e.timeline.length} events</div>
              <div style={{ position: "relative", paddingLeft: 22 }}>
                <div style={{ position: "absolute", left: 5, top: 4, bottom: 4, width: 1, background: "var(--line-strong)" }}></div>
                {e.timeline.map((t, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                    <span style={{ position: "absolute", left: -22, top: 4, width: 11, height: 11, borderRadius: "50%", background: "var(--bg)", border: `2px solid ${PROV[t.source].color}` }}></span>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>{t.time}</span>
                      <span className="hud-tag" style={{ fontSize: 8.5, padding: "1px 5px" }}>{t.role}</span>
                      <SourceBadge source={t.source} small />
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--ink)" }}>{t.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {e.stub && (
            <div style={{ marginTop: 26 }}>
              <Btn variant="primary" icon="sparkle">Flesh out with AI</Btn>
              <span style={{ marginLeft: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>generates a full entity → Review Queue</span>
            </div>
          )}
        </div>
      </div>

      {/* right: connections + provenance + controls */}
      <div style={{ borderLeft: "1px solid var(--line)", overflowY: "auto", background: "var(--bg-1)" }}>
        {/* controls */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Controls</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <LockChip locked={allLocked} onToggle={() => setAllLocked((v) => !v)} />
            <Btn size="sm" variant="ghost" icon="edit">Edit</Btn>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Visibility</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["DM_ONLY", "SHARED_WITH_PLAYERS", "PLAYER_FACING"].map((v) => (
              <div key={v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: e.visibility === v ? "var(--ink)" : "var(--ink-faint)" }}>
                <Icon name={e.visibility === v ? "eye" : "eyeOff"} size={13} style={{ color: e.visibility === v ? "var(--ok)" : "var(--ink-faint)" }} />
                {v.replace(/_/g, " ").toLowerCase()}
              </div>
            ))}
          </div>
        </div>

        {/* connections */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Connections · {conns.length}</div>
          {conns.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No relationships yet.</div>}
          {conns.map((c, i) => {
            const other = byId(c.other);
            return (
              <button key={i} onClick={() => other && onOpen(c.other)} disabled={!other} style={{
                display: "block", width: "100%", textAlign: "left", padding: "9px 10px", marginBottom: 6,
                background: "transparent", border: "1px solid var(--line)", cursor: other ? "pointer" : "default",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <Icon name="arrowRight" size={11} style={{ color: "var(--ink-faint)", transform: c.dir === "out" ? "none" : "rotate(180deg)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: c.secret ? "var(--hot)" : "var(--accent)" }}>{c.type}{c.secret ? " · secret" : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <TypeDot t={other ? other.type : "NPC"} size={7} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{other ? other.name : c.other}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* provenance */}
        <div style={{ padding: "16px 18px" }}>
          <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Provenance</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <ProvRow k="Origin"><SourceBadge source={e.source} small /> <span style={{ color: "var(--ink-dim)" }}>{e.prov.author}</span></ProvRow>
            <ProvRow k="Created">{e.prov.created}</ProvRow>
            {e.prov.model && <ProvRow k="Model"><span className="mono" style={{ color: "var(--ai)" }}>{e.prov.model}</span></ProvRow>}
            <ProvRow k="Approved by">{e.prov.approvedBy ? `${e.prov.approvedBy} · ${e.prov.approvedAt}` : <span style={{ color: "var(--accent)" }}>pending review</span>}</ProvRow>
            <ProvRow k="Last change">{e.prov.lastSet}</ProvRow>
          </div>
          <div style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", lineHeight: 1.6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            Provenance is permanent — retained through approval. You can always answer where this came from and who approved it.
          </div>
        </div>
      </div>
    </div>
  );
}
function ProvRow({ k, children }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", letterSpacing: ".06em", textTransform: "uppercase", width: 92, flexShrink: 0 }}>{k}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", color: "var(--ink-dim)" }}>{children}</span>
    </div>
  );
}

/* ----------------------------- SHELL ----------------------------- */
function WorldScreen() {
  const [extra, setExtra] = useStateW([]);
  const [sel, setSel] = useStateW(null);
  const all = [...ENTITIES, ...extra];
  const byId = (id) => all.find((x) => x.id === id);

  const createStub = (name, type) => {
    const id = "stub-" + (extra.length + 1);
    setExtra((x) => [{
      id, name, type, floor: null, faction: null, tags: ["stub"], status: "DRAFT", source: "DM", locked: false,
      visibility: "DM_ONLY", stub: true, aiOrigin: false, neverEdited: false,
      summary: "Thin reference — flesh out with AI or by hand.", description: "",
      fields: [], prov: { author: "trevor (DM)", created: "just now", model: null, approvedBy: "trevor", approvedAt: "just now", lastSet: "DM stub (auto-approved)" }, timeline: [],
    }, ...x]);
  };

  const selEntity = sel ? byId(sel) : null;
  return selEntity
    ? <EntityDetail entity={selEntity} byId={byId} onOpen={setSel} onBack={() => setSel(null)} />
    : <Browser entities={all} onOpen={setSel} onCreateStub={createStub} />;
}

Object.assign(window, { WorldScreen });
