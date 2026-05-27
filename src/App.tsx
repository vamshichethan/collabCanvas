import { useState } from 'react';
import CanvasBoard from './components/CanvasBoard';
import Toolbar from './components/Toolbar';
import type { DrawingSettings, Tool } from './types';

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [settings, setSettings] = useState<DrawingSettings>({
    color: '#2563eb',
    strokeWidth: 4,
  });

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/92 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
              CollabCanvas
            </h1>
            <p className="text-sm text-slate-500">Frontend whiteboard workspace</p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Phase 2
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-3 py-4 md:px-6">
        <CanvasBoard
          activeTool={activeTool}
          settings={settings}
          toolbar={
            <Toolbar
              activeTool={activeTool}
              settings={settings}
              onToolChange={setActiveTool}
              onSettingsChange={setSettings}
            />
          }
        />
      </div>
    </main>
  );
}

export default App;
