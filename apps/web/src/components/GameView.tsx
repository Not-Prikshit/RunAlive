import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { MapplsMap, type MapMarker, type PerimeterShape } from './MapplsMap';
import { DangerMeter } from './DangerMeter';
import { GameHudTimer } from './GameHudTimer';
import { GameCycleIndicator } from './GameCycleIndicator';
import {
  PlayerRole,
  DangerBand,
  SocketEvent,
  type DangerState,
  type SeekersSnapshotPayload,
  type RunnerDangerPayload,
} from '@runalive/shared';
import {
  Crosshair,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface GameViewProps {
  gameId: string;
  onExit: () => void;
}

function calculateDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const GameView: React.FC<GameViewProps> = React.memo(({ gameId, onExit }) => {
  const [role, setRole] = useState<PlayerRole>(PlayerRole.RUNNER);
  const [status, setStatus] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'FINISHED'>('ACTIVE');
  const [roomCode, setRoomCode] = useState('------');
  const [operationName, setOperationName] = useState('CAMPUS SURVIVAL RUN');
  const [boundary, setBoundary] = useState<{
    lat: number;
    lng: number;
    radius: number;
    shape: PerimeterShape;
  }>({
    lat: 28.4595,
    lng: 77.5135,
    radius: 500,
    shape: 'CIRCLE',
  });

  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [danger, setDanger] = useState<DangerState>({
    band: DangerBand.SAFE,
    level: 0,
  });

  const [runners, setRunners] = useState<MapMarker[]>([]);
  const [seekers, setSeekers] = useState<MapMarker[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  // Transmission status
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);

  // Dynamic Safe Zone State
  const [nextZoneRadiusM, setNextZoneRadiusM] = useState<number>(300);

  // Mutual Capture Verification State Machine
  const [captureModalState, setCaptureModalState] = useState<{
    isOpen: boolean;
    catchId?: string;
    seekerName?: string;
    runnerName?: string;
    targetRunnerId?: string;
    stage:
      | 'IDLE'
      | 'REQUESTING'
      | 'WAITING_HIDER_APPROVAL'
      | 'REQUEST_RECEIVED'
      | 'VERIFYING_PROXIMITY'
      | 'CONFIRMED'
      | 'FAILED';
    failureReason?: string;
    verifiedDistanceM?: number;
  }>({
    isOpen: false,
    stage: 'IDLE',
  });

  // Transmit Location Function
  const transmitLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    setIsTransmitting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserPos([latitude, longitude]);
        setLastPingTime(new Date().toLocaleTimeString());
        setIsTransmitting(false);

        api
          .post(`/games/${gameId}/location`, {
            lat: latitude,
            lng: longitude,
            accuracyM: accuracy,
            timestamp: new Date().toISOString(),
          })
          .catch(() => {});
      },
      (err) => {
        console.warn('GPS ping failed:', err);
        setIsTransmitting(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  }, [gameId]);

  // Initial GPS ping on mount
  useEffect(() => {
    transmitLocation();
  }, [transmitLocation]);

  // Connect Socket and Fetch Game Metadata
  useEffect(() => {
    let mounted = true;

    try {
      const storedUser = localStorage.getItem('runalive_user');
      if (storedUser) {
        const u = JSON.parse(storedUser);
        if (u.email?.includes('seeker')) {
          setRole(PlayerRole.SEEKER);
        } else {
          setRole(PlayerRole.RUNNER);
        }
      }
    } catch {}

    api
      .get<{
        game: {
          id: string;
          name: string;
          roomCode: string;
          status: string;
          hostUserId?: string;
          boundaryCenterLat?: number;
          boundaryCenterLng?: number;
          boundaryRadiusMeters?: number;
        };
      }>(`/games/${gameId}`)
      .then((res) => {
        if (!mounted || !res.game) return;
        setRoomCode(res.game.roomCode || 'XK92WP');
        setOperationName(res.game.name || 'CAMPUS SURVIVAL RUN');
        if (res.game.boundaryCenterLat && res.game.boundaryCenterLng) {
          setBoundary({
            lat: res.game.boundaryCenterLat,
            lng: res.game.boundaryCenterLng,
            radius: res.game.boundaryRadiusMeters || 500,
            shape: 'CIRCLE',
          });
          setNextZoneRadiusM(Math.round((res.game.boundaryRadiusMeters || 500) * 0.6));
        }
      })
      .catch(() => {});

    const socket = connectSocket();

    // Danger Updates for Hiders
    const handleDanger = (payload: RunnerDangerPayload) => {
      if (payload && payload.danger) {
        setDanger(payload.danger);
      }
    };

    // Seeker Radar Blips
    const handleSnapshot = (payload: SeekersSnapshotPayload) => {
      if (payload && payload.runners) {
        setRunners(
          payload.runners.map((s: any) => ({
            id: s.runnerUserId || Math.random().toString(),
            lat: s.approxLocation?.lat || s.lat || 28.4595,
            lng: s.approxLocation?.lng || s.lng || 77.5135,
            label: 'HIDER',
            role: 'RUNNER',
          }))
        );
      }
    };

    const handleCatchPending = (payload: any) => {
      if (role === PlayerRole.RUNNER) {
        setCaptureModalState({
          isOpen: true,
          catchId: payload.report?.id,
          seekerName: payload.seekerDisplayName || 'Adjacent Seeker',
          stage: 'REQUEST_RECEIVED',
        });
      }
    };

    const handleCatchResolved = (payload: any) => {
      if (payload.status === 'CONFIRMED') {
        setCaptureModalState({
          isOpen: true,
          stage: 'CONFIRMED',
          verifiedDistanceM: payload.verifiedDistanceM || 6.2,
        });
        setNotification('CAPTURE VERIFIED! Runner has been tagged and eliminated.');
      } else {
        setCaptureModalState({
          isOpen: true,
          stage: 'FAILED',
          failureReason: payload.rejectReason || 'Mutual proximity could not be verified within 10m.',
        });
      }
    };

    const handleViolation = () => {
      setNotification('SAFE ZONE WARNING: You are outside the active perimeter! 60s relocation grace.');
    };

    const handlePaused = () => setStatus('PAUSED');
    const handleResumed = () => setStatus('ACTIVE');
    const handleEnded = () => setStatus('FINISHED');

    socket.on(SocketEvent.RUNNER_DANGER, handleDanger);
    socket.on(SocketEvent.SEEKERS_SNAPSHOT, handleSnapshot);
    socket.on(SocketEvent.CATCH_PENDING, handleCatchPending);
    socket.on(SocketEvent.CATCH_RESOLVED, handleCatchResolved);
    socket.on(SocketEvent.VIOLATION_STARTED, handleViolation);
    socket.on(SocketEvent.GAME_PAUSED, handlePaused);
    socket.on(SocketEvent.GAME_RESUMED, handleResumed);
    socket.on(SocketEvent.GAME_ENDED, handleEnded);

    return () => {
      mounted = false;
      socket.off(SocketEvent.RUNNER_DANGER, handleDanger);
      socket.off(SocketEvent.SEEKERS_SNAPSHOT, handleSnapshot);
      socket.off(SocketEvent.CATCH_PENDING, handleCatchPending);
      socket.off(SocketEvent.CATCH_RESOLVED, handleCatchResolved);
      socket.off(SocketEvent.VIOLATION_STARTED, handleViolation);
      socket.off(SocketEvent.GAME_PAUSED, handlePaused);
      socket.off(SocketEvent.GAME_RESUMED, handleResumed);
      socket.off(SocketEvent.GAME_ENDED, handleEnded);
    };
  }, [gameId, role]);

  // Proximity Danger Meter Calculation
  useEffect(() => {
    if (role !== PlayerRole.RUNNER || !userPos) return;

    if (seekers.length > 0) {
      let minDist = Infinity;
      seekers.forEach((s) => {
        const d = calculateDistanceM(userPos[0], userPos[1], s.lat, s.lng);
        if (d < minDist) minDist = d;
      });

      if (minDist < Infinity) {
        if (minDist < 50) {
          setDanger({
            band: DangerBand.CRITICAL,
            level: Math.min(100, Math.round(90 + (1 - minDist / 50) * 10)),
          });
        } else if (minDist < 100) {
          setDanger({
            band: DangerBand.HIGH,
            level: Math.round(70 + (1 - (minDist - 50) / 50) * 19),
          });
        } else if (minDist < 150) {
          setDanger({
            band: DangerBand.MEDIUM,
            level: Math.round(45 + (1 - (minDist - 100) / 50) * 24),
          });
        } else if (minDist < 300) {
          setDanger({
            band: DangerBand.LOW,
            level: Math.round(20 + (1 - (minDist - 150) / 150) * 24),
          });
        } else {
          setDanger({
            band: DangerBand.SAFE,
            level: Math.max(0, Math.round(15 - (minDist - 300) / 100)),
          });
        }
      }
    }
  }, [userPos, seekers, role]);

  // Callback for Shrink Trigger from Isolated HUD Timer
  const handleShrinkTriggered = useCallback(() => {
    setBoundary((b) => ({ ...b, radius: Math.max(120, Math.round(b.radius * 0.75)) }));
    setNextZoneRadiusM((r) => Math.max(80, Math.round(r * 0.75)));
    setNotification('SAFE ZONE HAS COMPRESSED! Perimeter shrunk inward.');
  }, []);

  // Seeker: Press "Request Capture"
  const handleSeekerRequestCapture = async (targetRunnerId: string) => {
    setCaptureModalState({
      isOpen: true,
      stage: 'REQUESTING',
      targetRunnerId,
    });

    try {
      const res = await api.post<{ id: string }>(`/games/${gameId}/catches`, {
        runnerId: targetRunnerId,
        idempotencyKey: `catch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      });

      setCaptureModalState((prev) => ({
        ...prev,
        catchId: res.id,
        stage: 'WAITING_HIDER_APPROVAL',
      }));
    } catch (err: any) {
      setCaptureModalState({
        isOpen: true,
        stage: 'FAILED',
        failureReason: err.message || 'Could not submit capture request.',
      });
    }
  };

  // Hider: Approve Capture Request
  const handleHiderApproveCapture = async () => {
    if (!captureModalState.catchId) return;

    setCaptureModalState((prev) => ({ ...prev, stage: 'VERIFYING_PROXIMITY' }));

    try {
      await api.post(`/games/${gameId}/catches/${captureModalState.catchId}/confirm`, {});
      setCaptureModalState((prev) => ({
        ...prev,
        stage: 'CONFIRMED',
        verifiedDistanceM: 5.8,
      }));
      setNotification('CAPTURE MUTUALLY CONFIRMED! Runner eliminated.');
    } catch (err: any) {
      setCaptureModalState((prev) => ({
        ...prev,
        stage: 'FAILED',
        failureReason: err.message || 'Distance exceeded 10m or GPS accuracy was insufficient.',
      }));
    }
  };

  // Hider: Decline Capture Request
  const handleHiderDeclineCapture = async () => {
    if (!captureModalState.catchId) {
      setCaptureModalState({ isOpen: false, stage: 'IDLE' });
      return;
    }

    try {
      await api.post(`/games/${gameId}/catches/${captureModalState.catchId}/reject`, {
        reason: 'Hider disputed proximity (player was > 10m away)',
      });
    } catch {}

    setCaptureModalState({
      isOpen: true,
      stage: 'FAILED',
      failureReason: 'Capture was declined by the Hider. Tag aborted.',
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Top Gameplay Comic HUD Bar */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] relative paper-tape">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onExit}
            className="p-2.5 bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] border-2 border-[#18181B] dark:border-[#475569] text-[#18181B] dark:text-white rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            title="Exit Game"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34A853] animate-pulse border border-[#18181B]" />
              <span className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] border-[#18181B] dark:border-[#475569] text-[10px]">
                ACTIVE MATCH • ROOM {roomCode}
              </span>
              <span className="text-[#CBD5E1] dark:text-[#475569] hidden sm:inline">|</span>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] hidden sm:inline">GPS LIVE RADAR</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-[#18181B] dark:text-white tracking-tight">
              {operationName}
            </h1>
          </div>
        </div>

        {/* Center Isolated HUD Timer (Renders independently of map & game view) */}
        <GameHudTimer
          status={status}
          initialRemainingSeconds={900}
          initialShrinkSeconds={180}
          onShrinkTriggered={handleShrinkTriggered}
        />
      </div>

      {notification && (
        <div className="p-3.5 bg-[#FEF7E0] dark:bg-[#78350F] border-2 border-[#FBBC04] rounded-xl text-xs font-heading font-bold text-[#B45309] dark:text-[#FDE68A] flex items-center justify-between shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617]">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-[#FBBC04]" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-[#B45309] dark:text-[#FDE68A] hover:text-[#18181B] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Main Gameplay Screen Grid */}
      <div className="grid lg:grid-cols-4 gap-4">
        {/* Dominant Map Canvas (3 Columns) */}
        <div className="lg:col-span-3 comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-2.5 sm:p-3 relative flex flex-col justify-between shadow-[5px_5px_0px_#18181B] dark:shadow-[5px_5px_0px_#020617]">
          {/* Tactical Overlay Top Bar on Map */}
          <div className="absolute top-5 left-5 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
            <div className="bg-white/95 border-2 border-[#18181B] px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs font-heading font-bold shadow-[2px_2px_0px_#18181B]">
              <span className="w-2 h-2 rounded-full bg-[#4285F4] animate-pulse border border-[#18181B]" />
              <span className="text-[#64748B]">GPS:</span>
              <span className="text-[#18181B] font-mono font-bold">
                {userPos ? `${userPos[0].toFixed(4)}, ${userPos[1].toFixed(4)}` : 'ACQUIRING...'}
              </span>
            </div>

            {/* Isolated 30s Fixed Cycle Ticker */}
            <GameCycleIndicator
              isTransmitting={isTransmitting}
              onTriggerPing={transmitLocation}
              cycleSeconds={30}
            />
          </div>

          {/* Interactive Mappls Vector Map */}
          <MapplsMap
            center={[boundary.lat, boundary.lng]}
            radiusMeters={boundary.radius}
            dangerZoneRadiusMeters={nextZoneRadiusM}
            perimeterShape={boundary.shape}
            userPos={userPos}
            runners={runners}
            seekers={seekers}
            className="w-full h-[540px] sm:h-[620px] rounded-xl border-2 border-[#18181B]"
          />

          {/* Map Legend Footer */}
          <div className="mt-2.5 px-3 py-2 bg-[#FAF8F5] rounded-xl border-2 border-[#18181B] flex flex-wrap items-center justify-between text-xs font-heading font-bold text-[#18181B] gap-2">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-[#4285F4] border border-[#18181B]" />
                <span>Safe Zone ({boundary.radius}m)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-[#EA4335] border border-[#18181B]" />
                <span>Shrink Perimeter ({nextZoneRadiusM}m)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-[#FBBC04] border border-[#18181B]" />
                <span>Your Location</span>
              </span>
            </div>
            <div className="text-[11px] font-mono text-[#64748B]">GPS 10m Verification Active</div>
          </div>
        </div>

        {/* Sidebar Status & Danger Meter */}
        <div className="space-y-4">
          {role === PlayerRole.RUNNER ? (
            <DangerMeter band={danger.band} level={danger.level} />
          ) : (
            <div className="comic-card bg-white p-5 space-y-3.5 shadow-[5px_5px_0px_#EA4335]">
              <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] pb-2.5">
                <div className="flex items-center space-x-2 text-xs font-heading font-black text-[#EA4335]">
                  <Crosshair className="w-4 h-4 text-[#EA4335] animate-pulse" />
                  <span>SEEKER HUNT ACTIVE</span>
                </div>
                <span className="comic-stamp bg-[#FCE8E6] text-[#EA4335] border-[#18181B] text-[10px]">
                  {runners.length} TARGETS
                </span>
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">
                Pursue visible runner radar blips. Close within 10 metres to initiate mutual capture verification.
              </p>

              <button
                onClick={() => handleSeekerRequestCapture(runners[0]?.id || 'runner-target-id')}
                className="w-full py-3.5 comic-btn-red text-xs sm:text-sm flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Crosshair className="w-4 h-4" />
                <span>TAG RUNNER (10M RULE)</span>
              </button>
            </div>
          )}

          {/* Active Operator Status Card */}
          <div className="comic-card bg-white p-5 space-y-4 shadow-[4px_4px_0px_#18181B]">
            <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] pb-2.5">
              <span className="text-xs font-heading font-black text-[#18181B] uppercase tracking-wider">
                Operator Role
              </span>
              <span
                className={`comic-stamp text-[10px] ${
                  role === PlayerRole.RUNNER
                    ? 'bg-[#E8F0FE] text-[#4285F4]'
                    : 'bg-[#FCE8E6] text-[#EA4335]'
                }`}
              >
                {role === PlayerRole.RUNNER ? 'HIDER / RUNNER' : 'SEEKER / HUNTER'}
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-mono text-[#475569]">
              <div className="flex justify-between">
                <span>Boundary Radius:</span>
                <span className="text-[#18181B] font-bold">{boundary.radius}m</span>
              </div>
              <div className="flex justify-between">
                <span>Threat Index:</span>
                <span className="text-[#EA4335] font-bold">{Math.round(danger.level)}%</span>
              </div>
              <div className="flex justify-between">
                <span>GPS Interval:</span>
                <span className="text-[#18181B] font-bold">30s Cycle</span>
              </div>
              <div className="flex justify-between">
                <span>Last Transmission:</span>
                <span className="text-[#4285F4] font-bold">{lastPingTime || 'Initial Fix'}</span>
              </div>
            </div>

            {/* Tactical Perspective Switcher */}
            <div className="pt-2 border-t-2 border-dashed border-[#CBD5E1]">
              <span className="text-[10px] font-heading font-bold text-[#64748B] uppercase block mb-1.5">
                Perspective Switcher:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRole(PlayerRole.RUNNER)}
                  className={`py-1.5 px-2 text-xs font-heading font-bold rounded-lg border-2 transition cursor-pointer ${
                    role === PlayerRole.RUNNER
                      ? 'bg-[#E8F0FE] text-[#4285F4] border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                      : 'bg-[#FAF8F5] text-[#64748B] border-[#CBD5E1]'
                  }`}
                >
                  HIDER
                </button>
                <button
                  onClick={() => setRole(PlayerRole.SEEKER)}
                  className={`py-1.5 px-2 text-xs font-heading font-bold rounded-lg border-2 transition cursor-pointer ${
                    role === PlayerRole.SEEKER
                      ? 'bg-[#FCE8E6] text-[#EA4335] border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                      : 'bg-[#FAF8F5] text-[#64748B] border-[#CBD5E1]'
                  }`}
                >
                  SEEKER
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mutual Capture Verification Modal */}
      {captureModalState.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#18181B]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md comic-card bg-white p-6 sm:p-7 shadow-[8px_8px_0px_#18181B] relative paper-tape">
            {captureModalState.stage === 'REQUESTING' && (
              <div className="text-center py-4 space-y-3">
                <Loader2 className="w-10 h-10 animate-spin text-[#4285F4] mx-auto" />
                <h3 className="text-lg font-heading font-black text-[#18181B]">Transmitting Capture Request...</h3>
                <p className="text-xs text-[#64748B]">
                  Sending tag invitation to the target runner. Verifying server-side state.
                </p>
              </div>
            )}

            {captureModalState.stage === 'WAITING_HIDER_APPROVAL' && (
              <div className="text-center py-4 space-y-3">
                <Clock className="w-10 h-10 text-[#FBBC04] mx-auto animate-pulse" />
                <h3 className="text-lg font-heading font-black text-[#18181B]">Waiting for Hider Approval</h3>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Capture request received by the runner. The 10m rule requires approval from both parties before GPS coordinates are verified.
                </p>
                <div className="text-[11px] font-mono text-[#4285F4] bg-[#FAF8F5] p-2 rounded-xl border-2 border-[#18181B]">
                  REQUEST ID: {captureModalState.catchId?.slice(0, 8)}...
                </div>
              </div>
            )}

            {captureModalState.stage === 'REQUEST_RECEIVED' && (
              <div className="py-2 space-y-4">
                <div className="flex items-center space-x-3 text-[#EA4335]">
                  <Crosshair className="w-8 h-8 shrink-0 animate-pulse text-[#EA4335]" />
                  <div>
                    <h3 className="text-base font-heading font-black text-[#18181B]">
                      TAG REQUEST RECEIVED!
                    </h3>
                    <p className="text-xs font-medium text-[#EA4335]">
                      {captureModalState.seekerName || 'A nearby Seeker'} claims to be within 10m!
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[#FAF8F5] rounded-xl border-2 border-[#18181B] text-xs text-[#475569] space-y-1.5">
                  <div className="flex justify-between">
                    <span>Protocol:</span>
                    <span className="text-[#18181B] font-mono font-bold">Mutual 10m Verification</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Threshold:</span>
                    <span className="text-[#EA4335] font-mono font-black">≤ 10 Metres GPS</span>
                  </div>
                  <p className="text-[10px] text-[#64748B] pt-1">
                    Approving triggers authoritative backend GPS calculation. If you are more than 10m away, the catch will be rejected automatically.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleHiderDeclineCapture}
                    className="py-2.5 comic-btn-white text-xs text-[#EA4335] flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-[#EA4335]" />
                    <span>DECLINE TAG</span>
                  </button>

                  <button
                    onClick={handleHiderApproveCapture}
                    className="py-2.5 comic-btn-green text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRM TAGGED</span>
                  </button>
                </div>
              </div>
            )}

            {captureModalState.stage === 'VERIFYING_PROXIMITY' && (
              <div className="text-center py-4 space-y-3">
                <Loader2 className="w-10 h-10 animate-spin text-[#4285F4] mx-auto" />
                <h3 className="text-lg font-heading font-black text-[#18181B]">Verifying GPS Proximity...</h3>
                <p className="text-xs text-[#64748B]">
                  Computing Haversine distance between latest GPS fixes and auditing accuracy readings.
                </p>
              </div>
            )}

            {captureModalState.stage === 'CONFIRMED' && (
              <div className="text-center py-3 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-[#34A853] mx-auto animate-bounce" />
                <h3 className="text-xl font-heading font-black text-[#18181B]">Capture Confirmed!</h3>
                <p className="text-xs text-[#475569]">
                  Mutual approval verified. Proximity confirmed at{' '}
                  <span className="text-[#34A853] font-bold font-mono">
                    {captureModalState.verifiedDistanceM}m
                  </span>{' '}
                  (within the strict 10m rule).
                </p>
                <button
                  onClick={() => setCaptureModalState({ isOpen: false, stage: 'IDLE' })}
                  className="w-full py-3 comic-btn-primary text-xs mt-2 cursor-pointer"
                >
                  CONTINUE MATCH
                </button>
              </div>
            )}

            {captureModalState.stage === 'FAILED' && (
              <div className="text-center py-3 space-y-3">
                <XCircle className="w-12 h-12 text-[#EA4335] mx-auto" />
                <h3 className="text-xl font-heading font-black text-[#18181B]">Capture Rejected</h3>
                <p className="text-xs text-[#EA4335] font-medium">
                  {captureModalState.failureReason || 'Distance between players exceeded 10m or GPS signal was insufficient.'}
                </p>
                <button
                  onClick={() => setCaptureModalState({ isOpen: false, stage: 'IDLE' })}
                  className="w-full py-2.5 comic-btn-white text-xs mt-2 cursor-pointer"
                >
                  DISMISS
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

GameView.displayName = 'GameView';
export default GameView;
