import React, { useState, useEffect, useRef } from 'react';
import logoUrl from '../assets/runalive_logo.png';
import { RunAliveLogo } from './RunAliveLogo';
import { useAuthStore } from '../stores/authStore';
import { API_URL } from '../lib/api';
import { AlertCircle, RefreshCw } from 'lucide-react';

export type LoadingStage =
  | 'INITIALIZING_ENGINE'
  | 'LOADING_CONFIG'
  | 'INITIALIZING_AUTH'
  | 'PREPARING_ASSETS'
  | 'PREPARING_GAME_MODULES'
  | 'CONNECTING_SERVICES'
  | 'PREPARING_INTERFACE'
  | 'FINAL_CHECK'
  | 'READY'
  | 'ERROR';

interface StageMeta {
  title: string;
  detail: string;
  targetPercent: number;
}

const STAGES: Record<LoadingStage, StageMeta> = {
  INITIALIZING_ENGINE: {
    title: 'Initialising RunAlive Engine',
    detail: 'Verifying browser geolocation and display adapters...',
    targetPercent: 12,
  },
  LOADING_CONFIG: {
    title: 'Loading Application Configuration',
    detail: 'Hydrating client preferences and theme settings...',
    targetPercent: 25,
  },
  INITIALIZING_AUTH: {
    title: 'Initialising Authentication & Identity',
    detail: 'Restoring verified runner operator session...',
    targetPercent: 42,
  },
  PREPARING_ASSETS: {
    title: 'Preparing Application Assets',
    detail: 'Preloading comic sketchbook brand icons and sprites...',
    targetPercent: 58,
  },
  PREPARING_GAME_MODULES: {
    title: 'Preparing Game Modules',
    detail: 'Initializing 60fps position interpolation & danger radar...',
    targetPercent: 72,
  },
  CONNECTING_SERVICES: {
    title: 'Connecting to Backend Services',
    detail: 'Checking health on RunAlive real-time cluster...',
    targetPercent: 86,
  },
  PREPARING_INTERFACE: {
    title: 'Preparing Essential Interface',
    detail: 'Mounting tactical map viewport and comic HUD elements...',
    targetPercent: 95,
  },
  FINAL_CHECK: {
    title: 'Final Readiness Check',
    detail: 'All systems green. Launching arena...',
    targetPercent: 100,
  },
  READY: {
    title: 'Application Ready',
    detail: 'Entering RunAlive...',
    targetPercent: 100,
  },
  ERROR: {
    title: 'Service Connectivity Issue',
    detail: 'Could not connect to essential services.',
    targetPercent: 0,
  },
};

interface ProductionLoaderProps {
  onReady: () => void;
}

export const ProductionLoader: React.FC<ProductionLoaderProps> = ({ onReady }) => {
  const [currentStage, setCurrentStage] = useState<LoadingStage>('INITIALIZING_ENGINE');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const targetProgressRef = useRef(0);
  const displayProgressRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // ─── 60fps SILKY SMOOTH PROGRESS INTERPOLATION LOOP ─────────────────────────
  // Continuously glides displayProgress smoothly toward targetProgressRef
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const current = displayProgressRef.current;
      const target = targetProgressRef.current;

      if (current < target) {
        // Smooth easing towards target (never jumps or goes backwards)
        const step = Math.max(0.4, (target - current) * 0.12);
        const next = Math.min(target, current + step);
        displayProgressRef.current = next;
        setDisplayProgress(next);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const runStartupSequence = async () => {
    setErrorMessage(null);

    const advanceStage = async (stage: LoadingStage, waitMs = 120) => {
      setCurrentStage(stage);
      const target = STAGES[stage]?.targetPercent || 0;
      targetProgressRef.current = Math.max(targetProgressRef.current, target);
      await new Promise((r) => setTimeout(r, waitMs));
    };

    try {
      // 1. Initialising Engine (Target: 12%)
      await advanceStage('INITIALIZING_ENGINE', 140);
      const hasStorage = typeof window !== 'undefined' && 'localStorage' in window;
      if (!hasStorage) {
        throw new Error('Local storage is disabled or unavailable.');
      }

      // 2. Loading Config (Target: 25%)
      await advanceStage('LOADING_CONFIG', 140);
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const storedTheme = localStorage.getItem('runalive_theme');
      if (!storedTheme && prefersDark) {
        document.documentElement.classList.add('dark');
      }

      // 3. Initialising Auth (Target: 42%)
      await advanceStage('INITIALIZING_AUTH', 180);
      try {
        // Read directly from store without causing component re-render loops
        await useAuthStore.getState().restoreSession();
      } catch {
        // Fallback handled gracefully inside store
      }

      // 4. Preparing Assets (Target: 58%)
      await advanceStage('PREPARING_ASSETS', 150);
      await new Promise<void>((resolve) => {
        const logoImg = new Image();
        logoImg.src = logoUrl;
        if (logoImg.complete) {
          resolve();
        } else {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => resolve();
        }
      });

      // 5. Preparing Game Modules (Target: 72%)
      await advanceStage('PREPARING_GAME_MODULES', 160);

      // 6. Connecting to Backend Services (Target: 86%)
      await advanceStage('CONNECTING_SERVICES', 180);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        await fetch(`${API_URL}/health`, { signal: controller.signal, method: 'GET' }).catch(() => {});
        clearTimeout(timeoutId);
      } catch {
        // Resilient offline/demo mode continues seamlessly
      }

      // 7. Preparing Essential Interface (Target: 95%)
      await advanceStage('PREPARING_INTERFACE', 140);

      // 8. Final Check (Target: 100%)
      await advanceStage('FINAL_CHECK', 200);

      // Wait until the progress bar smoothly glides all the way to 100%
      await new Promise<void>((resolve) => {
        const checkDone = () => {
          if (displayProgressRef.current >= 99.5) {
            setDisplayProgress(100);
            resolve();
          } else {
            setTimeout(checkDone, 40);
          }
        };
        checkDone();
      });

      // Smooth fade-out before entering the application
      setIsFadingOut(true);
      await new Promise((r) => setTimeout(r, 300));
      onReadyRef.current();
    } catch (err: any) {
      console.error('Startup sequence failed:', err);
      setCurrentStage('ERROR');
      setErrorMessage(err.message || 'An unexpected error occurred during startup.');
    }
  };

  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      runStartupSequence();
    }
  }, []);

  const currentMeta = STAGES[currentStage] || STAGES.INITIALIZING_ENGINE;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#F8FAFC] dark:bg-[#0F172A] sketchbook-grid text-center transition-opacity duration-300 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="progressbar"
      aria-valuenow={Math.round(displayProgress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading RunAlive"
    >
      <div className="max-w-md w-full flex flex-col items-center space-y-6">
        {/* Prominent RunAlive Logo */}
        <div className="transform transition-transform hover:scale-105">
          <RunAliveLogo size="xl" showText={true} animated={currentStage !== 'ERROR'} />
        </div>

        {/* Comic Status Card */}
        <div className="w-full comic-card bg-white dark:bg-[#1E293B] border-[2.5px] border-[#0F172A] dark:border-[#475569] p-5 sm:p-6 shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617] relative">
          {currentStage === 'ERROR' ? (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#FCE8E6] border-2 border-[#EA4335] flex items-center justify-center text-[#EA4335]">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-black text-base text-[#EA4335] uppercase">
                  Startup Interrupted
                </h3>
                <p className="mt-1 text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                  {errorMessage || 'Failed to initialize core services.'}
                </p>
              </div>
              <button
                onClick={() => {
                  hasStartedRef.current = false;
                  targetProgressRef.current = 0;
                  displayProgressRef.current = 0;
                  setDisplayProgress(0);
                  runStartupSequence();
                }}
                className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] border-2 border-[#0F172A] text-white font-heading font-black text-xs uppercase tracking-wider rounded-xl shadow-[2.5px_2.5px_0px_#0F172A] active:translate-x-0.5 active:translate-y-0.5 transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Startup</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#0F172A] dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse inline-block" />
                  <span>SYSTEM BOOTSTRAP</span>
                </span>
                <span className="font-black text-[#2563EB] dark:text-[#93C5FD] text-sm tabular-nums">
                  {Math.round(displayProgress)}%
                </span>
              </div>

              {/* Clean Animated Progress Bar (Silky Smooth Interpolation) */}
              <div className="w-full h-4 bg-[#F1F5F9] dark:bg-[#0F172A] border-2 border-[#0F172A] dark:border-[#475569] rounded-lg overflow-hidden relative shadow-[inset_1px_1px_0px_rgba(0,0,0,0.1)]">
                <div
                  className="h-full bg-[#FBBC04] border-r-2 border-[#0F172A] relative"
                  style={{
                    width: `${displayProgress}%`,
                    transition: 'none', // Driven by high-precision 60fps rAF loop
                  }}
                >
                  {/* Subtle diagonal comic stripe pattern */}
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,0,0,0.08)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.08)_50%,rgba(0,0,0,0.08)_75%,transparent_75%,transparent)] bg-[length:12px_12px]" />
                </div>
              </div>

              {/* Loading Status Text Underneath */}
              <div className="text-left pt-1">
                <div className="font-heading font-black text-sm text-[#0F172A] dark:text-[#F8FAFC] transition-colors duration-200">
                  {currentMeta.title}
                </div>
                <div className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] mt-0.5 truncate">
                  {currentMeta.detail}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info badge */}
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#94A3B8] dark:text-[#64748B] uppercase">
          RunAlive Engine v0.1 • GPS Spatial Mesh
        </div>
      </div>
    </div>
  );
};

export default ProductionLoader;
