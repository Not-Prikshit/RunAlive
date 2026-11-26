import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import {
  Users,
  Shield,
  Crosshair,
  Shuffle,
  Play,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Radio,
  GripVertical,
  Sliders,
  Copy,
  Check,
  UserCheck,
  Compass,
  UserX,
  Sparkles,
  AlertCircle,
  HelpCircle,
  MapPin,
  ArrowRightLeft,
  Share2,
} from 'lucide-react';
import { SocketEvent } from '@runalive/shared';

interface Operator {
  id: string;
  displayName: string;
  role: 'RUNNER' | 'SEEKER';
  isReady: boolean;
  operatorNumber: string;
}

interface TacticalLobbyProps {
  gameId: string;
  currentUserId: string;
  isHost: boolean;
  onStartMatch: () => void;
  onOpenTacticalMap: () => void;
  onExit: () => void;
}

export const TacticalLobby: React.FC<TacticalLobbyProps> = React.memo(({
  gameId,
  currentUserId,
  isHost,
  onStartMatch,
  onOpenTacticalMap,
  onExit,
}) => {
  const [roomCode, setRoomCode] = useState('------');
  const [operationName, setOperationName] = useState('CAMPUS SURVIVAL RUN');
  const [status, setStatus] = useState('LOBBY');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allowTeamSwitching, setAllowTeamSwitching] = useState(true);
  const [draggedOperatorId, setDraggedOperatorId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'RUNNER' | 'SEEKER' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Operator Roster state
  const [operators, setOperators] = useState<Operator[]>([
    {
      id: currentUserId,
      displayName: 'YOU',
      role: 'RUNNER',
      isReady: true,
      operatorNumber: '#P-01',
    },
  ]);

  // Load Game state from backend
  useEffect(() => {
    let mounted = true;
    api
      .get<any>(`/games/${gameId}`)
      .then((res) => {
        if (!mounted) return;
        const g = res?.game || res;
        if (!g) return;
        if (g.roomCode) setRoomCode(g.roomCode);
        if (g.name) setOperationName(g.name);
        if (g.status) setStatus(g.status);
        if (g.allowTeamSwitching !== undefined) {
          setAllowTeamSwitching(g.allowTeamSwitching);
        }

        if (g.players && g.players.length > 0) {
          const mapped: Operator[] = g.players.map((p: any, idx: number) => ({
            id: p.userId || p.id,
            displayName: p.displayName || `OPERATOR_${idx + 1}`,
            role: p.role === 'SEEKER' ? 'SEEKER' : 'RUNNER',
            isReady: p.isReady ?? true,
            operatorNumber: `#P-0${idx + 1}`,
          }));
          setOperators(mapped);
        }
      })
      .catch((err) => {
        console.error('Failed to load game details:', err);
      });

    // Real-time socket sync
    const socket = connectSocket();

    const handleLobbyUpdate = (data: any) => {
      if (data?.players) {
        const mapped: Operator[] = data.players.map((p: any, idx: number) => ({
          id: p.userId,
          displayName: p.displayName,
          role: p.role === 'SEEKER' ? 'SEEKER' : 'RUNNER',
          isReady: p.isReady,
          operatorNumber: `#P-0${idx + 1}`,
        }));
        setOperators(mapped);
      }
    };

    socket.on(SocketEvent.LOBBY_UPDATED, handleLobbyUpdate);
    socket.on('lobby_updated', handleLobbyUpdate);

    socket.on(SocketEvent.GAME_STARTED, () => {
      onStartMatch();
    });
    socket.on('game_started', () => {
      onStartMatch();
    });

    return () => {
      mounted = false;
      socket.off(SocketEvent.LOBBY_UPDATED);
      socket.off('lobby_updated');
      socket.off(SocketEvent.GAME_STARTED);
      socket.off('game_started');
    };
  }, [gameId, onStartMatch]);

  const hiders = operators.filter((o) => o.role === 'RUNNER');
  const seekers = operators.filter((o) => o.role === 'SEEKER');

  // Copy & Share Game Invitation Code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareInvitation = async () => {
    const shareText = `Join my RunAlive outdoor tag match! Room code: ${roomCode}`;
    const shareUrl = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RunAlive Match Invitation',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard if share cancelled
      }
    }
    navigator.clipboard.writeText(`${shareText} (${shareUrl})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Switch team function (Touch & drag friendly)
  const handleSwitchTeam = async (userId: string, targetRole: 'RUNNER' | 'SEEKER') => {
    if (!isHost && !allowTeamSwitching && userId !== currentUserId) {
      setError('Team switching is restricted by the match host.');
      return;
    }

    setOperators((prev) =>
      prev.map((op) => (op.id === userId ? { ...op, role: targetRole } : op))
    );

    try {
      await api.post(`/games/${gameId}/teams/assign`, {
        userId,
        role: targetRole,
      });
    } catch {}
  };

  // Drag and drop assignment handler
  const handleDrop = async (targetRole: 'RUNNER' | 'SEEKER') => {
    if (!draggedOperatorId) return;
    await handleSwitchTeam(draggedOperatorId, targetRole);
    setDraggedOperatorId(null);
    setDragOverZone(null);
  };

  const handleToggleReady = async () => {
    const me = operators.find((o) => o.id === currentUserId);
    const newReady = !me?.isReady;
    setOperators((prev) =>
      prev.map((o) => (o.id === currentUserId ? { ...o, isReady: newReady } : o))
    );

    try {
      await api.post(`/games/${gameId}/ready`, { isReady: newReady });
    } catch {}
  };

  const handleRandomizeTeams = async () => {
    setLoading(true);
    try {
      await api.post(`/games/${gameId}/teams/randomize`, {
        seekerRatio: 0.35,
      });
    } catch {
      // Local shuffle fallback
      setOperators((prev) => {
        const shuffled = [...prev];
        const seekerCount = Math.max(1, Math.floor(shuffled.length * 0.35));
        shuffled.forEach((op, i) => {
          op.role = i < seekerCount ? 'SEEKER' : 'RUNNER';
        });
        return [...shuffled];
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKickPlayer = async (userId: string) => {
    try {
      await api.post(`/games/${gameId}/kick`, { userId });
      setOperators((prev) => prev.filter((p) => p.id !== userId));
    } catch (err: any) {
      setError(err.message || 'Could not kick player');
    }
  };

  const handleStartGame = async () => {
    if (seekers.length === 0 || hiders.length === 0) {
      setError('Both Hiders and Seekers must have at least 1 player to start.');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/games/${gameId}/start`, {});
      onStartMatch();
    } catch (err: any) {
      setError(err.message || 'Cannot start match. Both teams require at least 1 player.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header Card */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] relative paper-tape">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onExit}
            className="p-2.5 bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] border-2 border-[#18181B] dark:border-[#475569] text-[#18181B] dark:text-white rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            title="Leave Lobby"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] border-[#18181B] dark:border-[#475569] text-[10px]">
                ✦ MATCH ROSTER
              </span>
              <span className="text-[#CBD5E1] dark:text-[#475569] hidden sm:inline">|</span>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] hidden sm:inline">REAL-TIME SYNC</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-[#18181B] dark:text-white tracking-tight">
              {operationName}
            </h1>
          </div>
        </div>

        {/* Room Code Display with Copy & Share Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="bg-[#FEF7E0] dark:bg-[#78350F]/80 border-2 border-[#18181B] dark:border-[#475569] px-3.5 py-1.5 rounded-xl flex items-center space-x-2.5 shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617]">
            <div>
              <span className="text-[9px] font-heading font-bold text-[#B45309] dark:text-[#FDE68A] uppercase block">ROOM CODE</span>
              <span className="text-sm sm:text-base font-mono font-black text-[#18181B] dark:text-white tracking-widest">
                {roomCode}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={handleCopyCode}
                className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#FAF8F5] text-[#18181B] dark:text-white rounded-lg border-2 border-[#18181B] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#18181B] transition cursor-pointer"
                title="Copy Room Invitation Code"
              >
                {copied ? <Check className="w-4 h-4 text-[#34A853]" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleShareInvitation}
                className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#FAF8F5] text-[#4285F4] dark:text-[#93C5FD] rounded-lg border-2 border-[#18181B] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#18181B] transition cursor-pointer"
                title="Share Invitation"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            onClick={handleToggleReady}
            className="px-3.5 py-2 comic-btn-white text-xs flex items-center space-x-1.5"
          >
            <UserCheck className="w-4 h-4 text-[#34A853]" />
            <span className="hidden sm:inline">Ready State</span>
          </button>

          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={loading}
              className="px-4 sm:px-5 py-2 comic-btn-green text-xs sm:text-sm flex items-center space-x-2 disabled:opacity-60"
            >
              <Play className="w-4 h-4" />
              <span>{loading ? 'Starting...' : 'Start Match'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#FCE8E6] border-2 border-[#EA4335] rounded-xl text-xs text-[#EA4335] font-bold flex items-center justify-between shadow-[2.5px_2.5px_0px_#EA4335]">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#EA4335] hover:text-[#18181B] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Host Controls Sub-Bar */}
      {isHost && (
        <div className="comic-card bg-white p-3 rounded-xl flex flex-wrap items-center justify-between text-xs font-mono text-[#475569] gap-3 shadow-[3px_3px_0px_#18181B]">
          <div className="flex items-center space-x-3">
            <span className="text-[#18181B] font-heading font-black flex items-center space-x-1">
              <Shield className="w-4 h-4 text-[#4285F4]" />
              <span>HOST CONTROLS:</span>
            </span>
            <span className="hidden sm:inline">Drag players or tap "Switch Team" on any player card.</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRandomizeTeams}
              disabled={loading}
              className="px-3 py-1.5 comic-btn-yellow text-xs flex items-center space-x-1.5"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#18181B]" />
              <span>Auto-Balance</span>
            </button>
            <button
              onClick={onOpenTacticalMap}
              className="px-3 py-1.5 comic-btn-white text-xs flex items-center space-x-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-[#4285F4]" />
              <span>Adjust Perimeter</span>
            </button>
          </div>
        </div>
      )}

      {/* Two Team Pillars: HIDERS vs SEEKERS */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* TEAM 1: HIDERS / RUNNERS (Google Blue Palette) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverZone('RUNNER');
          }}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={() => handleDrop('RUNNER')}
          className={`comic-card bg-white p-5 flex flex-col justify-between min-h-[420px] transition-all ${
            dragOverZone === 'RUNNER'
              ? 'border-[#4285F4] bg-[#E8F0FE] shadow-[6px_6px_0px_#4285F4]'
              : 'shadow-[5px_5px_0px_#4285F4]'
          }`}
        >
          <div>
            {/* Team Header */}
            <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] pb-3 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 rounded-xl bg-[#E8F0FE] text-[#4285F4] border-2 border-[#18181B] shadow-[2px_2px_0px_#18181B]">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-heading font-black text-[#18181B] flex items-center space-x-1.5">
                    <span>HIDERS</span>
                    <span className="text-xs font-mono font-bold text-[#4285F4] bg-[#E8F0FE] px-2 py-0.5 rounded-full border border-[#18181B]">
                      {hiders.length}
                    </span>
                  </h2>
                  <p className="text-[11px] text-[#64748B]">Evade seekers, monitor danger meter, survive safe zone</p>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div className="space-y-2.5">
              {hiders.map((op) => (
                <div
                  key={op.id}
                  draggable={isHost || (allowTeamSwitching && op.id === currentUserId)}
                  onDragStart={() => setDraggedOperatorId(op.id)}
                  className={`p-3 bg-[#FAF8F5] rounded-xl border-2 border-[#18181B] flex items-center justify-between transition cursor-grab active:cursor-grabbing shadow-[2px_2px_0px_#18181B] hover:shadow-[3.5px_3.5px_0px_#4285F4] ${
                    op.id === currentUserId ? 'bg-[#E8F0FE] border-[#4285F4]' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <GripVertical className="w-4 h-4 text-[#94A3B8] shrink-0" />
                    <div className="w-8 h-8 rounded-lg bg-[#4285F4] border border-[#18181B] flex items-center justify-center font-heading font-bold text-xs text-white">
                      {op.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-heading font-bold text-[#18181B]">
                          {op.displayName}
                        </span>
                        {op.id === currentUserId && (
                          <span className="text-[9px] font-mono font-bold bg-[#FBBC04] text-[#18181B] px-1.5 rounded border border-[#18181B]">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#64748B]">{op.operatorNumber}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-[#18181B] ${
                        op.isReady
                          ? 'bg-[#E6F4EA] text-[#1E8E3E]'
                          : 'bg-[#FEF7E0] text-[#B45309]'
                      }`}
                    >
                      {op.isReady ? 'READY' : 'STANDBY'}
                    </span>

                    {/* Touch-Friendly Switch Team Button */}
                    {(isHost || (allowTeamSwitching && op.id === currentUserId)) && (
                      <button
                        onClick={() => handleSwitchTeam(op.id, 'SEEKER')}
                        title="Move to Seekers"
                        className="p-1.5 bg-white hover:bg-[#FCE8E6] text-[#EA4335] rounded-lg border-2 border-[#18181B] shadow-[1.5px_1.5px_0px_#18181B] text-[10px] font-heading font-bold flex items-center space-x-1 active:translate-y-0.5 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        <span className="hidden sm:inline">To Seekers</span>
                      </button>
                    )}

                    {isHost && op.id !== currentUserId && (
                      <button
                        onClick={() => handleKickPlayer(op.id)}
                        className="p-1 text-[#EA4335] hover:bg-[#FCE8E6] rounded border border-[#CBD5E1]"
                        title="Kick Player"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {hiders.length === 0 && (
                <div className="py-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-xl text-xs font-mono text-[#94A3B8]">
                  Drag players here or tap "To Hiders" to assign
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TEAM 2: SEEKERS (Google Red Palette) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverZone('SEEKER');
          }}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={() => handleDrop('SEEKER')}
          className={`comic-card bg-white p-5 flex flex-col justify-between min-h-[420px] transition-all ${
            dragOverZone === 'SEEKER'
              ? 'border-[#EA4335] bg-[#FCE8E6] shadow-[6px_6px_0px_#EA4335]'
              : 'shadow-[5px_5px_0px_#EA4335]'
          }`}
        >
          <div>
            {/* Team Header */}
            <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] pb-3 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 rounded-xl bg-[#FCE8E6] text-[#EA4335] border-2 border-[#18181B] shadow-[2px_2px_0px_#18181B]">
                  <Crosshair className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-heading font-black text-[#18181B] flex items-center space-x-1.5">
                    <span>SEEKERS</span>
                    <span className="text-xs font-mono font-bold text-[#EA4335] bg-[#FCE8E6] px-2 py-0.5 rounded-full border border-[#18181B]">
                      {seekers.length}
                    </span>
                  </h2>
                  <p className="text-[11px] text-[#64748B]">Track down hiders, close 10m gap, verify captures</p>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div className="space-y-2.5">
              {seekers.map((op) => (
                <div
                  key={op.id}
                  draggable={isHost || (allowTeamSwitching && op.id === currentUserId)}
                  onDragStart={() => setDraggedOperatorId(op.id)}
                  className={`p-3 bg-[#FAF8F5] rounded-xl border-2 border-[#18181B] flex items-center justify-between transition cursor-grab active:cursor-grabbing shadow-[2px_2px_0px_#18181B] hover:shadow-[3.5px_3.5px_0px_#EA4335] ${
                    op.id === currentUserId ? 'bg-[#FCE8E6] border-[#EA4335]' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <GripVertical className="w-4 h-4 text-[#94A3B8] shrink-0" />
                    <div className="w-8 h-8 rounded-lg bg-[#EA4335] border border-[#18181B] flex items-center justify-center font-heading font-bold text-xs text-white">
                      {op.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-heading font-bold text-[#18181B]">
                          {op.displayName}
                        </span>
                        {op.id === currentUserId && (
                          <span className="text-[9px] font-mono font-bold bg-[#FBBC04] text-[#18181B] px-1.5 rounded border border-[#18181B]">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#64748B]">{op.operatorNumber}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-[#18181B] ${
                        op.isReady
                          ? 'bg-[#E6F4EA] text-[#1E8E3E]'
                          : 'bg-[#FEF7E0] text-[#B45309]'
                      }`}
                    >
                      {op.isReady ? 'READY' : 'STANDBY'}
                    </span>

                    {/* Touch-Friendly Switch Team Button */}
                    {(isHost || (allowTeamSwitching && op.id === currentUserId)) && (
                      <button
                        onClick={() => handleSwitchTeam(op.id, 'RUNNER')}
                        title="Move to Hiders"
                        className="p-1.5 bg-white hover:bg-[#E8F0FE] text-[#4285F4] rounded-lg border-2 border-[#18181B] shadow-[1.5px_1.5px_0px_#18181B] text-[10px] font-heading font-bold flex items-center space-x-1 active:translate-y-0.5 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        <span className="hidden sm:inline">To Hiders</span>
                      </button>
                    )}

                    {isHost && op.id !== currentUserId && (
                      <button
                        onClick={() => handleKickPlayer(op.id)}
                        className="p-1 text-[#EA4335] hover:bg-[#FCE8E6] rounded border border-[#CBD5E1]"
                        title="Kick Player"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {seekers.length === 0 && (
                <div className="py-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-xl text-xs font-mono text-[#94A3B8]">
                  Drag players here or tap "To Seekers" to assign
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TacticalLobby.displayName = 'TacticalLobby';
export default TacticalLobby;
