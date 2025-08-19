const InstagramSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
  </svg>
);

const TikTokSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4" fill="currentColor">
    <path d="M30 6c1.6 3.6 4.6 6.3 8.3 7.2v6.1c-3.2-.1-6.2-1.1-8.7-2.8v12.3c0 7.1-5.7 12.8-12.8 12.8S4 35.9 4 28.8s5.7-12.8 12.8-12.8c1.2 0 2.4.2 3.5.5v6.4c-.9-.4-1.9-.6-3-.6-3.4 0-6.3 2.8-6.3 6.3s2.8 6.3 6.3 6.3 6.3-2.8 6.3-6.3V6h6.4z"/>
  </svg>
);

const Social = () => (
  <div className="flex items-center gap-4 text-sm">
    <a className="inline-flex items-center gap-1 underline" href="https://www.instagram.com/luisitin2001" target="_blank" rel="noreferrer" title="@luisitin2001 on Instagram">
      <InstagramSVG/>Instagram
    </a>
    <span className="text-slate-400">&bull;</span>
    <a className="inline-flex items-center gap-1 underline" href="https://www.tiktok.com/@luisitin2001" target="_blank" rel="noreferrer">
      <TikTokSVG/>TikTok
    </a>
  </div>
);

const App = () => {
  const FUN = [];
  const [factIdx, setFactIdx] = React.useState(0);
  const shuffleFact = () => setFactIdx(i => (i + 1) % (FUN.length || 1));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 animate-fadeUp">
        <div className="w-16 h-16 rounded-2xl bg-yellow-100 flex items-center justify-center text-3xl shadow bouncy select-none" aria-hidden="true" title="Hi!">🙂</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Fitness Toolkit</h1>
          <p className="text-slate-600">Let's build muscle and outwit gravity. Strong today, stronger next Tuesday.</p>
        </div>
        <Social/>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-slate-100">Fun fact</span>
          {FUN.length > 0 ? (
            <span key={factIdx} className="animate-fadeUp">{FUN[factIdx]}</span>
          ) : (
            <span className="animate-fadeUp text-slate-400">No facts yet.</span>
          )}
        </div>
        <button className="icon-btn hover:bg-slate-100" aria-label="Shuffle fun fact" title="Shuffle fun fact" onClick={shuffleFact} disabled={FUN.length === 0}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M7 3v2h.59L5 8.59 6.41 10 10 6.41V7h2V3H7zm10 0h4v4h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H17V3zM3 13h4v-2H3v2zm6.71 3.29 1.42 1.42L5 23h2v-2h.59l3.3-3.29-1.18-1.42zM19 14h2v4h-4v-2h1.59l-3.29-3.29 1.42-1.42L19 14.59V14z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
