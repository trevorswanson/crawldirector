// homepage-graph.jsx
// The "living campaign graph" visual: a hand-laid node-link diagram of DCC
// entities with drifting nodes, animated edges, and a status legend.
// Exports: EntityGraph

const GRAPH_W = 640;
const GRAPH_H = 460;

// type -> color token
const NODE_TYPES = {
  crawler: { label: 'CRAWLER', color: 'var(--accent)' },
  faction: { label: 'FACTION', color: 'var(--hot)' },
  host: { label: 'HOST', color: 'var(--sys)' },
  floor: { label: 'FLOOR', color: '#b89bff' },
  sponsor: { label: 'SPONSOR', color: '#5fd0c6' },
  system: { label: 'SYSTEM AI', color: 'var(--ink)' },
};

// nodes: id, label, type, x, y, r, state(canon|pending)
const NODES = [
  { id: 'system', label: 'The System', type: 'system', x: 320, y: 60, r: 30, state: 'canon' },
  { id: 'carl', label: 'Carl', type: 'crawler', x: 150, y: 175, r: 24, state: 'canon' },
  { id: 'donut', label: 'Princess Donut', type: 'crawler', x: 92, y: 300, r: 21, state: 'canon' },
  { id: 'odette', label: 'Odette', type: 'host', x: 470, y: 135, r: 20, state: 'canon' },
  { id: 'reapers', label: 'Blood Reapers', type: 'faction', x: 300, y: 250, r: 23, state: 'pending' },
  { id: 'borant', label: 'Borant Syndicate', type: 'sponsor', x: 510, y: 270, r: 22, state: 'canon' },
  { id: 'floor6', label: 'Floor 6', type: 'floor', x: 250, y: 390, r: 22, state: 'canon' },
  { id: 'maestro', label: 'The Maestro', type: 'host', x: 460, y: 385, r: 18, state: 'pending' },
];

const EDGES = [
  { a: 'system', b: 'carl', label: 'WATCHES' },
  { a: 'system', b: 'odette', label: 'EMPLOYS' },
  { a: 'carl', b: 'donut', label: 'ALLY_OF' },
  { a: 'carl', b: 'reapers', label: 'AT_WAR_WITH', hot: true },
  { a: 'reapers', b: 'floor6', label: 'LOCATED_ON' },
  { a: 'borant', b: 'reapers', label: 'SPONSORS' },
  { a: 'odette', b: 'borant', label: 'EMPLOYS' },
  { a: 'reapers', b: 'maestro', label: 'APPEARS_ON' },
  { a: 'system', b: 'reapers', label: 'MANIPULATES', dashed: true },
  { a: 'donut', b: 'floor6', label: 'LOCATED_ON' },
];

function nodeById(id) { return NODES.find((n) => n.id === id); }

function EntityGraph() {
  return (
    <div className="graph-wrap bracket">
      <div className="graph-head mono">
        <span><span className="live-dot" /> CAMPAIGN GRAPH</span>
        <span className="tick">8 ENTITIES · 10 EDGES · 2 PENDING</span>
      </div>
      <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="graph-svg" role="img" aria-label="Campaign relationship graph">
        <defs>
          <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="320" cy="200" r="220" fill="url(#g-glow)" />

        {/* edges */}
        <g>
          {EDGES.map((e, i) => {
            const a = nodeById(e.a), b = nodeById(e.b);
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const stroke = e.hot ? 'var(--hot)' : 'var(--line-strong)';
            return (
              <g key={i} className="edge">
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={stroke}
                  strokeWidth={e.hot ? 1.6 : 1}
                  strokeDasharray={e.dashed ? '3 5' : 'none'}
                  className={e.dashed ? 'edge-line dashing' : 'edge-line'}
                  style={{ opacity: e.hot ? 0.75 : 0.45 }}
                />
                <text x={mx} y={my - 3} className="edge-label mono" textAnchor="middle">{e.label}</text>
              </g>
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {NODES.map((n, i) => {
            const t = NODE_TYPES[n.type];
            const pending = n.state === 'pending';
            return (
              <g key={n.id} className="node" style={{ animationDelay: `${(i % 5) * -1.3}s` }}>
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill={`color-mix(in srgb, ${t.color} 14%, var(--bg-2))`}
                  stroke={t.color}
                  strokeWidth={pending ? 1.4 : 1.2}
                  strokeDasharray={pending ? '4 4' : 'none'}
                  className="node-disc"
                />
                {n.type === 'system' && (
                  <circle cx={n.x} cy={n.y} r={n.r + 7} fill="none" stroke={t.color} strokeWidth="0.6" strokeOpacity="0.4" className="node-ring" />
                )}
                <text x={n.x} y={n.y + n.r + 16} className="node-label mono" textAnchor="middle">{n.label}</text>
                {pending && (
                  <text x={n.x} y={n.y + 3} className="node-badge mono" textAnchor="middle">PENDING</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="graph-legend mono">
        {Object.entries(NODE_TYPES).map(([k, v]) => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: v.color }} />{v.label}
          </span>
        ))}
      </div>
    </div>
  );
}

window.EntityGraph = EntityGraph;
