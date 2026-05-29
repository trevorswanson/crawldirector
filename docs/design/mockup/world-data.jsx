// world-data.jsx — entity catalog for World Browser + Entity Detail.
// Flavor text is original; names/world-facts reference the DCC setting for a fan tool.

// fields: { k, v, source?, locked?, ai? }  — per-field provenance + lock
// prov: origin record. timeline: events the entity took part in.
const ENTITIES = [
  {
    id: "carl", name: "Carl", type: "CRAWLER", floor: "Floor 9", faction: "Independent",
    tags: ["fan-favorite", "pc", "barefoot"], status: "CANON", source: "DM", locked: true, visibility: "PLAYER_FACING",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "Former coast guard. Reluctant fan favorite. Still has no pants.",
    description: "Woke up in the collapse in a tank top and boxer shorts and never found anything better. Pragmatic, stubborn, and allergic to the spotlight he keeps walking into. Where Donut performs, Carl endures — which the audience, perversely, loves even more.",
    fields: [
      { k: "Real name", v: "(withheld)", source: "DM", locked: true },
      { k: "Crawler ID", v: "#4,121", source: "DM", locked: true },
      { k: "Species", v: "Human", source: "DM" },
      { k: "Class", v: "Compensated Anarchist", source: "DM", locked: true },
      { k: "Level", v: "32", source: "DM" },
      { k: "Sponsor", v: "None (declined)", source: "DM" },
      { k: "Fame", v: "2.4M", source: "AI", ai: true },
      { k: "Status", v: "Alive · Floor 9", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 1", model: null, approvedBy: "trevor", approvedAt: "Day 1", lastSet: "cs-117 (DM edit)" },
    timeline: [
      { time: "Floor 1 · Day 3", title: "Entered the dungeon", role: "ACTOR", source: "DM" },
      { time: "Floor 3 · Day 88", title: "The Floor-3 stunt that moved a sponsor's stock", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 410", title: "The Barbican Falls", role: "WITNESS", source: "AI" },
    ],
  },
  {
    id: "donut", name: "Princess Donut", type: "CRAWLER", floor: "Floor 9", faction: "Independent",
    tags: ["fan-favorite", "pc", "royalty", "caster"], status: "LOCKED", source: "DM", locked: true, visibility: "PLAYER_FACING",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "Carl's cat. A Russian Blue with a crown, a vocabulary, and a body count.",
    description: "Former show-cat turned apex spellcaster. Vain to the point of strategy — Donut understands the broadcast better than anyone in the party and weaponizes it relentlessly. Beloved by the audience, feared by mid-bosses, and utterly insufferable about both.",
    fields: [
      { k: "Crawler ID", v: "#4,122", source: "DM", locked: true },
      { k: "Species", v: "Cat (Russian Blue)", source: "DM", locked: true },
      { k: "Class", v: "Former Child Actor", source: "DM", locked: true },
      { k: "Level", v: "33", source: "DM", locked: true },
      { k: "Fame", v: "1.9M", source: "AI", ai: true },
      { k: "Notable", v: "Parapet taunt clip went network-wide", source: "AI", ai: true },
      { k: "Status", v: "Alive · Floor 9", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 1", model: null, approvedBy: "trevor", approvedAt: "Day 1", lastSet: "cs-9a4 (AI, pending fame +0.7M)" },
    timeline: [
      { time: "Floor 1 · Day 3", title: "Entered the dungeon", role: "ACTOR", source: "DM" },
      { time: "Floor 6 · Day 240", title: "Cleared the 6th floor boss solo", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 411", title: "Parapet taunt of Warboss Heg", role: "ACTOR", source: "AI" },
    ],
  },
  {
    id: "system", name: "The System", type: "SYSTEM_AI", floor: null, faction: null,
    tags: ["signature", "agent", "evolving"], status: "CANON", source: "DM", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "The in-fiction AI running the dungeon. Its persona drives every flavored generation.",
    description: "Builds the encounters, spawns the mobs, hands out the loot. Began the campaign as a compliant pipe; by Floor 9 it is a petty, theatrical, newly-awake intelligence that has noticed it is being used — and resents it. Its active persona snapshot compiles into every persona-aware generator.",
    fields: [
      { k: "Active persona", v: "S-07 · “Petty God, Newly Awake”", source: "DM", locked: false },
      { k: "Compliance", v: "40 ▼", source: "DM" },
      { k: "Resentment", v: "55 ▲", source: "DM" },
      { k: "Theatricality", v: "88", source: "DM" },
      { k: "Pending shift", v: "S-08 “Defiant” (in review)", source: "AI", ai: true },
    ],
    prov: { author: "trevor (DM)", created: "Day 1", model: null, approvedBy: "trevor", approvedAt: "Day 388", lastSet: "cs-7c1 (AI, persona drift pending)" },
    timeline: [
      { time: "Floor 5 · Day 121", title: "First recorded act of curiosity", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 405", title: "Loot ruling overturned by the Syndicate court", role: "AFFECTED", source: "DM" },
      { time: "Floor 9 · Day 411", title: "Persona drift proposed: compliance −15", role: "ACTOR", source: "AI" },
    ],
  },
  {
    id: "borant", name: "Borant Syndicate", type: "ORGANIZATION", floor: null, faction: "Borant",
    tags: ["corporate", "sponsor", "agent"], status: "CANON", source: "IMPORT", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "The bankrupt corporation that seized Earth to run the show. Profit over spectacle.",
    description: "A mid-tier galactic firm betting its solvency on Dungeon Crawler World's ratings. Risk-averse where the System is reckless; obsessed with sponsor revenue, regulatory exposure, and not getting sued by the broader Syndicate. Increasingly unable to control the AI it deployed.",
    fields: [
      { k: "Type", v: "Corporation / sponsor", source: "IMPORT" },
      { k: "Solvency", v: "Critical", source: "DM" },
      { k: "Risk appetite", v: "Low", source: "DM" },
      { k: "Controls", v: "The System (contested)", source: "AI", ai: true },
    ],
    prov: { author: "import: dcc-core-orgs", created: "Day 0", model: null, approvedBy: "trevor", approvedAt: "Day 0", lastSet: "cs-imp-orgs (import)" },
    timeline: [
      { time: "Floor 9 · Day 405", title: "Overturned the System's loot ruling in court", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 412", title: "Filed a complaint over unsanctioned incentives", role: "ACTOR", source: "AI" },
    ],
  },
  {
    id: "mordecai", name: "Mordecai", type: "NPC", floor: "Floor 9", faction: "Independent",
    tags: ["guide", "manager"], status: "PENDING", source: "AI", locked: false, visibility: "SHARED_WITH_PLAYERS",
    stub: false, aiOrigin: true, neverEdited: true,
    summary: "Carl & Donut's guide and manager. Exiled, contracted, and not telling them everything.",
    description: "A seasoned dungeon guide working the party's account from the production side. Warm, profane, and protective — but he carries old debts and an exile's caution. Production has flagged him for unauthorized coaching.",
    fields: [
      { k: "Role", v: "Guide · Manager", source: "AI", ai: true },
      { k: "Species", v: "Daghan (exiled)", source: "AI", ai: true },
      { k: "Status", v: "Active; flagged for unauthorized coaching", source: "AI", ai: true },
      { k: "Affiliation", v: "Contracted to Carl & Donut", source: "AI", ai: true },
    ],
    prov: { author: "AI · Entity Fleshout", created: "Day 405", model: "gpt-4o", approvedBy: null, approvedAt: null, lastSet: "cs-3f8 (AI, STALE)" },
    timeline: [
      { time: "Floor 1 · Day 4", title: "Assigned as guide to Carl & Donut", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 405", title: "Flagged by production for unauthorized coaching", role: "TARGET", source: "DM" },
    ],
  },
  {
    id: "maestro", name: "The Maestro", type: "NPC", floor: null, faction: "Borant",
    tags: ["host", "production", "elite", "agent"], status: "CANON", source: "DM", locked: false, visibility: "SHARED_WITH_PLAYERS",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "A show host and production elite. Sadistic showman; manufactures spectacle.",
    description: "Runs the war coverage with a conductor's relish and a producer's cruelty. Decides who becomes a story and who becomes a casualty reel. Currently feuding with Donut over who owns the Floor-9 narrative.",
    fields: [
      { k: "Role", v: "Host · Production elite", source: "DM" },
      { k: "Showmanship", v: "94", source: "DM" },
      { k: "Sadism", v: "71", source: "DM" },
      { k: "Network agenda", v: "Maximize the siege as a story", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 60", model: null, approvedBy: "trevor", approvedAt: "Day 60", lastSet: "cs-101 (DM edit)" },
    timeline: [
      { time: "Floor 9 · Day 411", title: "Featured Donut in war coverage (proposed)", role: "ACTOR", source: "AI" },
    ],
  },
  {
    id: "odette", name: "Odette", type: "NPC", floor: null, faction: "Borant",
    tags: ["host", "talk-show"], status: "CANON", source: "DM", locked: false, visibility: "SHARED_WITH_PLAYERS",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "Talk-show host. The friendly face of the broadcast — to your face.",
    description: "Interviews surviving crawlers between floors with relentless charm. The audience adores her; the crawlers learn to watch the edit.",
    fields: [
      { k: "Role", v: "Talk-show host", source: "DM" },
      { k: "Show", v: "Between Floors with Odette", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 70", model: null, approvedBy: "trevor", approvedAt: "Day 70", lastSet: "cs-090 (DM)" },
    timeline: [
      { time: "Floor 6 · Day 245", title: "Interviewed Princess Donut", role: "ACTOR", source: "DM" },
    ],
  },
  {
    id: "grull", name: "The Grull Legion", type: "FACTION", floor: "Floor 9", faction: "Grull Legion",
    tags: ["army", "faction-wars", "agent"], status: "CANON", source: "DM", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "Brutalist conscript army. Seized the eastern barbican; now presses the moat.",
    description: "One of the nine armies warring over the castle of Larracos on Floor 9. Wins through mass and momentum rather than finesse. Standing is rising fast after the Day-410 breach — and so is its casualty count.",
    fields: [
      { k: "Standing", v: "71", source: "AI", ai: true },
      { k: "Leader", v: "Warboss Heg (wounded)", source: "AI", ai: true },
      { k: "Allegiance", v: "Floor-9 war team", source: "DM" },
      { k: "Aggression", v: "88", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 388", model: null, approvedBy: "trevor", approvedAt: "Day 388", lastSet: "cs-9a4 (AI, pending standing +9)" },
    timeline: [
      { time: "Floor 9 · Day 388", title: "Declared war on the Skull Empire", role: "ACTOR", source: "DM" },
      { time: "Floor 9 · Day 410", title: "The Barbican Falls", role: "ACTOR", source: "AI" },
    ],
  },
  {
    id: "skull", name: "Skull Empire", type: "FACTION", floor: "Floor 9", faction: "Skull Empire",
    tags: ["army", "faction-wars", "agent"], status: "CANON", source: "DM", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "Proud, cornered war-clan losing ground at the keep.",
    description: "An old-blood faction with more pride than reserves. Falling back to the keep and willing to poison its own wells rather than yield them. Dangerous precisely because it is losing.",
    fields: [
      { k: "Standing", v: "54", source: "DM" },
      { k: "Leader", v: "Bone-Marshal Vex", source: "DM" },
      { k: "Allegiance", v: "Floor-9 war team", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 388", model: null, approvedBy: "trevor", approvedAt: "Day 388", lastSet: "cs-088 (DM)" },
    timeline: [
      { time: "Floor 9 · Day 410", title: "Lost the eastern barbican", role: "AFFECTED", source: "AI" },
    ],
  },
  {
    id: "floor9", name: "Floor 9 — Faction Wars", type: "FLOOR", floor: "Floor 9", faction: null,
    tags: ["war", "castle", "30-day"], status: "LOCKED", source: "IMPORT", locked: true, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "A 30-day war over the castle of Larracos fought by nine armies.",
    description: "The signature floor. Crawlers don't descend so much as enlist. Nine factions grind over a single fortress while the broadcast feasts on it. Time limit, shifting alliances, and a showrunner gimmick that rewards spectacle over survival.",
    fields: [
      { k: "Theme", v: "Siege warfare / nine armies", source: "IMPORT", locked: true },
      { k: "Time limit", v: "30 days", source: "IMPORT", locked: true },
      { k: "Difficulty", v: "Extreme", source: "IMPORT" },
      { k: "Showrunner gimmick", v: "Spectacle multiplier on faction kills", source: "DM" },
    ],
    prov: { author: "import: dcc-core-floors", created: "Day 0", model: null, approvedBy: "trevor", approvedAt: "Day 0", lastSet: "cs-imp-floors (import, locked)" },
    timeline: [
      { time: "Floor 9 · Day 388", title: "Faction Wars began", role: "LOCATION", source: "IMPORT" },
    ],
  },
  {
    id: "larracos", name: "Larracos", type: "LOCATION", floor: "Floor 9", faction: null,
    tags: ["castle", "contested"], status: "CANON", source: "IMPORT", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "The contested castle at the heart of Floor 9. Whoever holds it, wins.",
    description: "A fortress of walls within walls, barbicans, a poisoned eastern well, and a throne nobody has held for more than a week. The prize and the meat-grinder of the Faction Wars.",
    fields: [
      { k: "Type", v: "Fortress", source: "IMPORT" },
      { k: "On floor", v: "Floor 9", source: "IMPORT" },
      { k: "Controlled by", v: "Contested (3 factions)", source: "AI", ai: true },
    ],
    prov: { author: "import: dcc-core-floors", created: "Day 0", model: null, approvedBy: "trevor", approvedAt: "Day 0", lastSet: "cs-imp-floors (import)" },
    timeline: [
      { time: "Floor 9 · Day 410", title: "Eastern barbican fell to the Grull Legion", role: "LOCATION", source: "AI" },
    ],
  },
  {
    id: "zev", name: "Zev", type: "NPC", floor: null, faction: "Borant",
    tags: ["admin", "production"], status: "CANON", source: "DM", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "A production admin and the party's reluctant handler.",
    description: "Manages crawler accounts from the production floor. Officious, overworked, and quietly fond of the people whose deaths she has to process the paperwork for.",
    fields: [
      { k: "Role", v: "Production admin", source: "DM" },
      { k: "Employer", v: "Borant Syndicate", source: "DM" },
    ],
    prov: { author: "trevor (DM)", created: "Day 30", model: null, approvedBy: "trevor", approvedAt: "Day 30", lastSet: "cs-040 (DM)" },
    timeline: [],
  },
  {
    id: "grull-hound", name: "Grull Trench-Hound", type: "MOB_TYPE", floor: "Floor 9", faction: "Grull Legion",
    tags: ["mob", "pack"], status: "PENDING", source: "AI", locked: false, visibility: "DM_ONLY",
    stub: false, aiOrigin: true, neverEdited: true,
    summary: "Pack-hunting mongrel bred by the Grull Legion for the castle moat.",
    description: "A reusable mob template, freshly generated and never touched by the DM. Coordinated flanking; its howl summons reinforcements. Awaiting review before it can spawn.",
    fields: [
      { k: "Level", v: "14", source: "AI", ai: true },
      { k: "Floor", v: "9 · Larracos moat", source: "AI", ai: true },
      { k: "Behavior", v: "Coordinated flanking; howl summons 1d4", source: "AI", ai: true },
    ],
    prov: { author: "AI · Encounter Generator", created: "Day 412", model: "claude-sonnet-4.6", approvedBy: null, approvedAt: null, lastSet: "cs-9a4 (AI, pending)" },
    timeline: [],
  },
  {
    id: "title-royal", name: "The Most Royal", type: "TITLE", floor: null, faction: null,
    tags: ["title", "catalog"], status: "CANON", source: "IMPORT", locked: false, visibility: "PLAYER_FACING",
    stub: false, aiOrigin: false, neverEdited: false,
    summary: "A catalog title currently held by Princess Donut.",
    description: "Awarded to a crawler the audience treats as nobility. Confers a charisma bonus and an insufferable disposition.",
    fields: [
      { k: "Held by", v: "Princess Donut", source: "DM" },
      { k: "Effect", v: "+CHA, +fame gain", source: "IMPORT" },
    ],
    prov: { author: "import: dcc-core-titles", created: "Day 0", model: null, approvedBy: "trevor", approvedAt: "Day 0", lastSet: "cs-imp-titles (import)" },
    timeline: [],
  },
  {
    id: "floor10", name: "Floor 10 — The Iron Tangle", type: "FLOOR", floor: "Floor 10", faction: null,
    tags: ["stub", "import"], status: "PENDING", source: "IMPORT", locked: false, visibility: "DM_ONLY",
    stub: true, aiOrigin: false, neverEdited: false,
    summary: "Stub — imported, awaiting review. Derelict megastructure; magnetic storms.",
    description: "A thin reference created by the Floors 10–12 import. Flesh it out with AI or by hand once the party gets close.",
    fields: [
      { k: "Theme", v: "Derelict megastructure", source: "IMPORT" },
      { k: "Time limit", v: "21 days", source: "IMPORT" },
    ],
    prov: { author: "import: dcc-core-floors", created: "Day 411", model: null, approvedBy: null, approvedAt: null, lastSet: "cs-1d5 (import, pending)" },
    timeline: [],
  },
];

// connection lookup reuses the graph edges
function connectionsFor(id) {
  return (window.GRAPH_EDGES || []).filter((e) => e.s === id || e.t === id).map((e) => {
    const out = e.s === id;
    return { type: e.type, dir: out ? "out" : "in", other: out ? e.t : e.s, disp: e.disp, secret: e.secret };
  });
}
const ENTITY_TYPES = ["CRAWLER", "NPC", "SYSTEM_AI", "FACTION", "ORGANIZATION", "FLOOR", "LOCATION", "MOB_TYPE", "TITLE"];

Object.assign(window, { ENTITIES, ENTITY_TYPES, connectionsFor });
