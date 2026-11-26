import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { ProductionLoader } from './components/ProductionLoader';
import { ThemeToggle } from './components/ThemeToggle';
import { RunAliveLogo } from './components/RunAliveLogo';
import { AnimatedGameBackground } from './components/AnimatedGameBackground';
import { LogOut, Compass, MapPin, History, BookOpen, Loader2 } from 'lucide-react';
import type { PerimeterShape } from './components/MapplsMap';

// ─── ROUTE-BASED LAZY LOADING FOR HEAVY APPLICATION MODULES ───────────────────
const AuthView = lazy(() => import('./components/AuthView').then((m) => ({ default: m.AuthView })));
const TerminalMenu = lazy(() => import('./components/TerminalMenu').then((m) => ({ default: m.TerminalMenu })));
const TacticalMapRoom = lazy(() =>
  import('./components/TacticalMapRoom').then((m) => ({ default: m.TacticalMapRoom }))
);
const TacticalLobby = lazy(() => import('./components/TacticalLobby').then((m) => ({ default: m.TacticalLobby })));
const GameView = lazy(() => import('./components/GameView').then((m) => ({ default: m.GameView })));
const MatchHistory = lazy(() => import('./components/MatchHistory').then((m) => ({ default: m.MatchHistory })));
const PlayerJournal = lazy(() => import('./components/PlayerJournal').then((m) => ({ default: m.PlayerJournal })));

type ViewMode = 'terminal' | 'map-room' | 'lobby' | 'game' | 'history';

// Comic Fallback Card for Lazy-Loaded View Transitions
const ViewSuspenseFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-12 min-h-[360px] w-full">
    <div className="comic-card bg-white dark:bg-[#1E293B] border-[2.5px] border-[#0F172A] dark:border-[#475569] p-6 rounded-2xl shadow-[4px_4px_0px_#0F172A] dark:shadow-[4px_4px_0px_#020617] flex items-center space-x-3.5">
      <Loader2 className="w-5 h-5 text-[#2563EB] dark:text-[#FBBF24] animate-spin" />
      <span className="font-heading font-black text-xs uppercase tracking-wider text-[#0F172A] dark:text-white">
        Loading View Assets...
      </span>
    </div>
  </div>
);

export function App() {
  const { user, logout } = useAuthStore();
  const { theme } = useThemeStore();
  const [isAppReady, setIsAppReady] = useState(false);
  const handleAppReady = React.useCallback(() => {
    setIsAppReady(true);
  }, []);

  const [currentView, setCurrentView] = useState<ViewMode>('terminal');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [matchPerimeter, setMatchPerimeter] = useState<{
    lat: number;
    lng: number;
    radius: number;
    shape: PerimeterShape;
    rectWidth?: number;
    rectHeight?: number;
    rectRotation?: number;
    polygonPoints?: Array<[number, number]>;
    revealSeekersOnMap?: boolean;
  } | null>(null);
  const [isJournalOpen, setIsJournalOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('runalive_journal_completed');
    }
    return false;
  });

  // Handle Initial Application Startup Sequence
  if (!isAppReady) {
    return <ProductionLoader onReady={handleAppReady} />;
  }

  // Not Logged In View
  if (!user) {
    return (
      <Suspense fallback={<ViewSuspenseFallback />}>
        <AuthView />
      </Suspense>
    );
  }

  const handleJoinGame = (gameId: string) => {
    setActiveGameId(gameId);
    setCurrentView('game');
  };

  const handleConfirmPerimeter = (params: {
    gameId: string;
    lat: number;
    lng: number;
    radius: number;
    rounds: number;
    shape: PerimeterShape;
    rectWidth?: number;
    rectHeight?: number;
    rectRotation?: number;
    polygonPoints?: Array<[number, number]>;
    revealSeekersOnMap?: boolean;
  }) => {
    setActiveGameId(params.gameId);
    setMatchPerimeter({
      lat: params.lat,
      lng: params.lng,
      radius: params.radius,
      shape: params.shape,
      rectWidth: params.rectWidth,
      rectHeight: params.rectHeight,
      rectRotation: params.rectRotation,
      polygonPoints: params.polygonPoints,
      revealSeekersOnMap: params.revealSeekersOnMap ?? true,
    });
    setCurrentView('lobby');
  };

  // Dedicated Immersive Match Mode: locks player strictly into the game map canvas
  if (currentView === 'game' && activeGameId) {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8FAFC] dark:bg-[#0F172A] overflow-hidden flex flex-col font-sans select-none">
        <Suspense fallback={<ViewSuspenseFallback />}>
          <GameView
            gameId={activeGameId}
            perimeterConfig={matchPerimeter}
            onExit={() => {
              setActiveGameId(null);
              setCurrentView('terminal');
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#0F172A] dark:text-[#F8FAFC] flex flex-col font-sans selection:bg-[#FBBC04] selection:text-[#0F172A] pb-16 sm:pb-0 overflow-x-hidden relative">
      {/* Optimized Canvas Background (Pre-rendered sprite drawing + reduced motion awareness) */}
      <AnimatedGameBackground />

      {/* Comic Header with Ink Borders, Theme Toggle, Journal Help & Google Colors */}
      <header className="relative z-40 border-b-[2.5px] border-[#0F172A] dark:border-[#475569] bg-white dark:bg-[#1E293B] shadow-[0_3px_0px_#0F172A] dark:shadow-[0_3px_0px_#020617] sticky top-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div
            onClick={() => {
              if (currentView !== 'game') {
                setCurrentView('terminal');
              }
            }}
            className="shrink-0 cursor-pointer"
          >
            <RunAliveLogo size="md" />
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
            {/* Field Journal Button */}
            <button
              onClick={() => setIsJournalOpen(true)}
              type="button"
              className="hidden md:flex p-1.5 sm:px-3 sm:py-1.5 bg-[#EFF6FF] dark:bg-[#78350F]/70 hover:bg-[#DBEAFE] border-2 border-[#0F172A] dark:border-[#475569] text-[#2563EB] dark:text-[#FDE68A] rounded-xl shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer items-center space-x-1.5"
              title="Open Field Journal Guidebook"
            >
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2563EB] dark:text-[#FDE68A]" />
              <span className="font-heading font-bold text-xs uppercase">Field Journal</span>
            </button>

            {/* Light / Dark Mode Toggle */}
            <ThemeToggle />

            {/* Operator User Card */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-[#F1F5F9] dark:bg-[#0F172A] border-2 border-[#0F172A] dark:border-[#475569] px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-xl shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617]">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#2563EB] border border-[#0F172A] flex items-center justify-center text-white text-xs font-heading font-bold">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-xs font-heading font-bold text-[#0F172A] dark:text-[#F8FAFC] block leading-tight">
                  {user.displayName}
                </span>
                <span className="text-[10px] font-mono font-bold text-[#10B981] flex items-center space-x-1 leading-tight">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block animate-pulse" />
                  <span>ONLINE</span>
                </span>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 sm:p-2 bg-white dark:bg-[#0F172A] hover:bg-[#FEE2E2] border-2 border-[#0F172A] dark:border-[#475569] hover:border-[#EF4444] text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#EF4444] rounded-xl shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Content Body with Suspense Boundaries */}
      <main className="relative z-10 flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <Suspense fallback={<ViewSuspenseFallback />}>
          {currentView === 'terminal' && (
            <TerminalMenu
              userDisplayName={user.displayName}
              onJoinGame={handleJoinGame}
              onOpenPerimeterEditor={() => setCurrentView('map-room')}
              onOpenHistory={() => setCurrentView('history')}
            />
          )}

          {currentView === 'map-room' && (
            <TacticalMapRoom
              gameId={activeGameId}
              onBack={() => setCurrentView('terminal')}
              onConfirmPerimeter={handleConfirmPerimeter}
            />
          )}

          {currentView === 'lobby' && activeGameId && (
            <TacticalLobby
              gameId={activeGameId}
              currentUserId={user.id}
              isHost={true}
              onStartMatch={() => setCurrentView('game')}
              onOpenTacticalMap={() => setCurrentView('map-room')}
              onExit={() => {
                setActiveGameId(null);
                setCurrentView('terminal');
              }}
            />
          )}

          {currentView === 'history' && (
            <MatchHistory onBack={() => setCurrentView('terminal')} />
          )}
        </Suspense>
      </main>

      {/* Interactive Field Journal Modal */}
      <Suspense fallback={null}>
        <PlayerJournal
          isOpen={isJournalOpen}
          onClose={() => setIsJournalOpen(false)}
          onComplete={() => setIsJournalOpen(false)}
        />
      </Suspense>

      {/* Responsive Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#1E293B] border-t-[2.5px] border-[#18181B] dark:border-[#475569] px-4 py-2 flex items-center justify-around shadow-[0_-3px_0px_#18181B] dark:shadow-[0_-3px_0px_#020617]">
        <button
          onClick={() => {
            if (currentView !== 'game') setCurrentView('terminal');
          }}
          className={`flex flex-col items-center py-1 px-3 rounded-lg font-heading text-[10px] font-bold ${
            currentView === 'terminal' ? 'text-[#4285F4] bg-[#E8F0FE] dark:bg-[#1E3A8A]' : 'text-[#64748B] dark:text-[#94A3B8]'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => setCurrentView('map-room')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg font-heading text-[10px] font-bold ${
            currentView === 'map-room' ? 'text-[#EA4335] bg-[#FCE8E6] dark:bg-[#7F1D1D]' : 'text-[#64748B] dark:text-[#94A3B8]'
          }`}
        >
          <MapPin className="w-5 h-5 mb-0.5" />
          <span>Host Map</span>
        </button>

        <button
          onClick={() => setIsJournalOpen(true)}
          className="flex flex-col items-center py-1 px-3 rounded-lg font-heading text-[10px] font-bold text-[#FBBC04] hover:bg-[#FEF7E0] dark:hover:bg-[#78350F]"
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span>Journal</span>
        </button>

        <button
          onClick={() => setCurrentView('history')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg font-heading text-[10px] font-bold ${
            currentView === 'history' ? 'text-[#34A853] bg-[#E6F4EA] dark:bg-[#064E3B]' : 'text-[#64748B] dark:text-[#94A3B8]'
          }`}
        >
          <History className="w-5 h-5 mb-0.5" />
          <span>Archive</span>
        </button>
      </nav>

      {/* Desktop Comic Footer */}
      <footer className="hidden sm:flex relative z-10 border-t-[2.5px] border-[#18181B] dark:border-[#475569] bg-white dark:bg-[#1E293B] py-3 px-6 text-center text-xs font-mono text-[#64748B] dark:text-[#94A3B8] items-center justify-between shadow-[0_-2px_0px_#18181B] dark:shadow-[0_-2px_0px_#020617]">
        <div className="flex items-center space-x-2">
          <span className="font-heading font-black text-[#18181B] dark:text-[#F8FAFC]">RUNALIVE</span>
          <span>// OUTDOOR MULTIPLAYER GPS TAG</span>
        </div>
        <div className="text-[11px] font-bold text-[#4285F4] dark:text-[#93C5FD]">
          COMIC SKETCHBOOK ENGINE • 10M GPS MUTUAL CAPTURE
        </div>
      </footer>
    </div>
  );
}

export default App;
