// homepage-app.jsx
// Composition + Tweaks wiring + mount.

const FONT_PAIRINGS = {
  'Broadcast HUD': { display: "'Chakra Petch', sans-serif", body: "'Space Grotesk', sans-serif", mono: "'JetBrains Mono', monospace" },
  'Editorial Sci-Fi': { display: "'Space Grotesk', sans-serif", body: "'Space Grotesk', sans-serif", mono: "'Space Mono', monospace" },
  'Terminal': { display: "'Space Mono', monospace", body: "'Space Grotesk', sans-serif", mono: "'Space Mono', monospace" },
};

const HEADLINES = [
  'Build the Crawl. Curate the Chaos.',
  'Reality Is Pending Review.',
  'Run a Living Dungeon. Not a Spreadsheet.',
  'AI Proposes. The DM Decides.',
  'Run the World Behind the World.',
];

// accent stored as [accentColor, inkColor]
const ACCENTS = {
  Gold: ['#F0C349', '#1a1306'],
  'Hazard Orange': ['#ff5b3a', '#250a04'],
  'Syndicate Violet': ['#8f6bff', '#ffffff'],
  'System Teal': ['#4fd6c4', '#04211d'],
  'Broadcast Magenta': ['#ff4d8d', '#2a0413'],
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#F0C349", "#1a1306"],
  "fontPairing": "Broadcast HUD",
  "heroLayout": "split",
  "heroHeadline": "Build the Crawl. Curate the Chaos.",
  "scanlines": true,
  "grain": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useReveal();

  React.useEffect(() => {
    const r = document.documentElement.style;
    const acc = Array.isArray(t.accent) ? t.accent : ACCENTS.Gold;
    r.setProperty('--accent', acc[0]);
    r.setProperty('--accent-ink', acc[1] || '#1a1306');
    const fp = FONT_PAIRINGS[t.fontPairing] || FONT_PAIRINGS['Broadcast HUD'];
    r.setProperty('--font-display', fp.display);
    r.setProperty('--font-body', fp.body);
    r.setProperty('--font-mono', fp.mono);
    r.setProperty('--scan-opacity', t.scanlines ? '0.05' : '0');
    r.setProperty('--grain-opacity', t.grain ? '0.05' : '0');
  }, [t.accent, t.fontPairing, t.scanlines, t.grain]);

  return (
    <>
      <HomeStyles />
      <FeatureStyles />
      <Nav />
      <main>
        <Hero layout={t.heroLayout} headline={t.heroHeadline} />
        <div className="page"><div className="rule" /></div>
        <GraphSection />
        <div className="page"><div className="rule" /></div>
        <ReviewSection />
        <div className="page"><div className="rule" /></div>
        <SystemSection />
        <div className="page"><div className="rule" /></div>
        <SimulateSection />
        <Marquee />
        <FinalCTA />
        <Footer />
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand" />
        <TweakColor
          label="Accent" value={t.accent}
          options={Object.values(ACCENTS)}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakSection label="Typography" />
        <TweakSelect
          label="Font pairing" value={t.fontPairing}
          options={Object.keys(FONT_PAIRINGS)}
          onChange={(v) => setTweak('fontPairing', v)}
        />
        <TweakSection label="Hero" />
        <TweakRadio
          label="Layout" value={t.heroLayout}
          options={['split', 'centered']}
          onChange={(v) => setTweak('heroLayout', v)}
        />
        <TweakSelect
          label="Headline" value={t.heroHeadline}
          options={HEADLINES}
          onChange={(v) => setTweak('heroHeadline', v)}
        />
        <TweakSection label="Atmosphere" />
        <TweakToggle label="Scanlines" value={t.scanlines} onChange={(v) => setTweak('scanlines', v)} />
        <TweakToggle label="Film grain" value={t.grain} onChange={(v) => setTweak('grain', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
