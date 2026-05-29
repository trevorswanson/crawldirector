// screen-review.jsx — The Review Queue (signature screen)
const { useState: useStateR } = React;

const OP_VERB = {
  CREATE_ENTITY: "Create", UPDATE_ENTITY: "Update", DELETE_ENTITY: "Delete",
  CREATE_RELATIONSHIP: "Relate", UPDATE_RELATIONSHIP: "Update edge", DELETE_RELATIONSHIP: "Remove edge",
  CREATE_EVENT: "Log event", UPDATE_EVENT: "Update event", APPLY_EVENT_EFFECTS: "Apply effects",
};

/* one field diff row */
function DiffRow({ field, val, decision, onSet, dim }) {
  const blocked = val.blocked;
  const stale = val.stale;
  const accepted = decision === "ACCEPTED";
  const rejected = decision === "REJECTED";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 12, alignItems: "start",
      padding: "9px 12px", borderTop: "1px solid var(--line)",
      background: rejected ? "transparent" : blocked ? "color-mix(in srgb, var(--sys) 7%, transparent)" : "transparent",
      opacity: rejected ? 0.4 : 1,
    }}>
      <FieldKey>{field}</FieldKey>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0 }}>
        {val.from !== undefined && (
          <div style={{ color: "var(--del)", textDecoration: rejected ? "none" : "line-through", opacity: .8, marginBottom: 3, wordBreak: "break-word" }}>
            <span className="mono" style={{ fontSize: 10, opacity: .7, marginRight: 6 }}>−</span>{val.from}
          </div>
        )}
        <div style={{ color: blocked ? "var(--ink-faint)" : "var(--add)", wordBreak: "break-word" }}>
          <span className="mono" style={{ fontSize: 10, opacity: .7, marginRight: 6 }}>+</span>
          <span style={{ textDecoration: rejected ? "line-through" : "none", color: rejected ? "var(--ink-faint)" : (blocked ? "var(--ink-faint)" : "var(--ink)") }}>{val.to}</span>
        </div>
        {blocked && <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--sys)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em" }}>
          <Icon name="lock" size={11} />BLOCKED BY LOCK — UNLOCK TARGET TO APPLY</div>}
        {stale && !blocked && <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--hot)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em" }}>
          <Icon name="warn" size={11} />CANON CHANGED UNDER THIS — RESOLVE BELOW</div>}
      </div>
      {!blocked && (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onSet(accepted ? "PENDING" : "ACCEPTED")} title="Accept field" style={fieldBtn(accepted, "var(--ok)")}><Icon name="check" size={13} /></button>
          <button onClick={() => onSet(rejected ? "PENDING" : "REJECTED")} title="Reject field" style={fieldBtn(rejected, "var(--no)")}><Icon name="x" size={13} /></button>
        </div>
      )}
    </div>
  );
}
function fieldBtn(active, color) {
  return {
    width: 26, height: 26, display: "grid", placeItems: "center",
    background: active ? `color-mix(in srgb, ${color} 18%, transparent)` : "transparent",
    border: `1px solid ${active ? color : "var(--line-strong)"}`, color: active ? color : "var(--ink-faint)",
    cursor: "pointer",
  };
}

/* three-way conflict resolver for stale ops */
function ThreeWay({ tw }) {
  const [pick, setPick] = useStateR("merge");
  const cols = [
    { id: "base", label: "Base (v112)", text: tw.base, c: "var(--ink-faint)" },
    { id: "canon", label: "Current canon (v118)", text: tw.canon, c: "var(--ok)" },
    { id: "merge", label: "Proposed", text: tw.proposed, c: "var(--ai)" },
  ];
  return (
    <div style={{ margin: "12px", border: "1px solid color-mix(in srgb, var(--hot) 40%, var(--line))", background: "color-mix(in srgb, var(--hot) 5%, transparent)" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, color: "var(--hot)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" }}>
        <Icon name="warn" size={13} />Conflict on “{tw.field}” — choose a resolution
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--line)" }}>
        {cols.map((c) => (
          <button key={c.id} onClick={() => setPick(c.id)} style={{
            textAlign: "left", padding: "11px 12px", background: pick === c.id ? "var(--bg-3)" : "var(--bg-1)",
            border: "none", borderTop: `2px solid ${pick === c.id ? c.c : "transparent"}`, cursor: "pointer",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: c.c, marginBottom: 6 }}>
              {pick === c.id ? "● " : "○ "}{c.label}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-dim)" }}>{c.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* a single operation block */
function OpBlock({ op, decisions, setFieldDecision, opDecision, setOpDecision }) {
  const fields = Object.entries(op.patch);
  const isRejected = opDecision === "REJECTED";
  return (
    <div className="panel fade-in" style={{ marginBottom: 12, opacity: isRejected ? 0.55 : 1, borderColor: isRejected ? "var(--line)" : "var(--line-strong)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg-2)", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="hud-tag" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}>{OP_VERB[op.op] || op.op}</span>
          <span style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{op.targetType}</span>
          <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.label}</span>
          {op.locked && <span title="Target has locked fields" style={{ color: "var(--sys)", display: "inline-flex" }}><Icon name="lock" size={13} /></span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <Btn size="sm" variant={opDecision === "ACCEPTED" ? "ok" : "ghost"} icon="check" onClick={() => setOpDecision(op.id, opDecision === "ACCEPTED" ? "PENDING" : "ACCEPTED")}>Accept all</Btn>
          <Btn size="sm" variant={opDecision === "REJECTED" ? "no" : "ghost"} icon="x" onClick={() => setOpDecision(op.id, opDecision === "REJECTED" ? "PENDING" : "REJECTED")}>Reject</Btn>
        </div>
      </div>
      {fields.map(([f, val]) => (
        <DiffRow key={f} field={f} val={val}
          decision={isRejected ? "REJECTED" : (decisions[`${op.id}.${f}`] || (opDecision === "ACCEPTED" && !val.blocked ? "ACCEPTED" : "PENDING"))}
          onSet={(d) => setFieldDecision(op.id, f, d)} />
      ))}
      {op.threeWay && <ThreeWay tw={op.threeWay} />}
    </div>
  );
}

function ReviewScreen() {
  const [selId, setSelId] = useStateR(CHANGE_SETS[0].id);
  const [fieldDecisions, setFieldDecisions] = useStateR({});
  const [opDecisions, setOpDecisions] = useStateR({});
  const [resolved, setResolved] = useStateR({}); // changeSetId -> 'approved'|'rejected'
  const [filter, setFilter] = useStateR("ALL");

  const sets = CHANGE_SETS.filter((c) => filter === "ALL" || c.source === filter);
  const sel = CHANGE_SETS.find((c) => c.id === selId);

  const setFieldDecision = (opId, f, d) => setFieldDecisions((s) => ({ ...s, [`${opId}.${f}`]: d }));
  const setOpDecision = (opId, d) => setOpDecisions((s) => ({ ...s, [opId]: d }));

  const acceptedCount = sel ? sel.ops.reduce((n, op) => {
    if (opDecisions[op.id] === "REJECTED") return n;
    if (opDecisions[op.id] === "ACCEPTED") return n + Object.values(op.patch).filter((v) => !v.blocked).length;
    return n + Object.keys(op.patch).filter((f) => fieldDecisions[`${op.id}.${f}`] === "ACCEPTED").length;
  }, 0) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "324px minmax(0,1fr)", height: "100%" }}>
      {/* LEFT: queue list */}
      <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Review Queue · {CHANGE_SETS.length} sets</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["ALL", "AI", "PLAYER", "IMPORT"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", padding: "4px 9px",
                background: filter === f ? "var(--accent)" : "transparent", color: filter === f ? "var(--accent-ink)" : "var(--ink-dim)",
                border: `1px solid ${filter === f ? "var(--accent)" : "var(--line-strong)"}`, textTransform: "uppercase",
              }}>{f}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {sets.map((c) => {
            const done = resolved[c.id];
            return (
              <button key={c.id} onClick={() => setSelId(c.id)} style={{
                display: "block", width: "100%", textAlign: "left", padding: "13px 16px",
                background: c.id === selId ? "var(--bg-3)" : "transparent",
                borderLeft: `2px solid ${c.id === selId ? "var(--accent)" : "transparent"}`,
                borderBottom: "1px solid var(--line)", borderTop: "none", borderRight: "none",
                opacity: done ? 0.5 : 1, cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <SourceBadge source={c.source} small />
                  <StatusPill status={done === "approved" ? "CANON" : done === "rejected" ? "REJECTED" : c.status} />
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)" }}>{c.run.at}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 5 }}>{c.title}</div>
                <div style={{ display: "flex", gap: 10, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>
                  <span>{c.stats.entities} ent</span><span>{c.stats.rels} rel</span><span>{c.stats.events} evt</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {sel && (
          <React.Fragment>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)", background: "var(--bg-1)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <SourceBadge source={sel.source} />
                    <StatusPill status={resolved[sel.id] === "approved" ? "CANON" : resolved[sel.id] === "rejected" ? "REJECTED" : sel.status} />
                  </div>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 600 }}>{sel.title}</h2>
                  <p style={{ margin: "7px 0 0", color: "var(--ink-dim)", fontSize: 13, maxWidth: 720, lineHeight: 1.5 }}>{sel.summary}</p>
                </div>
              </div>

              {/* provenance line */}
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {sel.run.generator && <span className="hud-tag"><Icon name="sparkle" size={12} style={{ color: "var(--ai)" }} />{sel.run.generator}</span>}
                {sel.run.model && <span className="hud-tag">{sel.run.model}</span>}
                {sel.run.persona && <span className="hud-tag" style={{ color: "var(--ai)", borderColor: "color-mix(in srgb, var(--ai) 40%, transparent)" }}>persona {sel.run.persona}</span>}
                {sel.run.by && <span className="hud-tag">{sel.run.by}</span>}
                <span className="hud-tag">base {sel.base}</span>
                {sel.run.cost && <span className="hud-tag"><Icon name="coin" size={12} />{sel.run.cost}</span>}
              </div>

              {/* batch actions */}
              <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Btn variant="ok" icon="check" onClick={() => setResolved((r) => ({ ...r, [sel.id]: "approved" }))}>Approve {acceptedCount} accepted</Btn>
                <Btn variant="primary" icon="lock" onClick={() => setResolved((r) => ({ ...r, [sel.id]: "approved" }))}>Approve &amp; lock</Btn>
                <Btn variant="ghost" onClick={() => {
                  const next = {}; sel.ops.forEach((op) => { if (!op.stale) next[op.id] = "ACCEPTED"; }); setOpDecisions((s) => ({ ...s, ...next }));
                }}>Accept all non-conflicting</Btn>
                <Btn variant="no" icon="x" onClick={() => setResolved((r) => ({ ...r, [sel.id]: "rejected" }))}>Reject run</Btn>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>
                  {sel.stats.entities} entities · {sel.stats.rels} relationships · {sel.stats.events} events
                </span>
              </div>
            </div>

            {/* operations */}
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 22px" }}>
              {resolved[sel.id] ? (
                <div style={{ display: "grid", placeItems: "center", height: "100%", textAlign: "center", color: "var(--ink-faint)" }}>
                  <div>
                    <div style={{ color: resolved[sel.id] === "approved" ? "var(--ok)" : "var(--no)", marginBottom: 12 }}>
                      <Icon name={resolved[sel.id] === "approved" ? "check" : "x"} size={40} />
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)" }}>
                      {resolved[sel.id] === "approved" ? "Committed to canon" : "Run rejected"}
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 6, maxWidth: 360 }}>
                      {resolved[sel.id] === "approved"
                        ? "Accepted operations applied atomically. Provenance written and retained."
                        : "Retained for history — never hard-deleted. You can reopen it from the audit log."}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <Btn variant="ghost" onClick={() => setResolved((r) => { const n = { ...r }; delete n[sel.id]; return n; })}>Reopen</Btn>
                    </div>
                  </div>
                </div>
              ) : (
                sel.ops.map((op) => (
                  <OpBlock key={op.id} op={op} decisions={fieldDecisions} setFieldDecision={setFieldDecision}
                    opDecision={opDecisions[op.id] || "PENDING"} setOpDecision={setOpDecision} />
                ))
              )}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ReviewScreen });
