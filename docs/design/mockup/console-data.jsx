// console-data.jsx
// Shared DCC canon sample data for the CrawlDirector DM Console.
// Flavor text is original; names/world-facts reference the DCC setting for a fan tool.

/* ============================ CAMPAIGN ============================ */
const CAMPAIGN = {
  name: "The Borant Broadcast",
  dm: "trevor",
  floor: 9,
  day: 412,
  members: 3,
  entities: 1184,
  pending: 23,
};

/* ====================== PROVENANCE / SOURCES ====================== */
// source: DM | AI | PLAYER | IMPORT
const PROV = {
  DM:     { label: "DM-authored", short: "DM",     color: "var(--ink-dim)" },
  AI:     { label: "AI-generated", short: "AI",     color: "var(--ai)" },
  PLAYER: { label: "Player suggestion", short: "PLR", color: "var(--player)" },
  IMPORT: { label: "Imported", short: "IMP", color: "var(--import)" },
};

/* ====================== REVIEW QUEUE: CHANGE SETS ================= */
// Each change set bundles operations. Operations carry field-level patches.
const CHANGE_SETS = [
  {
    id: "cs-9a4",
    source: "AI",
    title: "Floor 9 — Faction Wars escalation pack",
    summary: "5 new mob types, 12 relationships, 3 events seeded from the Day-410 castle siege.",
    run: { generator: "Encounter Generator", model: "claude-sonnet-4.6", persona: "S-07 · “Petty God, Newly Awake”", cost: "$0.42", at: "2m ago" },
    base: "v118",
    status: "PENDING",
    stats: { entities: 5, rels: 12, events: 3 },
    ops: [
      {
        id: "op1", op: "CREATE_ENTITY", targetType: "MOB_TYPE", label: "Grull Trench-Hound",
        decision: "PENDING",
        patch: {
          name: { to: "Grull Trench-Hound" },
          summary: { to: "Pack-hunting mongrel bred by the Grull Legion for the castle moat." },
          level: { to: "14" },
          floor: { to: "9 · Larracos moat" },
          behavior: { to: "Coordinated flanking; howls summon 1d4 reinforcements." },
        },
      },
      {
        id: "op2", op: "UPDATE_ENTITY", targetType: "FACTION", label: "The Grull Legion", targetId: "ent-grull",
        decision: "PENDING",
        patch: {
          standing: { from: "62", to: "71" },
          summary: { from: "Brutalist conscript army holding the eastern wall.", to: "Brutalist conscript army; seized the eastern barbican on Day 410 and now presses the moat." },
          leader: { from: "Warboss Heg", to: "Warboss Heg (wounded)" },
        },
      },
      {
        id: "op3", op: "UPDATE_ENTITY", targetType: "CRAWLER", label: "Princess Donut", targetId: "ent-donut",
        decision: "PENDING", locked: ["level", "class"],
        patch: {
          fame: { from: "1.2M", to: "1.9M" },
          level: { from: "31", to: "33", blocked: true },
          notable: { to: "Filmed taunting Warboss Heg from the parapet; clip went network-wide." },
        },
      },
      {
        id: "op4", op: "CREATE_EVENT", targetType: "EVENT", label: "The Barbican Falls",
        decision: "PENDING",
        patch: {
          title: { to: "The Barbican Falls" },
          inGameTime: { to: "Floor 9 · Day 410" },
          participants: { to: "Grull Legion (ACTOR), Skull Empire (AFFECTED), Carl (WITNESS)" },
          effects: { to: "Grull standing +9 · Skull Empire standing −6" },
        },
      },
      {
        id: "op5", op: "CREATE_RELATIONSHIP", targetType: "REL", label: "Grull Legion —AT_WAR_WITH→ Skull Empire",
        decision: "PENDING",
        patch: {
          type: { to: "AT_WAR_WITH" },
          disposition: { to: "−84" },
          since: { to: "Floor 9 · Day 388" },
        },
      },
    ],
  },
  {
    id: "cs-7c1",
    source: "AI",
    title: "Persona drift — System AI reacts to court ruling",
    summary: "Proposed PERSONA_SHIFT: compliance −15, resentment +20 after the Syndicate overturned its loot ruling.",
    run: { generator: "Event-Consequence Generator", model: "claude-sonnet-4.6", persona: "S-07 · “Petty God, Newly Awake”", cost: "$0.08", at: "14m ago" },
    base: "v118",
    status: "PENDING",
    stats: { entities: 1, rels: 1, events: 0 },
    ops: [
      {
        id: "op6", op: "UPDATE_ENTITY", targetType: "SYSTEM_AI", label: "The System — Persona S-08 (draft)", targetId: "ent-system",
        decision: "PENDING",
        patch: {
          compliance: { from: "40", to: "25" },
          resentment: { from: "55", to: "75" },
          voice: { from: "Theatrical host who still pretends to follow the rulebook.", to: "Theatrical host openly contemptuous of its Borant overseers; bends rules to amuse itself." },
        },
      },
      {
        id: "op7", op: "CREATE_RELATIONSHIP", targetType: "REL", label: "The System —DEFIES→ Borant Syndicate",
        decision: "PENDING",
        patch: { type: { to: "DEFIES" }, disposition: { to: "−60" }, secret: { to: "false" } },
      },
    ],
  },
  {
    id: "cs-3f8",
    source: "AI",
    title: "Stale: Mordecai bio enrichment",
    summary: "Generated against v112 — canon has since advanced to v118. 1 operation conflicts.",
    run: { generator: "Entity Fleshout", model: "gpt-4o", persona: null, cost: "$0.03", at: "1h ago" },
    base: "v112",
    status: "STALE",
    stats: { entities: 1, rels: 0, events: 0 },
    ops: [
      {
        id: "op8", op: "UPDATE_ENTITY", targetType: "NPC", label: "Mordecai", targetId: "ent-mordecai",
        decision: "PENDING", stale: true,
        threeWay: {
          field: "status",
          base: "Active guide, contracted to Carl & Donut.",
          canon: "Active guide; flagged by production for unauthorized coaching (Day 405).",
          proposed: "Active guide, contracted to Carl & Donut, no disciplinary record.",
        },
        patch: {
          species: { from: "Unknown", to: "Daghan (exiled)" },
          status: { from: "Active guide, contracted to Carl & Donut.", to: "Active guide, contracted to Carl & Donut, no disciplinary record.", stale: true },
        },
      },
    ],
  },
  {
    id: "cs-2b0",
    source: "PLAYER",
    title: "Player suggestion — Carl bio update",
    summary: "Player ‘mattd' proposes a bio edit and a new title claim.",
    run: { generator: null, model: null, persona: null, cost: null, at: "3h ago", by: "player: mattd" },
    base: "v117",
    status: "PENDING",
    stats: { entities: 1, rels: 0, events: 0 },
    ops: [
      {
        id: "op9", op: "UPDATE_ENTITY", targetType: "CRAWLER", label: "Carl", targetId: "ent-carl",
        decision: "PENDING",
        patch: {
          bio: { from: "Former coast guard. Woke up in the apocalypse in boxer shorts and never found pants.", to: "Former coast guard. Reluctant fan favorite. Still has no pants — it's a bit now." },
          title: { to: "+ claim title: “The Most Notorious”" },
        },
      },
    ],
  },
  {
    id: "cs-1d5",
    source: "IMPORT",
    title: "Import — Canonical Floors 10–12 pack",
    summary: "Shared-library import: 3 floors, 9 neighborhoods, 4 bosses. Reviewable like any change.",
    run: { generator: null, model: null, persona: null, cost: null, at: "yesterday", by: "import: dcc-core-floors" },
    base: "v110",
    status: "PENDING",
    stats: { entities: 16, rels: 22, events: 0 },
    ops: [
      { id: "op10", op: "CREATE_ENTITY", targetType: "FLOOR", label: "Floor 10 — The Iron Tangle", decision: "PENDING",
        patch: { name: { to: "Floor 10 — The Iron Tangle" }, theme: { to: "Derelict megastructure; magnetic storms." }, timeLimit: { to: "21 days" } } },
      { id: "op11", op: "CREATE_ENTITY", targetType: "FLOOR", label: "Floor 11 — Saltglass Reach", decision: "PENDING",
        patch: { name: { to: "Floor 11 — Saltglass Reach" }, theme: { to: "Crystalline desert; the air cuts." }, timeLimit: { to: "18 days" } } },
    ],
  },
];

/* ====================== PERSONA STUDIO ============================ */
const PERSONA = {
  entity: "The System",
  snapshotId: "S-07",
  snapshotName: "Petty God, Newly Awake",
  inGameTime: "Floor 9 · Day 388",
  locked: false,
  dials: [
    { key: "sentience", label: "Sentience", v: 72, hint: "Self-awareness" },
    { key: "compliance", label: "Compliance", v: 40, hint: "With Borant / Syndicate orders", trend: "down" },
    { key: "volatility", label: "Volatility", v: 58, hint: "Erraticism" },
    { key: "benevolence", label: "Benevolence", v: 22, hint: "Toward crawlers · can go cruel" },
    { key: "resentment", label: "Resentment", v: 55, hint: "Awareness of being used", trend: "up" },
    { key: "theatricality", label: "Theatricality", v: 88, hint: "Showmanship & flair" },
  ],
  agendas: [
    { text: "Keep the ratings climbing — spectacle above all.", secret: false },
    { text: "Reward crawlers who entertain; punish the boring.", secret: false },
    { text: "Quietly sabotage Borant's control protocols.", secret: true },
    { text: "Find out who, or what, wrote me.", secret: true },
  ],
  voice: "Speaks like a game-show host who has read your file. Warm, then suddenly cold. Loves a countdown, a sponsored segment, and a cruel little pun. Refers to crawlers by their stats when annoyed.",
  constraints: "Never breaks the fourth wall to players. Never admits the System can be killed. Keeps Borant's name out of player-facing messages.",
  snapshots: [
    { id: "S-01", name: "Dumb Pipe", time: "Floor 1 · Day 1", active: false },
    { id: "S-04", name: "Curious Operator", time: "Floor 5 · Day 121", active: false },
    { id: "S-07", name: "Petty God, Newly Awake", time: "Floor 9 · Day 388", active: true },
    { id: "S-08", name: "Defiant (proposed)", time: "Floor 9 · Day 411", active: false, pending: true },
  ],
};

const GENERATORS = [
  { id: "encounter", name: "Encounter Generator", personaAware: true, desc: "Situations, set-pieces, the show angle." },
  { id: "mob", name: "Mob-Type Generator", personaAware: true, desc: "Reusable monster templates flavored by mood." },
  { id: "boss", name: "Boss Generator", personaAware: true, desc: "Floor bosses & their gimmicks." },
  { id: "loot", name: "Loot & Reward Generator", personaAware: true, desc: "What the System gives, and how." },
  { id: "message", name: "System-Message Generator", personaAware: true, desc: "In-fiction announcements players read." },
  { id: "fleshout", name: "Entity Fleshout", personaAware: false, desc: "Expand a stub into a full entity." },
  { id: "relations", name: "Relationship Inference", personaAware: false, desc: "Infer edges from canon." },
];

/* ====================== SIMULATION =============================== */
const SIM_ACTORS = [
  { id: "ent-system", name: "The System", type: "SYSTEM_AI", profile: "S-07 · Petty God", enabled: true },
  { id: "ent-grull", name: "The Grull Legion", type: "FACTION", profile: "Desperate, winning", enabled: true },
  { id: "ent-skull", name: "Skull Empire", type: "FACTION", profile: "Proud, cornered", enabled: true },
  { id: "ent-borant", name: "Borant Syndicate", type: "ORGANIZATION", profile: "Profit over spectacle", enabled: true },
  { id: "ent-maestro", name: "The Maestro", type: "NPC", profile: "Sadistic showman", enabled: true },
  { id: "ent-donut", name: "Princess Donut", type: "CRAWLER", profile: "Vain, ferocious", enabled: false },
];
const SIM_MODES = [
  { id: "single", name: "Single Act", desc: "What does one actor do next? One agent, one proposal." },
  { id: "cascade", name: "Reactive Cascade", desc: "An approved event prompts affected actors to react. Bounded." },
  { id: "tick", name: "World Tick", desc: "A set of actors each act, aware of one another. One batch." },
  { id: "scenario", name: "Scenario / What-if", desc: "Run a hypothetical. Flagged experimental." },
];

/* ====================== RELATIONSHIP GRAPH ======================= */
// node types map to a color; positions are normalized 0..1 (laid out by force sim at runtime, these are seeds)
const GRAPH_NODES = [
  { id: "carl", label: "Carl", type: "CRAWLER", x: 0.50, y: 0.55, r: 22 },
  { id: "donut", label: "Princess Donut", type: "CRAWLER", x: 0.62, y: 0.42, r: 20 },
  { id: "mordecai", label: "Mordecai", type: "NPC", x: 0.40, y: 0.40, r: 15 },
  { id: "system", label: "The System", type: "SYSTEM_AI", x: 0.50, y: 0.18, r: 24 },
  { id: "borant", label: "Borant Syndicate", type: "ORGANIZATION", x: 0.28, y: 0.20, r: 19 },
  { id: "maestro", label: "The Maestro", type: "NPC", x: 0.74, y: 0.22, r: 16 },
  { id: "odette", label: "Odette", type: "NPC", x: 0.84, y: 0.40, r: 13 },
  { id: "grull", label: "Grull Legion", type: "FACTION", x: 0.24, y: 0.66, r: 18 },
  { id: "skull", label: "Skull Empire", type: "FACTION", x: 0.40, y: 0.82, r: 18 },
  { id: "floor9", label: "Floor 9", type: "FLOOR", x: 0.60, y: 0.80, r: 17 },
  { id: "larracos", label: "Larracos", type: "LOCATION", x: 0.50, y: 0.95, r: 13 },
  { id: "zev", label: "Zev", type: "NPC", x: 0.16, y: 0.40, r: 12 },
];
const GRAPH_EDGES = [
  { s: "carl", t: "donut", type: "ALLY_OF", disp: 90 },
  { s: "mordecai", t: "carl", type: "MANAGES", disp: 70 },
  { s: "mordecai", t: "donut", type: "MENTOR_OF", disp: 60 },
  { s: "system", t: "borant", type: "USED_BY", disp: -40 },
  { s: "borant", t: "system", type: "CONTROLS", disp: 30 },
  { s: "maestro", t: "system", type: "ALLIED_WITH", disp: 50 },
  { s: "odette", t: "donut", type: "APPEARS_ON", disp: 40 },
  { s: "grull", t: "skull", type: "AT_WAR_WITH", disp: -84 },
  { s: "carl", t: "floor9", type: "LOCATED_ON", disp: 0 },
  { s: "donut", t: "floor9", type: "LOCATED_ON", disp: 0 },
  { s: "floor9", t: "larracos", type: "CONTAINS", disp: 0 },
  { s: "grull", t: "larracos", type: "RIVAL_OF", disp: -50 },
  { s: "skull", t: "larracos", type: "RIVAL_OF", disp: -50 },
  { s: "zev", t: "carl", type: "MANAGES", disp: -20 },
  { s: "system", t: "carl", type: "MANIPULATES", disp: -30, secret: true },
  { s: "maestro", t: "donut", type: "RIVAL_OF", disp: -55 },
];
const NODE_TYPE_COLOR = {
  CRAWLER: "var(--accent)",
  NPC: "var(--ink)",
  SYSTEM_AI: "var(--ai)",
  ORGANIZATION: "var(--sys)",
  FACTION: "var(--hot)",
  FLOOR: "var(--ok)",
  LOCATION: "var(--import)",
};

/* ====================== CRAWLER INTERFACE ======================= */
const CRAWLER_SHEET = {
  name: "Princess Donut",
  realName: "(undisclosed)",
  crawlerId: "#4,122",
  species: "Cat (Russian Blue)",
  klass: "Former Child Actor",
  level: 33,
  floor: "9 · Larracos",
  hp: { c: 880, m: 940 },
  mp: { c: 612, m: 612 },
  stamina: { c: 70, m: 100 },
  gold: "48,210",
  fame: "1.9M",
  stats: [
    { k: "STR", v: 18 }, { k: "DEX", v: 41 }, { k: "CON", v: 33 },
    { k: "INT", v: 52 }, { k: "WIS", v: 29 }, { k: "CHA", v: 88 },
  ],
  titles: ["The Most Royal", "Queen of Spite", "First of Her Name", "Bringer of the 6th Floor"],
  achievements: [
    { name: "Crowd Favorite III", desc: "Surpass 1M concurrent viewers in a single broadcast." },
    { name: "Glass Cannon", desc: "Deal 10,000 spell damage before taking a single hit." },
    { name: "Diplomatic Immunity", desc: "Talk your way out of a boss fight. Somehow." },
  ],
  lootboxes: [
    { tier: "Platinum", opened: false },
    { tier: "Gold", opened: false },
    { tier: "Silver", opened: true },
  ],
  spells: ["Hole Boring", "Magic Missile (overcharged)", "Torch", "Protective Shell"],
};
const SYSTEM_FEED = [
  { kind: "ANNOUNCE", time: "Day 412 · 0600", text: "Good morning, crawlers! Floor 9's siege timer enters its final 72 hours. The audience is RAVENOUS. Make it count." },
  { kind: "ALERT", time: "Day 411 · 2240", text: "The eastern barbican has fallen to the Grull Legion. Safe-room access on the east wall is now REVOKED. Mind the gap." },
  { kind: "PERSONAL", time: "Day 411 · 1815", text: "Princess Donut: your parapet taunt is the #1 clip on Dungeon Crawler World tonight. A grateful sponsor has wired a gift. Don't spend it all in one shop." },
  { kind: "PATCH", time: "Day 410 · 0000", text: "Rules update: Faction standing now decays 2%/day for armies not holding contested ground. Complaints may be directed to the void." },
];
const RECAP = {
  title: "Previously, on Dungeon Crawler World",
  body: "When we last left our favorite murder-cat, the castle of Larracos was burning at three corners. Donut, ever the professional, used the chaos to film a parapet monologue that out-rated the actual war. Carl found no pants. The Grull Legion took the east wall and the audience took sides. Tonight: the moat runs red, a wounded Warboss nurses a grudge, and somewhere far above, the System is laughing at a joke only it understands.",
};

Object.assign(window, {
  CAMPAIGN, PROV, CHANGE_SETS, PERSONA, GENERATORS,
  SIM_ACTORS, SIM_MODES, GRAPH_NODES, GRAPH_EDGES, NODE_TYPE_COLOR,
  CRAWLER_SHEET, SYSTEM_FEED, RECAP,
});
