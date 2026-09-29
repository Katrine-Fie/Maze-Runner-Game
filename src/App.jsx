import React, { useEffect, useMemo, useState } from 'react';

const INITIAL_FEATURES = [
  {
    id: 'ai-chatbot',
    title: 'AI Chatbot',
    description: 'Assist users and deflect support tickets.'
  },
  {
    id: 'dark-mode',
    title: 'Dark Mode',
    description: 'Improve usability in low-light environments.'
  },
  {
    id: 'analytics-dashboard',
    title: 'Analytics Dashboard',
    description: 'Track usage, retention, and conversion trends.'
  },
  {
    id: 'mobile-app',
    title: 'Mobile App',
    description: 'Native-like experience on iOS and Android.'
  },
  {
    id: 'performance-boost',
    title: 'Performance Optimization',
    description: 'Reduce latency and improve load times.'
  }
];

function FeatureCard({ feature, compact = false, onDelete }) {
  return (
    <div
      className={`relative bg-white border border-slate-200 rounded-lg shadow-[0_8px_20px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] cursor-grab active:cursor-grabbing select-none transition-shadow ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', feature.id);
      }}
    >
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 shadow-sm"
          aria-label="Remove feature"
        >
          ×
        </button>
      )}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-xs font-semibold text-white shadow-lg">
          {feature.title
            .split(' ')
            .map((w) => w[0])
            .join('')}
        </div>
        <div>
          <div className="font-semibold text-slate-900">{feature.title}</div>
          {!compact && (
            <p className="text-xs text-slate-500 mt-0.5">{feature.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [features, setFeatures] = useState(() => {
    if (typeof window === 'undefined') return INITIAL_FEATURES;
    try {
      const stored = window.localStorage.getItem('pg_features');
      if (!stored) return INITIAL_FEATURES;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_FEATURES;
      return parsed;
    } catch {
      return INITIAL_FEATURES;
    }
  });

  const [positions, setPositions] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem('pg_positions');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [newTitle, setNewTitle] = useState('');

  const availableFeatures = useMemo(
    () => features.filter((f) => !positions[f.id]),
    [features, positions]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('pg_features', JSON.stringify(features));
    } catch {
      // ignore storage errors
    }
  }, [features]);

  useEffect(() => {
    try {
      window.localStorage.setItem('pg_positions', JSON.stringify(positions));
    } catch {
      // ignore storage errors
    }
  }, [positions]);

  const handleDropOnGrid = (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setPositions((prev) => ({
      ...prev,
      [id]: {
        x: Math.min(96, Math.max(4, x)),
        y: Math.min(96, Math.max(4, y))
      }
    }));
  };

  const handleDragOverGrid = (event) => {
    event.preventDefault();
  };

  const resetBoard = () => {
    setPositions({});
  };

  const handleAddFeature = () => {
    const title = newTitle.trim();
    if (!title) return;

    const id = `custom-${Date.now()}`;
    setFeatures((prev) => [
      ...prev,
      {
        id,
        title,
        description: 'Custom feature idea added from the backlog.'
      }
    ]);
    setNewTitle('');
  };

  const handleDeleteFeature = (id) => {
    setFeatures((prev) => prev.filter((f) => f.id !== id));
    setPositions((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="min-h-screen flex items-stretch justify-center px-4 py-6 sm:px-6 lg:px-10">
      <div className="max-w-6xl w-full flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              Product strategy workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
              Product Priority Matrix
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Drag feature ideas from the backlog into the matrix. Place each card where it
              best fits based on <span className="font-semibold text-slate-900">value</span>{' '}
              and <span className="font-semibold text-slate-900">effort</span>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={resetBoard}
              className="text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Clear board
            </button>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 sm:gap-6 items-stretch">
          <section className="glass-panel shadow-card p-4 sm:p-5 flex flex-col">
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Add to backlog
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddFeature();
                    }
                  }}
                  placeholder="e.g. Usage-based pricing"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:border-sky-500/70"
                />
                <button
                  type="button"
                  onClick={handleAddFeature}
                  disabled={!newTitle.trim()}
                  className="text-xs font-medium px-3 py-2 rounded-lg bg-sky-500 text-white shadow-sm hover:bg-sky-400 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">Feature backlog</h2>
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                Drag into matrix
              </span>
            </div>
            {availableFeatures.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 text-center px-4">
                All features are placed on the board. Drag any card again to reposition it.
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1">
                {availableFeatures.map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    feature={feature}
                    onDelete={() => handleDeleteFeature(feature.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="glass-panel shadow-card p-4 sm:p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Value vs Effort matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Higher is more value. Right is more effort.
                </p>
              </div>
            </div>

            <div
              className="relative flex-1 min-h-[320px] sm:min-h-[380px] mt-1 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden"
              onDrop={handleDropOnGrid}
              onDragOver={handleDragOverGrid}
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-6 inset-y-3 border-t border-b border-slate-200" />
                <div className="absolute inset-y-6 inset-x-3 border-l border-r border-slate-200" />
              </div>

              <div className="absolute left-3 right-3 top-2 flex justify-between text-[11px] text-slate-500 uppercase tracking-wide pointer-events-none">
                <span>Low value</span>
                <span>High value</span>
              </div>
              <div className="absolute top-8 bottom-8 left-2 flex flex-col justify-between text-[11px] text-slate-500 uppercase tracking-wide pointer-events-none">
                <span className="-rotate-90 origin-left translate-x-2">Low effort</span>
                <span className="-rotate-90 origin-left translate-x-2">High effort</span>
              </div>

              <div className="absolute top-6 left-10 text-[11px] font-medium text-emerald-600/90">
                Quick wins
              </div>
              <div className="absolute top-6 right-10 text-[11px] font-medium text-amber-600/90 text-right">
                Big bets
              </div>
              <div className="absolute bottom-6 left-10 text-[11px] font-medium text-sky-600/90">
                Don't do
              </div>
              <div className="absolute bottom-6 right-10 text-[11px] font-medium text-rose-600/90 text-right">
                Money pits
              </div>

              {features.map((feature) => {
                const pos = positions[feature.id];
                if (!pos) return null;
                return (
                  <div
                    key={feature.id}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <FeatureCard
                      feature={feature}
                      compact
                      onDelete={() => handleDeleteFeature(feature.id)}
                    />
                  </div>
                );
              })}

              {Object.keys(positions).length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-xs text-slate-500 max-w-xs px-4">
                    Drag a feature card from the backlog on the left and drop it anywhere on
                    this canvas. The card will stay where you place it.
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;

