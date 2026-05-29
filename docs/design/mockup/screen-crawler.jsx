// screen-crawler.jsx — player-facing in-fiction System UI (tablet/desktop dashboard)
const { useState: useStateC } = React;

function Bar({ label, c, m, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5, marginBottom: 4, color: "var(--ink-dim)", letterSpacing: ".06em" }}>
        <span>{label}</span><span style={{ color }}>{c} / {m}</span>
      </div>
      <div style={{ height: 7, background: "rgba(0,0,0,.4)", border: "1px solid var(--line)" }}>
        <div style={{ height: "100%", width: `${(c / m) * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }}></div>
      </div>
    </div>
  );
}

const FEED_STYLE = {
  ANNOUNCE: { c: "var(--accent)", t: "ANNOUNCEMENT" },
  ALERT: { c: "var(--hot)", t: "ALERT" },
  PERSONAL: { c: "var(--ai)", t: "PERSONAL" },
  PATCH: { c: "var(--sys)", t: "PATCH NOTE" },
};

function CrawlerScreen() {
  const s = CRAWLER_SHEET;
  const [tab, setTab] = useStateC("feed");
  const [suggesting, setSuggesting] = useStateC(false);
  const [suggested, setSuggested] = useStateC(false);

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "radial-gradient(120% 80% at 50% 0%, var(--bg-1), var(--bg))" }}>
      {/* in-fiction System banner */}
      <div style={{ borderBottom: "1px solid var(--line)", background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent)", padding: "14px 26px", display: "flex", alignItems: "center", gap: 14 }}>
        <span className="live-dot"></span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: ".18em", fontSize: 13, color: "var(--accent)" }}>THE SYSTEM</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>crawler interface · live broadcast feed</span>
        <span className="hud-tag" style={{ marginLeft: "auto" }}><Icon name="eye" size={12} />player view · {s.fame} watching</span>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 26px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 22, alignItems: "start" }}>
        {/* LEFT: crawler sheet */}
        <div className="panel bracket" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{ width: 64, height: 64, flexShrink: 0, border: "1px solid var(--accent)", display: "grid", placeItems: "center", background: "var(--bg-3)", color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700 }}>D</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{s.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>{s.crawlerId} · LVL {s.level}</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 3 }}>{s.species} · {s.klass}</div>
            </div>
          </div>

          <Bar label="HP" c={s.hp.c} m={s.hp.m} color="var(--hot)" />
          <Bar label="MP" c={s.mp.c} m={s.mp.m} color="var(--sys)" />
          <Bar label="STAMINA" c={s.stamina.c} m={s.stamina.m} color="var(--ok)" />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--line)", margin: "16px 0", border: "1px solid var(--line)" }}>
            {s.stats.map((st) => (
              <div key={st.k} style={{ background: "var(--bg-2)", padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)", letterSpacing: ".1em" }}>{st.k}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: st.v >= 70 ? "var(--accent)" : "var(--ink)" }}>{st.v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)" }}><Icon name="coin" size={15} />{s.gold}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-dim)" }}>Floor {s.floor}</span>
          </div>

          {/* loot boxes */}
          <div className="kicker dim nolead" style={{ margin: "16px 0 10px" }}>Loot boxes</div>
          <div style={{ display: "flex", gap: 8 }}>
            {s.lootboxes.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", padding: "12px 6px", border: `1px solid ${b.opened ? "var(--line)" : "var(--accent)"}`, background: b.opened ? "transparent" : "color-mix(in srgb, var(--accent) 8%, transparent)", opacity: b.opened ? 0.45 : 1 }}>
                <Icon name="layers" size={20} style={{ color: b.opened ? "var(--ink-faint)" : "var(--accent)" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, marginTop: 5, color: "var(--ink-dim)", letterSpacing: ".06em" }}>{b.tier}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--ink-faint)" }}>{b.opened ? "OPENED" : "SEALED"}</div>
              </div>
            ))}
          </div>

          {/* player suggestion (the only write players get) */}
          <div style={{ marginTop: 18 }}>
            {!suggesting && !suggested && <Btn variant="ghost" icon="edit" size="sm" onClick={() => setSuggesting(true)}>Suggest a bio edit</Btn>}
            {suggesting && (
              <div className="fade-in">
                <textarea autoFocus rows={3} placeholder="Propose a change to your bio…" style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", fontSize: 12.5, fontFamily: "var(--font-body)", outline: "none", resize: "vertical" }} />
                <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                  <Btn variant="primary" size="sm" icon="arrowRight" onClick={() => { setSuggesting(false); setSuggested(true); }}>Submit suggestion</Btn>
                  <Btn variant="bare" size="sm" onClick={() => setSuggesting(false)}>Cancel</Btn>
                </div>
              </div>
            )}
            {suggested && (
              <div className="fade-in" style={{ display: "flex", alignItems: "flex-start", gap: 9, color: "var(--player)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "10px 12px", border: "1px solid color-mix(in srgb, var(--player) 40%, transparent)", background: "color-mix(in srgb, var(--player) 8%, transparent)", lineHeight: 1.5 }}>
                <Icon name="check" size={14} style={{ flexShrink: 0, marginTop: 1 }} />Sent to your DM as a suggestion. It never changes canon directly.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: feed / titles / known world */}
        <div>
          {/* tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", marginBottom: 18 }}>
            {[["feed", "System Feed"], ["recap", "Recap"], ["titles", "Titles & Achievements"], ["known", "Known World"]].map(([id, t]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: "9px 16px", background: "transparent", border: "none", borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`,
                color: tab === id ? "var(--ink)" : "var(--ink-faint)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {tab === "feed" && (
            <div className="fade-in">
              {SYSTEM_FEED.map((f, i) => {
                const st = FEED_STYLE[f.kind];
                return (
                  <div key={i} className="panel" style={{ padding: "14px 16px", marginBottom: 10, borderLeft: `2px solid ${st.c}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: st.c, padding: "2px 7px", border: `1px solid ${st.c}`, background: `color-mix(in srgb, ${st.c} 10%, transparent)` }}>{st.t}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", marginLeft: "auto" }}>{f.time}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>{f.text}</div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "recap" && (
            <div className="fade-in panel bracket" style={{ padding: "26px 30px" }}>
              <div className="kicker" style={{ marginBottom: 14 }}>Recap · in the show's voice</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, margin: "0 0 16px", fontStyle: "italic" }}>{RECAP.title}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ink-dim)", margin: 0, textWrap: "pretty" }}>{RECAP.body}</p>
            </div>
          )}

          {tab === "titles" && (
            <div className="fade-in">
              <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Titles</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                {s.titles.map((t) => (
                  <span key={t} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, padding: "7px 13px", border: "1px solid var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>{t}</span>
                ))}
              </div>
              <div className="kicker dim nolead" style={{ marginBottom: 12 }}>Achievements</div>
              {s.achievements.map((a) => (
                <div key={a.name} className="panel" style={{ padding: "13px 15px", marginBottom: 9, display: "flex", gap: 13, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, flexShrink: 0, border: "1px solid var(--accent)", display: "grid", placeItems: "center", color: "var(--accent)" }}><Icon name="sparkle" size={20} /></div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 2 }}>{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "known" && (
            <div className="fade-in">
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16, padding: "11px 14px", border: "1px solid var(--line-strong)", background: "var(--bg-2)", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-dim)" }}>
                <Icon name="eye" size={14} style={{ color: "var(--ok)" }} />Only what your DM has revealed. Secrets and DM-only data never reach this view.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { n: "Floor 9 · Larracos", t: "FLOOR", d: "Cleared the eastern approach. The castle still stands." },
                  { n: "The Grull Legion", t: "FACTION", d: "An army you've seen on the walls. Standing rising." },
                  { n: "Mordecai", t: "NPC", d: "Your guide. He says he's on your side." },
                  { n: "The Maestro", t: "NPC", d: "A host. Smiles too much. Don't trust the smile." },
                ].map((e) => (
                  <div key={e.n} className="panel" style={{ padding: "13px 15px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: NODE_TYPE_COLOR[e.t] }}></span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)", letterSpacing: ".08em" }}>{e.t}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{e.n}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>{e.d}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CrawlerScreen });
