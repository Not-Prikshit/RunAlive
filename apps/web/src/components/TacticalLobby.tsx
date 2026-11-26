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
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  SocketEvent,
  PlayerRole,
  type PartySummary,
  type PartyMemberSummary,
} from '@runalive/shared';
import { PartyCommunicationPanel } from './PartyCommunicationPanel';

interface TacticalLobbyProps {
  partyId?: string;
  gameId?: string;
  currentUserId: string;
  isHost?: boolean;
  onStartMatch: (matchId?: string) => void;
  onOpenTacticalMap: () => void;
  onExit: () => void;
}

export const TacticalLobby: React.FC<TacticalLobbyProps> = React.memo(({
  partyId,
  gameId,
  currentUserId,
  isHost: initialIsHost = false,
  onStartMatch,
  onOpenTacticalMap,
  onExit,
}) => {
  const [party, setParty] = useState<PartySummary | null>(null);
  const [roomCode, setRoomCode] = useState('------');
  const [operationName, setOperationName] = useState('CAMPUS SURVIVAL RUN');
  const [status, setStatus] = useState('OPEN');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lockWhenMatchStarts, setLockWhenMatchStarts] = useState(true);
  const [revealSeekersOnMap, setRevealSeekersOnMap] = useState(true);
  const [draggedOperatorId, setDraggedOperatorId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'RUNNER' | 'SEEKER' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectivePartyId = partyId || party?.id || gameId || '';
  const isHost = party ? party.leaderUserId === currentUserId : initialIsHost;

  // Load Party or Game state
  useEffect(() => {
    let mounted = true;

    if (partyId) {
      api
        .get<{ party: PartySummary }>(`/parties/${partyId}`)
        .then((res) => {
          if (!mounted) return;
          if (res.party) {
            setParty(res.party);
            setRoomCode(res.party.partyCode);
            setStatus(res.party.status);
            setLockWhenMatchStarts(res.party.lockWhenMatchStarts);
            setRevealSeekersOnMap(res.party.revealSeekersOnMap);
          }
        })
        .catch((err) => {
          console.warn('Could not load party directly:', err);
        });
    } else if (gameId) {
      // Fallback for legacy gameId
      api
        .get<any>(`/games/${gameId}`)
        .then((res) => {
          if (!mounted) return;
          const g = res?.game || res;
          if (g?.roomCode) setRoomCode(g.roomCode);
          if (g?.name) setOperationName(g.name);
        })
        .catch(() => {});
    }

    const socket = connectSocket();

    // Join party socket room
    if (effectivePartyId) {
      socket.emit('party:join', { partyId: effectivePartyId });
    }

    const handlePartyUpdated = (data: { party: PartySummary }) => {
      if (data?.party && (!partyId || data.party.id === partyId)) {
        setParty(data.party);
        setRoomCode(data.party.partyCode);
        setStatus(data.party.status);
        setLockWhenMatchStarts(data.party.lockWhenMatchStarts);
        setRevealSeekersOnMap(data.party.revealSeekersOnMap);
      }
    };

    const handleMatchStarted = (data: { matchId: string; roomCode: string }) => {
      if (data?.matchId) {
        onStartMatch(data.matchId);
      } else {
        onStartMatch();
      }
    };

    socket.on(SocketEvent.PARTY_UPDATED, handlePartyUpdated);
    socket.on('party:updated', handlePartyUpdated);
    socket.on(SocketEvent.PARTY_MATCH_STARTED, handleMatchStarted);
    socket.on('party:match_started', handleMatchStarted);
    socket.on(SocketEvent.GAME_STARTED, () => onStartMatch());
    socket.on('game_started', () => onStartMatch());

    return () => {
      mounted = false;
      if (effectivePartyId) {
        socket.emit('party:leave', { partyId: effectivePartyId });
      }
      socket.off(SocketEvent.PARTY_UPDATED, handlePartyUpdated);
      socket.off('party:updated', handlePartyUpdated);
      socket.off(SocketEvent.PARTY_MATCH_STARTED, handleMatchStarted);
      socket.off('party:match_started', handleMatchStarted);
      socket.off(SocketEvent.GAME_STARTED);
      socket.off('game_started');
    };
  }, [partyId, gameId, effectivePartyId, onStartMatch]);

  const members: PartyMemberSummary[] = party?.members || [];
  const hiders = members.filter((m) => m.role === PlayerRole.RUNNER);
  const seekers = members.filter((m) => m.role === PlayerRole.SEEKER || m.role === PlayerRole.HOST);

  const myMember = members.find((m) => m.userId === currentUserId);
  const isReady = myMember?.isReady ?? true;

  // Copy & Share Party Code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareInvitation = async () => {
    const shareText = `Join my RunAlive squad! Room code: ${roomCode}`;
    const shareUrl = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RunAlive Party Invitation',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {}
    }
    navigator.clipboard.writeText(`${shareText} (${shareUrl})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Switch team role
  const handleSwitchTeam = async (targetUserId: string, targetRole: PlayerRole) => {
    if (!isHost && targetUserId !== currentUserId) {
      setError('Only the party leader can assign other players to teams.');
      return;
    }

    try {
      if (partyId) {
        const res = await api.patch<{ party: PartySummary }>(
          `/parties/${partyId}/members/${targetUserId}`,
          { role: targetRole }
        );
        if (res.party) setParty(res.party);
      } else if (gameId) {
        await api.post(`/games/${gameId}/teams/assign`, {
          userId: targetUserId,
          role: targetRole,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to switch team.');
    }
  };

  const handleDrop = async (targetRole: PlayerRole) => {
    if (!draggedOperatorId) return;
    await handleSwitchTeam(draggedOperatorId, targetRole);
    setDraggedOperatorId(null);
    setDragOverZone(null);
  };

  // Toggle ready state
  const handleToggleReady = async () => {
    const nextReady = !isReady;
    try {
      if (partyId) {
        const res = await api.post<{ party: PartySummary }>(`/parties/${partyId}/ready`, {
          isReady: nextReady,
        });
        if (res.party) setParty(res.party);
      } else if (gameId) {
        await api.post(`/games/${gameId}/ready`, { isReady: nextReady });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to toggle ready status.');
    }
  };

  // Kick member
  const handleKickPlayer = async (targetUserId: string) => {
    try {
      if (partyId) {
        const res = await api.delete<{ party: PartySummary }>(
          `/parties/${partyId}/members/${targetUserId}`
        );
        if (res.party) setParty(res.party);
      } else if (gameId) {
        await api.post(`/games/${gameId}/kick`, { userId: targetUserId });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to kick player.');
    }
  };

  // Toggle settings
  const handleToggleLockRoom = async () => {
    if (!isHost || !partyId) return;
    const nextVal = !lockWhenMatchStarts;
    setLockWhenMatchStarts(nextVal);
    try {
      const res = await api.patch<{ party: PartySummary }>(`/parties/${partyId}/settings`, {
        lockWhenMatchStarts: nextVal,
      });
      if (res.party) setParty(res.party);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting.');
    }
  };

  const handleToggleRevealSeekers = async () => {
    if (!isHost || !partyId) return;
    const nextVal = !revealSeekersOnMap;
    setRevealSeekersOnMap(nextVal);
    try {
      const res = await api.patch<{ party: PartySummary }>(`/parties/${partyId}/settings`, {
        revealSeekersOnMap: nextVal,
      });
      if (res.party) setParty(res.party);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting.');
    }
  };

  // Leave party
  const handleLeaveParty = async () => {
    try {
      if (partyId) {
        await api.post(`/parties/${partyId}/leave`, {});
      } else if (gameId) {
        await api.post(`/games/${gameId}/leave`, {});
      }
    } catch {}
    onExit();
  };

  // Start match
  const handleStartMatch = async () => {
    if (members.length < 1) {
      setError('At least 1 player is required to start.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (partyId) {
        const res = await api.post<{ match: { matchId: string; roomCode: string } }>(
          `/parties/${partyId}/start-match`,
          {
            name: operationName,
            roundDurationMinutes: 15,
            totalRounds: 1,
          }
        );
        if (res.match?.matchId) {
          onStartMatch(res.match.matchId);
        } else {
          onStartMatch();
        }
      } else if (gameId) {
        await api.post(`/games/${gameId}/start`, {});
        onStartMatch(gameId);
      }
    } catch (err: any) {
      setError(err.message || 'Could not start match. Check squad readiness.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header Card */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-[4px_4px_0px_#0F172A] dark:shadow-[4px_4px_0px_#020617] relative paper-tape">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={handleLeaveParty}
            className="p-2.5 bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] border-2 border-[#0F172A] dark:border-[#475569] text-[#0F172A] dark:text-white rounded-xl shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            title="Leave Party"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#2563EB] dark:text-[#93C5FD] border-[#0F172A] dark:border-[#475569] text-[10px]">
                ✦ PARTY GATHERING
              </span>
              <span className="text-[#CBD5E1] dark:text-[#475569] hidden sm:inline">|</span>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] hidden sm:inline">
                {members.length} SQUAD MEMBERS
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-[#0F172A] dark:text-white tracking-tight">
              {operationName}
            </h1>
          </div>
        </div>

        {/* Party Code Display with Copy & Share Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="bg-[#FEF7E0] dark:bg-[#78350F]/80 border-2 border-[#0F172A] dark:border-[#475569] px-3.5 py-1.5 rounded-xl flex items-center space-x-2.5 shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617]">
            <div>
              <span className="text-[9px] font-heading font-bold text-[#B45309] dark:text-[#FDE68A] uppercase block">
                PARTY CODE
              </span>
              <span className="text-sm sm:text-base font-mono font-black text-[#0F172A] dark:text-white tracking-widest">
                {roomCode}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={handleCopyCode}
                className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#FAF8F5] text-[#0F172A] dark:text-white rounded-lg border-2 border-[#0F172A] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#0F172A] transition cursor-pointer"
                title="Copy Party Code"
              >
                {copied ? <Check className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleShareInvitation}
                className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#FAF8F5] text-[#2563EB] dark:text-[#93C5FD] rounded-lg border-2 border-[#0F172A] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#0F172A] transition cursor-pointer"
                title="Share Invitation"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Ready State Toggle */}
          <button
            onClick={handleToggleReady}
            className={`px-3.5 py-2 rounded-xl border-2 border-[#0F172A] dark:border-[#475569] text-xs font-heading font-bold shadow-[2px_2px_0px_#0F172A] active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5 ${
              isReady
                ? 'bg-[#E6F4EA] text-[#1E8E3E] dark:bg-[#064E3B] dark:text-[#86EFAC]'
                : 'bg-[#FEF7E0] text-[#B45309] dark:bg-[#78350F] dark:text-[#FDE68A]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>{isReady ? 'READY' : 'STANDBY'}</span>
          </button>

          {/* Host Start Match Button */}
          {isHost && (
            <button
              onClick={handleStartMatch}
              disabled={loading}
              className="px-4 sm:px-5 py-2 comic-btn-green text-xs sm:text-sm flex items-center space-x-2 disabled:opacity-60"
            >
              <Play className="w-4 h-4" />
              <span>{loading ? 'Launching...' : 'Start Match'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#FCE8E6] dark:bg-[#7F1D1D] border-2 border-[#EA4335] rounded-xl text-xs text-[#EA4335] dark:text-[#FECACA] font-bold flex items-center justify-between shadow-[2.5px_2.5px_0px_#EA4335]">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#EA4335] dark:text-[#FECACA] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Host Controls Bar */}
      {isHost && (
        <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-3 rounded-xl flex flex-wrap items-center justify-between text-xs font-mono text-[#475569] dark:text-[#94A3B8] gap-3 shadow-[3px_3px_0px_#0F172A] dark:shadow-[3px_3px_0px_#020617]">
          <div className="flex items-center space-x-3">
            <span className="text-[#0F172A] dark:text-white font-heading font-black flex items-center space-x-1">
              <Shield className="w-4 h-4 text-[#2563EB]" />
              <span>HOST CONTROLS:</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lock Room Toggle */}
            <button
              onClick={handleToggleLockRoom}
              className={`px-3 py-1.5 rounded-xl border-2 border-[#0F172A] text-xs font-heading font-bold shadow-[1.5px_1.5px_0px_#0F172A] active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5 ${
                lockWhenMatchStarts
                  ? 'bg-[#E8F0FE] text-[#2563EB] dark:bg-[#1E3A8A] dark:text-[#93C5FD]'
                  : 'bg-[#F1F5F9] text-[#64748B] dark:bg-[#0F172A]'
              }`}
              title="When enabled, prevents new joins and re-entry after match starts"
            >
              {lockWhenMatchStarts ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>Lock Room on Start: {lockWhenMatchStarts ? 'ON' : 'OFF'}</span>
            </button>

            {/* Seeker Visibility Toggle */}
            <button
              onClick={handleToggleRevealSeekers}
              className={`px-3 py-1.5 rounded-xl border-2 border-[#0F172A] text-xs font-heading font-bold shadow-[1.5px_1.5px_0px_#0F172A] active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5 ${
                revealSeekersOnMap
                  ? 'bg-[#E8F0FE] text-[#2563EB] dark:bg-[#1E3A8A] dark:text-[#93C5FD]'
                  : 'bg-[#FEE2E2] text-[#EF4444] dark:bg-[#7F1D1D] dark:text-[#FECACA]'
              }`}
              title="Show or hide seekers on map radar"
            >
              {revealSeekersOnMap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Seekers on Radar: {revealSeekersOnMap ? 'VISIBLE' : 'HIDDEN'}</span>
            </button>

            {/* Adjust Perimeter */}
            <button
              onClick={onOpenTacticalMap}
              className="px-3 py-1.5 comic-btn-white text-xs flex items-center space-x-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Perimeter Editor</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Teams & Live Communication Panel */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left Column: Two Team Pillars (Hiders & Seekers) */}
        <div className="lg:col-span-2 grid md:grid-cols-2 gap-5">
          {/* TEAM 1: HIDERS (Blue) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverZone('RUNNER');
            }}
            onDragLeave={() => setDragOverZone(null)}
            onDrop={() => handleDrop(PlayerRole.RUNNER)}
            className={`comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-5 flex flex-col justify-between min-h-[420px] transition-all rounded-2xl ${
              dragOverZone === 'RUNNER'
                ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 shadow-[6px_6px_0px_#2563EB]'
                : 'shadow-[5px_5px_0px_#2563EB]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] dark:border-[#475569] pb-3 mb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A8A] text-[#2563EB] dark:text-[#93C5FD] border-2 border-[#0F172A] dark:border-[#475569] shadow-[2px_2px_0px_#0F172A]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-heading font-black text-[#0F172A] dark:text-white flex items-center space-x-1.5">
                      <span>HIDERS</span>
                      <span className="text-xs font-mono font-bold text-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A8A] dark:text-[#93C5FD] px-2 py-0.5 rounded-full border border-[#0F172A] dark:border-[#475569]">
                        {hiders.length}
                      </span>
                    </h2>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Evade seekers, monitor safe-zone meter</p>
                  </div>
                </div>
              </div>

              {/* Hiders List */}
              <div className="space-y-2.5">
                {hiders.map((m) => (
                  <div
                    key={m.userId}
                    draggable={isHost || m.userId === currentUserId}
                    onDragStart={() => setDraggedOperatorId(m.userId)}
                    className={`p-3 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border-2 border-[#0F172A] dark:border-[#475569] flex items-center justify-between transition cursor-grab active:cursor-grabbing shadow-[2px_2px_0px_#0F172A] ${
                      m.userId === currentUserId ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border-[#2563EB]' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <GripVertical className="w-4 h-4 text-[#94A3B8] shrink-0" />
                      <div className="relative">
                        <div className="w-8 h-8 rounded-lg bg-[#2563EB] border border-[#0F172A] flex items-center justify-center font-heading font-bold text-xs text-white">
                          {m.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#0F172A] ${
                            m.isConnected ? 'bg-[#10B981]' : 'bg-[#94A3B8]'
                          }`}
                          title={m.isConnected ? 'Connected' : 'Disconnected'}
                        />
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-heading font-bold text-[#0F172A] dark:text-white">
                            {m.displayName}
                          </span>
                          {m.userId === currentUserId && (
                            <span className="text-[9px] font-mono font-bold bg-[#FBBC04] text-[#0F172A] px-1.5 rounded border border-[#0F172A]">
                              YOU
                            </span>
                          )}
                          {m.isHost && (
                            <span className="text-[9px] font-mono font-bold bg-[#EFF6FF] text-[#2563EB] px-1.5 rounded border border-[#2563EB]">
                              HOST
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-[#0F172A] dark:border-[#475569] ${
                          m.isReady
                            ? 'bg-[#E6F4EA] text-[#1E8E3E] dark:bg-[#064E3B] dark:text-[#86EFAC]'
                            : 'bg-[#FEF7E0] text-[#B45309] dark:bg-[#78350F] dark:text-[#FDE68A]'
                        }`}
                      >
                        {m.isReady ? 'READY' : 'STANDBY'}
                      </span>

                      {/* Switch team button */}
                      {(isHost || m.userId === currentUserId) && (
                        <button
                          onClick={() => handleSwitchTeam(m.userId, PlayerRole.SEEKER)}
                          title="Move to Seekers"
                          className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#FCE8E6] text-[#EA4335] rounded-lg border-2 border-[#0F172A] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#0F172A] text-[10px] font-heading font-bold flex items-center space-x-1 active:translate-y-0.5 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span className="hidden sm:inline">To Seekers</span>
                        </button>
                      )}

                      {isHost && m.userId !== currentUserId && (
                        <button
                          onClick={() => handleKickPlayer(m.userId)}
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
                  <div className="py-8 text-center border-2 border-dashed border-[#CBD5E1] dark:border-[#475569] rounded-xl text-xs font-mono text-[#94A3B8]">
                    Drag players here or tap "To Hiders" to assign
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TEAM 2: SEEKERS (Red) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverZone('SEEKER');
            }}
            onDragLeave={() => setDragOverZone(null)}
            onDrop={() => handleDrop(PlayerRole.SEEKER)}
            className={`comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] p-5 flex flex-col justify-between min-h-[420px] transition-all rounded-2xl ${
              dragOverZone === 'SEEKER'
                ? 'border-[#EA4335] bg-[#FFF1F2] dark:bg-[#7F1D1D]/30 shadow-[6px_6px_0px_#EA4335]'
                : 'shadow-[5px_5px_0px_#EA4335]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] dark:border-[#475569] pb-3 mb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 rounded-xl bg-[#FFF1F2] dark:bg-[#7F1D1D] text-[#EA4335] dark:text-[#FECACA] border-2 border-[#0F172A] dark:border-[#475569] shadow-[2px_2px_0px_#0F172A]">
                    <Crosshair className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-heading font-black text-[#0F172A] dark:text-white flex items-center space-x-1.5">
                      <span>SEEKERS</span>
                      <span className="text-xs font-mono font-bold text-[#EA4335] bg-[#FFF1F2] dark:bg-[#7F1D1D] dark:text-[#FECACA] px-2 py-0.5 rounded-full border border-[#0F172A] dark:border-[#475569]">
                        {seekers.length}
                      </span>
                    </h2>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Track down hiders, close 10m tag radius</p>
                  </div>
                </div>
              </div>

              {/* Seekers List */}
              <div className="space-y-2.5">
                {seekers.map((m) => (
                  <div
                    key={m.userId}
                    draggable={isHost || m.userId === currentUserId}
                    onDragStart={() => setDraggedOperatorId(m.userId)}
                    className={`p-3 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border-2 border-[#0F172A] dark:border-[#475569] flex items-center justify-between transition cursor-grab active:cursor-grabbing shadow-[2px_2px_0px_#0F172A] ${
                      m.userId === currentUserId ? 'bg-[#FFF1F2] dark:bg-[#7F1D1D]/40 border-[#EA4335]' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <GripVertical className="w-4 h-4 text-[#94A3B8] shrink-0" />
                      <div className="relative">
                        <div className="w-8 h-8 rounded-lg bg-[#EA4335] border border-[#0F172A] flex items-center justify-center font-heading font-bold text-xs text-white">
                          {m.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#0F172A] ${
                            m.isConnected ? 'bg-[#10B981]' : 'bg-[#94A3B8]'
                          }`}
                          title={m.isConnected ? 'Connected' : 'Disconnected'}
                        />
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-heading font-bold text-[#0F172A] dark:text-white">
                            {m.displayName}
                          </span>
                          {m.userId === currentUserId && (
                            <span className="text-[9px] font-mono font-bold bg-[#FBBC04] text-[#0F172A] px-1.5 rounded border border-[#0F172A]">
                              YOU
                            </span>
                          )}
                          {m.isHost && (
                            <span className="text-[9px] font-mono font-bold bg-[#EFF6FF] text-[#2563EB] px-1.5 rounded border border-[#2563EB]">
                              HOST
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-[#0F172A] dark:border-[#475569] ${
                          m.isReady
                            ? 'bg-[#E6F4EA] text-[#1E8E3E] dark:bg-[#064E3B] dark:text-[#86EFAC]'
                            : 'bg-[#FEF7E0] text-[#B45309] dark:bg-[#78350F] dark:text-[#FDE68A]'
                        }`}
                      >
                        {m.isReady ? 'READY' : 'STANDBY'}
                      </span>

                      {/* Switch team button */}
                      {(isHost || m.userId === currentUserId) && (
                        <button
                          onClick={() => handleSwitchTeam(m.userId, PlayerRole.RUNNER)}
                          title="Move to Hiders"
                          className="p-1.5 bg-white dark:bg-[#1E293B] hover:bg-[#EFF6FF] text-[#2563EB] rounded-lg border-2 border-[#0F172A] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#0F172A] text-[10px] font-heading font-bold flex items-center space-x-1 active:translate-y-0.5 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span className="hidden sm:inline">To Hiders</span>
                        </button>
                      )}

                      {isHost && m.userId !== currentUserId && (
                        <button
                          onClick={() => handleKickPlayer(m.userId)}
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
                  <div className="py-8 text-center border-2 border-dashed border-[#CBD5E1] dark:border-[#475569] rounded-xl text-xs font-mono text-[#94A3B8]">
                    Drag players here or tap "To Seekers" to assign
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Squad Communication (Chat & Announcements Notice Board) */}
        <div className="lg:col-span-1">
          {effectivePartyId ? (
            <PartyCommunicationPanel
              partyId={effectivePartyId}
              currentUserId={currentUserId}
              isHost={isHost}
              className="h-full min-h-[420px]"
            />
          ) : (
            <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] p-6 rounded-2xl text-center text-xs font-mono text-[#94A3B8]">
              Party communication unavailable until room is established.
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TacticalLobby.displayName = 'TacticalLobby';
export default TacticalLobby;
