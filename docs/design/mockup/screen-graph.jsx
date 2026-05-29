// screen-graph.jsx — force-directed relationship graph
const { useState: useStateG, useRef: useRefG, useEffect: useEffectG } = React;

const W = 1200, H = 820;
const EDGE_COLOR = (disp) => (disp > 20 ? "var(--ok)" : disp < -20 ? "var(--hot)" : "var(--ink-faint)");

function GraphScreen() {
  const seeded = useRefG(GRAPH_NODES.map((n) => ({ ...n, px: n.x * W, py: n.y * H, vx: 0, vy: 0, pinned: false })));
  const nodesRef = seeded;
  const [, force] = useStateG(0);
  const [view, setView] = useStateG({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useStateG(null);
  const [sel, setSel] = useStateG("carl");
  const [types, setTypes] = useStateG(() => new Set(Object.keys(NODE_TYPE_COLOR)));
  const [showSecret, setShowSecret] = useStateG(true);
  const drag = useRefG(null);
  const pan = useRefG(null);
  const svgRef = useRefG(null);

  const visibleNode = (n) => types.has(n.type);
  const visibleEdge = (e) => (showSecret || !e.secret) && types.has(byId(e.s).type) && types.has(byId(e.t).type);
  function byId(id) { return nodesRef.current.find((n) => n.id === id); }

  // force simulation loop
  useEffectG(() => {
    let raf, alpha = 1;
    const step = () => {
      const ns = nodesRef.current;
      // repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          let dx = a.px - b.px, dy = a.py - b.py;
          let d2 = dx * dx + dy * dy || 1; let d = Math.sqrt(d2);
          const rep = 9000 / d2; const fx = (dx / d) * rep, fy = (dy / d) * rep;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // springs
      GRAPH_EDGES.forEach((e) => {
        const a = byId(e.s), b = byId(e.t);
        let dx = b.px - a.px, dy = b.py - a.py; let d = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 190; const k = 0.012 * (d - target);
        const fx = (dx / d) * k, fy = (dy / d) * k;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // centering + integrate
      ns.forEach((n) => {
        n.vx += (W / 2 - n.px) * 0.0016; n.vy += (H / 2 - n.py) * 0.0016;
        if (!n.pinned && drag.current !== n.id) {
          n.vx *= 0.86; n.vy *= 0.86;
          n.px += n.vx * alpha; n.py += n.vy * alpha;
        } else { n.vx = 0; n.vy = 0; }
      });
      alpha *= 0.992; if (alpha < 0.02) alpha = 0.02;
      force((x) => x + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // pointer handlers (screen → world)
  const toWorld = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width * W;
    const sy = (clientY - rect.top) / rect.height * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };
  const onPointerDownNode = (e, id) => { e.stopPropagation(); drag.current = id; const n = byId(id); n.pinned = true; setSel(id); };
  const onPointerDownBg = (e) => { pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; };
  const onPointerMove = (e) => {
    if (drag.current) { const w = toWorld(e.clientX, e.clientY); const n = byId(drag.current); n.px = w.x; n.py = w.y; n.vx = 0; n.vy = 0; }
    else if (pan.current) { setView((v) => ({ ...v, x: pan.current.vx + (e.clientX - pan.current.x), y: pan.current.vy + (e.clientY - pan.current.y) })); }
  };
  const onPointerUp = () => { drag.current = null; pan.current = null; };
  const onWheel = (e) => { const f = e.deltaY < 0 ? 1.12 : 0.89; setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.4, v.k * f)) })); };

  const neighbors = (id) => {
    const s = new Set();
    GRAPH_EDGES.forEach((e) => { if (e.s === id) s.add(e.t); if (e.t === id) s.add(e.s); });
    return s;
  };
  const active = hover || sel;
  const nbrs = active ? neighbors(active) : null;
  const selNode = byId(sel);
  const selEdges = GRAPH_EDGES.filter((e) => e.s === sel || e.t === sel);

  const toggleType = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", height: "100%" }}>
      <div style={{ position: "relative", overflow: "hidden", minWidth: 0 }}>
        {/* toolbar */}
        <div style={{ position: "absolute", zIndex: 5, top: 14, left: 16, right: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", pointerEvents: "none" }}>
          <div className="kicker" style={{ pointerEvents: "auto" }}>Relationship Graph</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap", pointerEvents: "auto" }}>
            {Object.keys(NODE_TYPE_COLOR).map((t) => (
              <button key={t} onClick={() => toggleType(t)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".06em",
                padding: "3px 8px", textTransform: "uppercase", cursor: "pointer",
                background: types.has(t) ? "var(--bg-2)" : "transparent", color: types.has(t) ? "var(--ink-dim)" : "var(--ink-faint)",
                border: `1px solid ${types.has(t) ? "var(--line-strong)" : "var(--line)"}`, opacity: types.has(t) ? 1 : 0.5,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: NODE_TYPE_COLOR[t] }}></span>{t}
              </button>
            ))}
            <button onClick={() => setShowSecret((v) => !v)} title="Toggle secret edges" style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "3px 8px",
              textTransform: "uppercase", cursor: "pointer", background: "var(--bg-2)",
              color: showSecret ? "var(--hot)" : "var(--ink-faint)", border: `1px solid ${showSecret ? "color-mix(in srgb, var(--hot) 40%, transparent)" : "var(--line)"}`,
            }}><Icon name={showSecret ? "eye" : "eyeOff"} size={11} />secret</button>
          </div>
        </div>

        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
          style={{ width: "100%", height: "100%", display: "block", cursor: pan.current ? "grabbing" : "grab", background: "radial-gradient(120% 100% at 50% 0%, var(--bg-1), var(--bg))" }}
          onPointerDown={onPointerDownBg} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}>
          <defs>
            <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--ink-faint)" /></marker>
            <pattern id="gridp" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="rgba(240,230,200,0.035)" strokeWidth="1" /></pattern>
          </defs>
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#gridp)" transform={`translate(${view.x},${view.y}) scale(${view.k})`} />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* edges */}
            {GRAPH_EDGES.map((e, i) => {
              if (!visibleEdge(e)) return null;
              const a = byId(e.s), b = byId(e.t);
              const dim = active && !(e.s === active || e.t === active);
              return (
                <g key={i} style={{ opacity: dim ? 0.12 : 1, transition: "opacity .2s" }}>
                  <line x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                    stroke={e.secret ? "var(--hot)" : EDGE_COLOR(e.disp)} strokeWidth={Math.max(1, Math.abs(e.disp) / 45 + 0.7)}
                    strokeDasharray={e.secret ? "5 4" : "none"} markerEnd="url(#arrow)" opacity={0.7} />
                  {(active === e.s || active === e.t) && (
                    <text x={(a.px + b.px) / 2} y={(a.py + b.py) / 2 - 4} fontFamily="var(--font-mono)" fontSize="10"
                      fill={e.secret ? "var(--hot)" : "var(--ink-dim)"} textAnchor="middle" style={{ pointerEvents: "none" }}>{e.type}</text>
                  )}
                </g>
              );
            })}
            {/* nodes */}
            {nodesRef.current.map((n) => {
              if (!visibleNode(n)) return null;
              const isActive = active === n.id;
              const isNbr = nbrs && nbrs.has(n.id);
              const dim = active && !isActive && !isNbr;
              const c = NODE_TYPE_COLOR[n.type] || "var(--ink)";
              return (
                <g key={n.id} transform={`translate(${n.px},${n.py})`} style={{ cursor: "pointer", opacity: dim ? 0.25 : 1, transition: "opacity .2s" }}
                  onPointerDown={(e) => onPointerDownNode(e, n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                  <circle r={n.r + 4} fill="none" stroke={c} strokeWidth={isActive ? 2 : 0} opacity={0.5} />
                  <circle r={n.r} fill="var(--bg-1)" stroke={c} strokeWidth={2} />
                  <circle r={n.r - 5} fill={c} opacity={n.type === "NPC" ? 0.18 : 0.32} />
                  {n.pinned && <circle r={3} cx={n.r - 4} cy={-(n.r - 4)} fill="var(--accent)" />}
                  <text y={n.r + 15} textAnchor="middle" fontFamily="var(--font-body)" fontSize="13" fontWeight="600"
                    fill={isActive ? "var(--ink)" : "var(--ink-dim)"} style={{ pointerEvents: "none" }}>{n.label}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* zoom + hint */}
        <div style={{ position: "absolute", bottom: 14, left: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", border: "1px solid var(--line-strong)", background: "var(--bg-1)" }}>
            {[["−", 0.85], ["+", 1.18]].map(([t, f]) => (
              <button key={t} onClick={() => setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.4, v.k * f)) }))} style={{ width: 30, height: 28, background: "transparent", border: "none", color: "var(--ink-dim)", fontSize: 16 }}>{t}</button>
            ))}
          </div>
          <button onClick={() => { nodesRef.current.forEach((n) => { n.pinned = false; }); setView({ x: 0, y: 0, k: 1 }); }} className="hud-tag" style={{ cursor: "pointer", background: "var(--bg-1)" }}>Reset layout</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>drag node · drag bg to pan · scroll to zoom</span>
        </div>
      </div>

      {/* connections panel */}
      <div style={{ borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: NODE_TYPE_COLOR[selNode.type] }}></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", letterSpacing: ".1em", textTransform: "uppercase" }}>{selNode.type}</span>
          </div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{selNode.label}</h2>
          <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>{selEdges.length} connections</div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px" }}>
          {selEdges.map((e, i) => {
            const out = e.s === sel; const other = byId(out ? e.t : e.s);
            return (
              <button key={i} onClick={() => setSel(other.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 11px", marginBottom: 6, background: "transparent", border: "1px solid var(--line)", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <span style={{ color: "var(--ink-faint)" }}><Icon name="arrowRight" size={12} style={{ transform: out ? "none" : "rotate(180deg)" }} /></span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: e.secret ? "var(--hot)" : "var(--accent)", letterSpacing: ".04em" }}>{e.type}{e.secret ? " · secret" : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: NODE_TYPE_COLOR[other.type] }}></span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{other.label}</span>
                </div>
                {/* disposition bar */}
                <div style={{ marginTop: 8, height: 4, background: "var(--bg-3)", position: "relative" }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--ink-faint)" }}></div>
                  <div style={{ position: "absolute", top: 0, bottom: 0, background: EDGE_COLOR(e.disp),
                    left: e.disp < 0 ? `${50 + e.disp / 2}%` : "50%", width: `${Math.abs(e.disp) / 2}%` }}></div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-faint)", marginTop: 4 }}>disposition {e.disp > 0 ? "+" : ""}{e.disp}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GraphScreen });
