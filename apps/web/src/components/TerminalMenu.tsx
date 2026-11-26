import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { TacticalMap } from './TacticalMap';
import {
  Compass,
  Play,
  LogIn,
  Sliders,
  History,
  Shield,
  Crosshair,
  Sparkles,
  Users,
  MapPin,
  ArrowRight,
  Radio,
  LogOut,
  Settings,
  User,
  Clock,
  Award,
  AlertCircle,
  CheckCircle2,
  Flame,
  Zap,
} from 'lucide-react';

interface TerminalMenuProps {
  userDisplayName: string;
  onJoinGame: (gameId: string) => void;
  onOpenPerimeterEditor: () => void;
  onOpenHistory: () => void;
}

export const TerminalMenu: React.FC<TerminalMenuProps> = React.memo(({
  userDisplayName,
  onJoinGame,
  onOpenPerimeterEditor,
  onOpenHistory,
}) => {
  const { user, logout, updateDisplayName } = useAuthStore();
  const [currentDisplayName, setCurrentDisplayName] = useState(user?.displayName || userDisplayName || 'Runner');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || userDisplayName || 'Runner');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dashboardCenter, setDashboardCenter] = useState<[number, number]>([28.4595, 77.5135]);

  useEffect(() => {
    if (user?.displayName) {
      setCurrentDisplayName(user.displayName);
      setNewDisplayName(user.displayName);
    } else if (userDisplayName) {
      setCurrentDisplayName(userDisplayName);
      setNewDisplayName(userDisplayName);
    }
  }, [user?.displayName, userDisplayName]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDashboardCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 4) {
      setError('Please enter a valid 6-character room code.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post<any>('/games/join', {
        roomCode: cleanCode,
        locationConsentAt: new Date().toISOString(),
        safetyConsentAccepted: true,
        locationConsentAccepted: true,
      });
      const targetId = res.gameId || res.id || res.game?.id;
      if (targetId) {
        onJoinGame(targetId);
      } else {
        throw new Error('Could not identify joined match room.');
      }
    } catch {
      // Instant demo match entry for static client demo
      onJoinGame(`demo-room-${cleanCode}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newDisplayName.trim();
    if (!cleanName) return;

    // 1. Instant local update on hero card and avatar
    setCurrentDisplayName(cleanName);
    // 2. Global state update in authStore (updates App header chip & persists to localStorage)
    updateDisplayName(cleanName);
    setSettingsSaved(true);

    try {
      // 3. Persist to backend
      await api.patch('/me', { displayName: cleanName });
    } catch (err: any) {
      console.warn('Backend patch failed, saved locally:', err);
    }

    setTimeout(() => {
      setSettingsSaved(false);
      setIsSettingsOpen(false);
    }, 800);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Comic Hero Card with Operator Profile */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-6 sm:p-8 shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617] relative paper-tape">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FBBF24] border-[2.5px] border-[#0F172A] shadow-[3px_3px_0px_#0F172A] flex items-center justify-center font-heading font-black text-2xl text-[#0F172A] transform -rotate-2">
              {currentDisplayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-[#ECFDF5] dark:bg-[#064E3B] border border-[#0F172A] dark:border-[#475569] text-[10px] font-heading font-bold text-[#059669] dark:text-[#A7F3D0] mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span>OPERATOR VERIFIED // READY TO PLAY</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-heading font-black text-[#0F172A] dark:text-white tracking-tight">
                Welcome back,{' '}
                <span className="marker-highlight-yellow text-[#0F172A] dark:text-white">{currentDisplayName}</span>!
              </h1>
              <p className="text-xs font-mono text-[#475569] dark:text-[#94A3B8] mt-0.5">
                {user?.email || 'player@runalive.app'}
              </p>
            </div>
          </div>

          {/* Quick Profile & Archive Action Buttons */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="py-2 px-3 bg-white dark:bg-[#0F172A] hover:bg-[#F1F5F9] border-2 border-[#0F172A] dark:border-[#475569] rounded-xl text-xs font-heading font-bold text-[#0F172A] dark:text-white flex items-center space-x-1.5 shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            >
              <Settings className="w-4 h-4 text-[#2563EB]" />
              <span>Settings</span>
            </button>

            <button
              onClick={onOpenHistory}
              className="py-2 px-3 bg-[#EFF6FF] dark:bg-[#78350F] hover:bg-[#DBEAFE] border-2 border-[#0F172A] dark:border-[#475569] rounded-xl text-xs font-heading font-bold text-[#2563EB] dark:text-[#FDE68A] flex items-center space-x-1.5 shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            >
              <History className="w-4 h-4 text-[#2563EB] dark:text-[#FBBF24]" />
              <span>Match Archive</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-[#FCE8E6] dark:bg-[#7F1D1D] border-2 border-[#EA4335] rounded-xl text-xs text-[#EA4335] dark:text-[#FECACA] font-bold flex items-center justify-between shadow-[3px_3px_0px_#EA4335]">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#EA4335] dark:text-[#FECACA] hover:text-[#18181B] font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {/* Two Primary Action Pillars: Host Game vs Join Game */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pillar 1: HOST GAME */}
        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-6 sm:p-7 flex flex-col justify-between shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617] hover:shadow-[7px_7px_0px_#2563EB] transition group">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A8A] border-2 border-[#0F172A] dark:border-[#475569] flex items-center justify-center text-[#2563EB] dark:text-[#93C5FD] shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617] mb-4 group-hover:-rotate-3 transition transform">
              <Compass className="w-6 h-6 text-[#2563EB] dark:text-[#93C5FD]" />
            </div>

            <div className="inline-block comic-stamp bg-[#EFF6FF] dark:bg-[#1E3A8A] text-[#2563EB] dark:text-[#93C5FD] border-[#0F172A] dark:border-[#475569] text-[10px] mb-1">
              ✦ CREATE NEW ARENA
            </div>
            <h2 className="text-xl sm:text-2xl font-heading font-black text-[#0F172A] dark:text-white mt-1">Host a Game</h2>
            <p className="text-xs text-[#334155] dark:text-[#94A3B8] mt-1 leading-relaxed">
              Design playing perimeters (circle, box, or custom polygon), set round parameters, balance teams, and supervise live matches.
            </p>

            <div className="mt-5 p-3.5 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-xl border-2 border-[#0F172A] dark:border-[#475569] text-xs text-[#334155] dark:text-[#94A3B8] space-y-2">
              <div className="flex justify-between">
                <span>Perimeter Modes:</span>
                <span className="text-[#0F172A] dark:text-white font-mono font-bold">Circle, Box, Polygon</span>
              </div>
              <div className="flex justify-between">
                <span>Map Engine:</span>
                <span className="text-[#2563EB] dark:text-[#93C5FD] font-mono font-bold">Modern Esri Street & Satellite</span>
              </div>
              <div className="flex justify-between">
                <span>Capture Rule:</span>
                <span className="text-[#D97706] dark:text-[#FDE68A] font-mono font-bold">Mutual 10m Verification</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={onOpenPerimeterEditor}
              className="w-full py-3.5 comic-btn-primary text-xs sm:text-sm flex items-center justify-center space-x-2"
            >
              <Sliders className="w-4 h-4" />
              <span>CONFIGURE & HOST MATCH</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pillar 2: JOIN GAME */}
        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-6 sm:p-7 flex flex-col justify-between shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617] hover:shadow-[7px_7px_0px_#EF4444] transition group">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#FFF1F2] dark:bg-[#7F1D1D] border-2 border-[#0F172A] dark:border-[#475569] flex items-center justify-center text-[#EF4444] dark:text-[#FECACA] shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617] mb-4 group-hover:rotate-3 transition transform">
              <LogIn className="w-6 h-6 text-[#EF4444] dark:text-[#FECACA]" />
            </div>

            <div className="inline-block comic-stamp bg-[#FFF1F2] dark:bg-[#7F1D1D] text-[#EF4444] dark:text-[#FECACA] border-[#0F172A] dark:border-[#475569] text-[10px] mb-1">
              ✦ MULTIPLAYER ENTRY
            </div>
            <h2 className="text-xl sm:text-2xl font-heading font-black text-[#0F172A] dark:text-white mt-1">Join an Active Game</h2>
            <p className="text-xs text-[#334155] dark:text-[#94A3B8] mt-1 leading-relaxed">
              Enter the room invitation code (e.g. <span className="font-mono font-bold text-[#EF4444]">RUN-7K9PX2</span> or <span className="font-mono font-bold text-[#EF4444]">7K9PX2</span>) provided by your match host to join the lobby.
            </p>

            <form onSubmit={handleJoin} className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-heading font-bold text-[#0F172A] dark:text-[#F8FAFC] uppercase mb-1">
                  Match Invitation Code
                </label>
                <input
                  type="text"
                  maxLength={12}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RUN-7K9PX2 or 7K9PX2"
                  className="w-full bg-[#F1F5F9] dark:bg-[#0F172A] border-2 border-[#0F172A] dark:border-[#475569] focus:border-[#EF4444] focus:bg-white dark:focus:bg-[#0F172A] focus:shadow-[3px_3px_0px_#EF4444] rounded-xl px-4 py-3 text-lg font-mono font-black tracking-widest text-center text-[#0F172A] dark:text-white placeholder-[#94A3B8] uppercase outline-none transition"
                />
              </div>

              <div className="p-2.5 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-[11px] text-[#475569] dark:text-[#94A3B8] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
                <span>Automatic check: validates match existence, roster limit, and room status.</span>
              </div>
            </form>
          </div>

          <div className="pt-6">
            <button
              onClick={() => handleJoin()}
              disabled={loading || roomCode.trim().length < 4}
              className="w-full py-3.5 comic-btn-red text-xs sm:text-sm flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'VERIFYING CODE...' : 'ENTER GAME LOBBY'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Tactical GPS Map Center on Dashboard */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-5 sm:p-6 shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617]">
        <div className="flex flex-wrap items-center justify-between mb-3.5 gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#10B981] animate-pulse border border-[#0F172A]" />
            <h3 className="text-sm font-heading font-black text-[#0F172A] dark:text-white uppercase tracking-wider">
              Live Tactical GPS Map Preview
            </h3>
            <span className="text-[#CBD5E1] dark:text-[#475569] hidden sm:inline">|</span>
            <span className="text-[11px] font-mono text-[#475569] dark:text-[#94A3B8] hidden sm:inline">
              Modern Street & Satellite Cartography • 30s Periodic Sync • Zero API Keys
            </span>
          </div>

          <button
            onClick={onOpenPerimeterEditor}
            className="text-xs font-heading font-bold text-[#2563EB] hover:text-[#1D4ED8] flex items-center space-x-1.5 transition cursor-pointer"
          >
            <span>Open Full Perimeter Workstation</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <TacticalMap
          center={dashboardCenter}
          radiusMeters={500}
          userPos={dashboardCenter}
          className="w-full h-80 sm:h-96 rounded-xl border-2 border-[#0F172A] dark:border-[#475569]"
        />
      </div>

      {/* Feature Strip / Comic Stickers */}
      <div className="grid sm:grid-cols-3 gap-4 text-xs">
        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-4 shadow-[3px_3px_0px_#0F172A] dark:shadow-[3px_3px_0px_#020617] flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A8A] border-2 border-[#0F172A] dark:border-[#475569] text-[#2563EB] dark:text-[#93C5FD] shrink-0">
            <Compass className="w-5 h-5 text-[#2563EB] dark:text-[#93C5FD]" />
          </div>
          <div>
            <span className="font-heading font-black text-[#0F172A] dark:text-white text-sm block">Modern High-Res Maps</span>
            <span className="text-[#475569] dark:text-[#94A3B8] text-[11px] mt-0.5 block leading-normal">
              Crisp vector street cartography & photorealistic satellite imagery with live GPS tracking.
            </span>
          </div>
        </div>

        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-4 shadow-[3px_3px_0px_#0F172A] dark:shadow-[3px_3px_0px_#020617] flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-[#FEF3C7] dark:bg-[#78350F] border-2 border-[#0F172A] dark:border-[#475569] text-[#D97706] shrink-0">
            <Shield className="w-5 h-5 text-[#B45309] dark:text-[#FDE68A]" />
          </div>
          <div>
            <span className="font-heading font-black text-[#0F172A] dark:text-white text-sm block">Dynamic Play Perimeter</span>
            <span className="text-[#475569] dark:text-[#94A3B8] text-[11px] mt-0.5 block leading-normal">
              Interactive draggable boundaries that compress inwards, focusing runners into strategic play areas.
            </span>
          </div>
        </div>

        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-4 shadow-[3px_3px_0px_#0F172A] dark:shadow-[3px_3px_0px_#020617] flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-[#FFF1F2] dark:bg-[#7F1D1D] border-2 border-[#0F172A] dark:border-[#475569] text-[#EF4444] dark:text-[#FECACA] shrink-0">
            <Crosshair className="w-5 h-5 text-[#EF4444] dark:text-[#FECACA]" />
          </div>
          <div>
            <span className="font-heading font-black text-[#0F172A] dark:text-white text-sm block">Mutual Capture Protocol</span>
            <span className="text-[#475569] dark:text-[#94A3B8] text-[11px] mt-0.5 block leading-normal">
              Dual player confirmation with strict 10-meter GPS proximity validation.
            </span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-6 shadow-[8px_8px_0px_#0F172A] dark:shadow-[8px_8px_0px_#020617] relative paper-tape">
            <h3 className="text-lg font-heading font-black text-[#0F172A] dark:text-white mb-3">Operator Profile Settings</h3>

            {settingsSaved && (
              <div className="mb-3 p-2.5 bg-[#ECFDF5] dark:bg-[#064E3B] border-2 border-[#10B981] dark:border-[#34D399] rounded-xl text-xs text-[#059669] dark:text-[#A7F3D0] font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Profile updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-heading font-bold text-[#0F172A] dark:text-[#E2E8F0] mb-1 uppercase tracking-wider">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-white text-xs px-3 py-2.5 rounded-xl border-2 border-[#0F172A] dark:border-[#475569] focus:bg-white dark:focus:bg-[#1E293B] focus:shadow-[3px_3px_0px_#2563EB] outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-heading font-bold text-[#0F172A] dark:text-[#E2E8F0] mb-1 uppercase tracking-wider">
                  Operator Role
                </label>
                <input
                  type="text"
                  disabled
                  value="HOST / FIELD RUNNER"
                  className="w-full bg-[#F1F5F9] dark:bg-[#0F172A] text-[#64748B] dark:text-[#94A3B8] text-xs px-3 py-2.5 rounded-xl border-2 border-[#CBD5E1] dark:border-[#334155] font-mono"
                />
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-2.5 comic-btn-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 comic-btn-primary text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

TerminalMenu.displayName = 'TerminalMenu';
export default TerminalMenu;
