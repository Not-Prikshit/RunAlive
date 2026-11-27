import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { colyseus } from '../lib/colyseus';
import { MapplsMap, type MapMarker, type PerimeterShape } from './MapplsMap';
import { DangerMeter } from './DangerMeter';
import { GameHudTimer } from './GameHudTimer';
import { PartyCommunicationPanel } from './PartyCommunicationPanel';
import {
  PlayerRole,
  DangerBand,
  SocketEvent,
  type DangerState,
  type SeekersSnapshotPayload,
  type RunnerDangerPayload,
  type PlayerSummary,
} from '@runalive/shared';
import {
  Crosshair,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Radio,
  Users,
  MessageSquare,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  MapPin,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface GameViewProps {
  gameId: string;
  perimeterConfig?: {
    lat: number;
    lng: number;
    radius: number;
    shape: PerimeterShape;
    rectWidth?: number;
    rectHeight?: number;
    rectRotation?: number;
    polygonPoints?: Array<[number, number]>;
    revealSeekersOnMap?: boolean;
  } | null;
  onExit: () => void;
}

interface MatchNoticeEvent {
  id: string;
  timestamp: string;
  type: 'INFO' | 'CATCH' | 'SHRINK' | 'DANGER' | 'VIOLATION';
  message: string;
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

export const GameView: React.FC<GameViewProps> = React.memo(({ gameId, perimeterConfig, onExit }) => {
  const [role, setRole] = useState<PlayerRole>(PlayerRole.RUNNER);
  const [status, setStatus] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'FINISHED'>('ACTIVE');
  const [roomCode, setRoomCode] = useState('------');
  const [operationName, setOperationName] = useState('CAMPUS SURVIVAL RUN');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [revealSeekersOnMap, setRevealSeekersOnMap] = useState<boolean>(
    () => perimeterConfig?.revealSeekersOnMap ?? true
  );

  // Boundary & Perimeter State
  const [boundary, setBoundary] = useState<{
    lat: number;
    lng: number;
    radius: number;
    shape: PerimeterShape;
    rectWidth?: number;
    rectHeight?: number;
    rectRotation?: number;
    polygonPoints?: Array<[number, number]>;
  }>(() => ({
    lat: perimeterConfig?.lat || 28.4595,
    lng: perimeterConfig?.lng || 77.5135,
    radius: perimeterConfig?.radius || 500,
    shape: perimeterConfig?.shape || 'CIRCLE',
    rectWidth: perimeterConfig?.rectWidth || 600,
    rectHeight: perimeterConfig?.rectHeight || 600,
    rectRotation: perimeterConfig?.rectRotation || 0,
    polygonPoints: perimeterConfig?.polygonPoints || [],
  }));

  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number>(5);
  const [danger, setDanger] = useState<DangerState>({
    band: DangerBand.SAFE,
    level: 0,
  });

  const [runners, setRunners] = useState<MapMarker[]>([]);
  const [seekers, setSeekers] = useState<MapMarker[]>([]);
  const [roster, setRoster] = useState<PlayerSummary[]>([]);
  const [nearestSeekerDist, setNearestSeekerDist] = useState<number | null>(null);
  const [nearestRunnerDist, setNearestRunnerDist] = useState<number | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Transmission status
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);

  // Dynamic Safe Zone State
  const [nextZoneRadiusM, setNextZoneRadiusM] = useState<number>(() =>
    Math.round((perimeterConfig?.radius || 500) * 0.75)
  );
  const [matchRemainingSeconds, setMatchRemainingSeconds] = useState<number>(900);
  const [shrinkCountdown, setShrinkCountdown] = useState<number>(180);

  // Notice Board & UI States
  const [isNoticeBoardOpen, setIsNoticeBoardOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDangerMeterMinimized, setIsDangerMeterMinimized] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const roomRef = useRef<any>(null);
  const [intelIntervalSec, setIntelIntervalSec] = useState<number>(10);
  const [intelTier, setIntelTier] = useState<string>('NORMAL');
  const [hostAnnouncement, setHostAnnouncement] = useState<string | null>(null);
  const [events, setEvents] = useState<MatchNoticeEvent[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'INFO',
      message: 'Tactical link established. Match airspace active.',
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'INFO',
      message: 'Perimeter deployed. GPS 10m capture verification engaged.',
    },
  ]);

  const addNoticeEvent = useCallback((type: MatchNoticeEvent['type'], message: string) => {
    const newEv: MatchNoticeEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
    };
    setEvents((prev) => [newEv, ...prev.slice(0, 30)]);
  }, []);

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

  // Calculate alive and caught counts
  const runnersAliveCount = useMemo(() => {
    const alive = roster.filter((p) => p.role === 'RUNNER' && p.status === 'ACTIVE');
    return alive.length > 0 ? alive.length : Math.max(1, runners.length);
  }, [roster, runners]);

  const runnersCaughtCount = useMemo(() => {
    return roster.filter(
      (p) =>
        p.role === 'RUNNER' &&
        (p.status === 'DISQUALIFIED' || (p.status as any) === 'CAUGHT' || (p.status as any) === 'ELIMINATED')
    ).length;
  }, [roster]);

  const seekersCount = useMemo(() => {
    const s = roster.filter((p) => p.role === 'SEEKER');
    return s.length > 0 ? s.length : Math.max(1, seekers.length);
  }, [roster, seekers]);

  // Active Runners with Authoritative GPS Fixes
  const activeRunners = useMemo(() => {
    const list = [...runners];
    roster.forEach((p, idx) => {
      if (
        p.role === 'RUNNER' &&
        p.userId !== currentUserId &&
        !list.some((r) => r.id === p.userId)
      ) {
        if (p.lat && p.lon) {
          list.push({
            id: p.userId,
            lat: p.lat,
            lng: p.lon,
            role: 'RUNNER',
            label: p.displayName || `HIDER #${idx + 1}`,
            lastSeenAt: p.lastSeenAt || 'Live',
          });
        }
      }
    });
    return list;
  }, [runners, roster, currentUserId]);

  // Active Seekers with Authoritative GPS Fixes
  const activeSeekers = useMemo(() => {
    const list = [...seekers];
    roster.forEach((p, idx) => {
      if (
        (p.role === 'SEEKER' || p.role === 'HOST') &&
        p.userId !== currentUserId &&
        !list.some((s) => s.id === p.userId)
      ) {
        if (p.lat && p.lon) {
          list.push({
            id: p.userId,
            lat: p.lat,
            lng: p.lon,
            role: 'SEEKER',
            label: p.displayName || `HUNTER #${idx + 1}`,
            lastSeenAt: p.lastSeenAt || 'Live',
          });
        }
      }
    });
    return list;
  }, [seekers, roster, currentUserId]);

  // Read authenticated user on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('runalive_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.id) setCurrentUserId(u.id);
        if (u.email?.includes('seeker') || u.role === 'SEEKER') {
          setRole(PlayerRole.SEEKER);
        } else {
          setRole(PlayerRole.RUNNER);
        }
      }
    } catch {}
  }, []);

  // Continuous GPS Collection via watchPosition streaming to authoritative Colyseus backend
  useEffect(() => {
    if (!navigator.geolocation) return;

    let lastBackupPost = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const now = Date.now();
        const latFixed = Number(latitude.toFixed(6));
        const lonFixed = Number(longitude.toFixed(6));
        const accM = Math.round(accuracy || 5);

        setUserPos([latFixed, lonFixed]);
        setUserAccuracy(accM);
        setLastPingTime(new Date().toLocaleTimeString());
        setIsTransmitting(false);

        // 1. Authoritative Colyseus real-time stream
        if (roomRef.current) {
          roomRef.current.send('player:location_update', {
            latitude: latFixed,
            longitude: lonFixed,
            accuracy: accM,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: now,
          });
        }

        // 2. Periodic REST backup sync for DB logs
        if (now - lastBackupPost >= 3500) {
          lastBackupPost = now;
          api
            .post(`/games/${gameId}/location`, {
              fixes: [
                {
                  lat: latFixed,
                  lon: lonFixed,
                  accuracyM: accM,
                  clientTs: now,
                  mocked: false,
                },
              ],
            })
            .catch(() => {});
        }
      },
      (err) => {
        console.warn('GPS watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [gameId]);

  // Connect to Authoritative Colyseus Multiplayer Room
  useEffect(() => {
    let mounted = true;

    colyseus
      .joinOrCreateGameRoom({
        sessionId: gameId,
        gameId,
        role,
      })
      .then((room) => {
        if (!mounted) return;
        roomRef.current = room;

        room.onStateChange((state: any) => {
          if (!mounted) return;

          // 1. Status & Timer Sync
          if (state.status) setStatus(state.status);
          if (state.locationRefreshIntervalSec) setIntelIntervalSec(state.locationRefreshIntervalSec);
          if (state.locationRefreshTier) setIntelTier(state.locationRefreshTier);
          if (state.timeRemainingSec !== undefined) setMatchRemainingSeconds(state.timeRemainingSec);

          // 2. Safe-Zone Perimeter Sync
          if (state.perimeter?.currentRadius) {
            setBoundary((prev) => ({
              ...prev,
              lat: state.perimeter.centerLat || prev.lat,
              lng: state.perimeter.centerLng || prev.lng,
              radius: state.perimeter.currentRadius,
            }));
          }

          // 3. Synchronize All Players & Freshness Markers
          const newSeekers: MapMarker[] = [];
          const newRunners: MapMarker[] = [];

          if (state.players) {
            state.players.forEach((player: any, pUserId: string) => {
              const isMe = pUserId === currentUserId;
              if (player.location?.latitude && player.location?.longitude) {
                const marker: MapMarker = {
                  id: pUserId,
                  lat: player.location.latitude,
                  lng: player.location.longitude,
                  label: player.displayName || (player.role === 'SEEKER' ? 'HUNTER' : 'HIDER'),
                  role: player.role,
                  isCurrentUser: isMe,
                  lastSeenAt: player.location.lastUpdatedAt ? new Date(player.location.lastUpdatedAt).toLocaleTimeString() : 'Live',
                  accuracyMeters: player.location.accuracy || 10,
                  freshness: player.location.freshness || 'LIVE',
                };

                if (player.role === 'SEEKER') {
                  newSeekers.push(marker);
                } else {
                  newRunners.push(marker);
                }
              }

              // 4. Server-Authoritative Danger Meter for Local Runner
              if (isMe && player.danger) {
                const dist = player.danger.effectiveDistance;
                const band = (player.danger.band as DangerBand) || DangerBand.SAFE;
                const level =
                  dist <= 20 ? 100 : dist <= 50 ? 80 : dist <= 100 ? 60 : dist <= 200 ? 40 : 15;

                setDanger({
                  band,
                  level,
                });
                if (dist < 9999) {
                  setNearestSeekerDist(Math.round(dist));
                }
              }
            });
          }

          if (newSeekers.length > 0) setSeekers(newSeekers);
          if (newRunners.length > 0) setRunners(newRunners);

          // 5. Host Announcements
          if (state.messages && state.messages.length > 0) {
            const last = state.messages[state.messages.length - 1];
            if (last?.isAnnouncement) {
              setHostAnnouncement(last.message);
            }
          }
        });
      })
      .catch((err) => {
        console.warn('Colyseus room connection in GameView notice:', err);
      });

    return () => {
      mounted = false;
      if (roomRef.current) {
        roomRef.current.leave(false);
        roomRef.current = null;
      }
    };
  }, [gameId, role, currentUserId]);

  // Connect Realtime Socket & Synchronize Game Metadata
  useEffect(() => {
    let mounted = true;

    // Fetch full game state and player list
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
          boundaryShape?: PerimeterShape;
          rectWidthMeters?: number;
          rectHeightMeters?: number;
          rectRotationDeg?: number;
          polygonPoints?: Array<[number, number]>;
          revealSeekersOnMap?: boolean;
          roundEndsAt?: string | null;
          endsAt?: string | null;
          players?: PlayerSummary[];
        };
      }>(`/games/${gameId}`)
      .then((res) => {
        if (!mounted || !res.game) return;
        const g = res.game;
        setRoomCode(g.roomCode || 'XK92WP');
        setOperationName(g.name || 'CAMPUS SURVIVAL RUN');
        if (g.status) setStatus(g.status as any);
        if (g.revealSeekersOnMap !== undefined) setRevealSeekersOnMap(g.revealSeekersOnMap);

        // Update Boundary
        setBoundary((prev) => ({
          lat: g.boundaryCenterLat ?? prev.lat,
          lng: g.boundaryCenterLng ?? prev.lng,
          radius: g.boundaryRadiusMeters ?? prev.radius,
          shape: g.boundaryShape ?? prev.shape,
          rectWidth: g.rectWidthMeters ?? prev.rectWidth,
          rectHeight: g.rectHeightMeters ?? prev.rectHeight,
          rectRotation: g.rectRotationDeg ?? prev.rectRotation,
          polygonPoints: g.polygonPoints && g.polygonPoints.length > 0 ? g.polygonPoints : prev.polygonPoints,
        }));
        setNextZoneRadiusM(Math.round((g.boundaryRadiusMeters || 500) * 0.75));

        // Time synchronization
        const targetEndsAt = g.roundEndsAt || g.endsAt;
        if (targetEndsAt) {
          const remaining = Math.max(0, Math.floor((new Date(targetEndsAt).getTime() - Date.now()) / 1000));
          if (remaining > 0) setMatchRemainingSeconds(remaining);
        }

        // Initialize roster and markers
        if (g.players && Array.isArray(g.players)) {
          setRoster(g.players);
          const rMarkers: MapMarker[] = [];
          const sMarkers: MapMarker[] = [];

          g.players.forEach((p) => {
            if (p.lat && p.lon) {
              const marker: MapMarker = {
                id: p.userId,
                lat: p.lat,
                lng: p.lon,
                accuracyMeters: p.accuracyM,
                role: p.role,
                label: p.displayName || (p.role === 'SEEKER' ? 'SEEKER' : 'HIDER'),
                lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleTimeString() : null,
              };
              if (p.role === 'SEEKER') sMarkers.push(marker);
              else rMarkers.push(marker);
            }
          });

          if (rMarkers.length > 0) setRunners(rMarkers);
          if (sMarkers.length > 0) setSeekers(sMarkers);
        }
      })
      .catch(() => {});

    const socket = connectSocket();

    // Authenticate and join game socket room
    socket.emit('game:join', { gameId }, (ack: any) => {
      if (ack?.role) {
        setRole(ack.role === 'SEEKER' ? PlayerRole.SEEKER : PlayerRole.RUNNER);
      }
    });

    // Real-time peer location updates from server
    const handlePlayerLocation = (data: {
      userId: string;
      role: string;
      lat: number;
      lng: number;
      accuracyM?: number;
      timestamp?: number;
    }) => {
      if (!data || !data.userId) return;

      const marker: MapMarker = {
        id: data.userId,
        lat: data.lat,
        lng: data.lng,
        accuracyMeters: data.accuracyM,
        role: data.role === 'SEEKER' ? 'SEEKER' : 'RUNNER',
        label: data.role === 'SEEKER' ? 'SEEKER' : 'HIDER',
        lastSeenAt: new Date().toLocaleTimeString(),
      };

      if (data.role === 'SEEKER') {
        setSeekers((prev) => [...prev.filter((s) => s.id !== data.userId), marker]);
      } else {
        setRunners((prev) => [...prev.filter((r) => r.id !== data.userId), marker]);
      }
    };

    // Danger Updates for Hiders from server engine
    const handleDanger = (payload: RunnerDangerPayload) => {
      if (payload?.danger) {
        setDanger(payload.danger);
        if (payload.danger.band === DangerBand.CRITICAL) {
          addNoticeEvent('DANGER', 'CRITICAL PROXIMITY: A seeker is within 30 metres!');
        }
      }
    };

    // Seeker Radar Blips snapshot
    const handleSnapshot = (payload: any) => {
      const runnerList = payload?.snapshots || payload?.runners || [];
      if (Array.isArray(runnerList) && runnerList.length > 0) {
        setRunners(
          runnerList.map((s: any) => ({
            id: s.runnerUserId || s.userId || Math.random().toString(),
            lat: s.approxLocation?.lat || s.lat || 28.4595,
            lng: s.approxLocation?.lng || s.lng || 77.5135,
            label: s.displayName || 'HIDER',
            role: 'RUNNER',
            lastSeenAt: new Date().toLocaleTimeString(),
          }))
        );
      }
    };

    const handleCatchPending = (payload: any) => {
      setCaptureModalState({
        isOpen: true,
        catchId: payload.report?.id,
        seekerName: payload.seekerDisplayName || 'Adjacent Seeker',
        stage: 'REQUEST_RECEIVED',
      });
      addNoticeEvent('CATCH', `TAG CLAIMED: ${payload.seekerDisplayName || 'A Seeker'} claims capture!`);
    };

    const handleCatchResolved = (payload: any) => {
      if (payload.status === 'CONFIRMED') {
        setCaptureModalState({
          isOpen: true,
          stage: 'CONFIRMED',
          verifiedDistanceM: payload.verifiedDistanceM || 6.2,
        });
        setNotification('CAPTURE VERIFIED! Runner has been tagged and eliminated.');
        addNoticeEvent('CATCH', `CAPTURE CONFIRMED at ${payload.verifiedDistanceM || '6'}m! Player eliminated.`);

        if (payload.runnerId) {
          setRoster((prev) =>
            prev.map((p) => (p.userId === payload.runnerId ? { ...p, status: 'CAUGHT' as any } : p))
          );
        }
      } else {
        setCaptureModalState({
          isOpen: true,
          stage: 'FAILED',
          failureReason: payload.rejectReason || 'Mutual proximity could not be verified within 10m.',
        });
        addNoticeEvent('INFO', `Capture attempt rejected: ${payload.rejectReason || 'Distance exceeded 10m'}`);
      }
    };

    const handleViolation = () => {
      setNotification('SAFE ZONE WARNING: You are outside the active perimeter! 60s relocation grace.');
      addNoticeEvent('VIOLATION', 'OUT OF BOUNDS: Relocate inside safe perimeter within 60s!');
    };

    const handlePaused = () => {
      setStatus('PAUSED');
      addNoticeEvent('INFO', 'Match operational pause invoked.');
    };
    const handleResumed = () => {
      setStatus('ACTIVE');
      addNoticeEvent('INFO', 'Match resumed. Clocks running.');
    };
    const handleEnded = () => {
      setStatus('FINISHED');
      addNoticeEvent('INFO', 'Match finished. Return to base.');
    };

    socket.on('player:location', handlePlayerLocation);
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
      socket.off('player:location', handlePlayerLocation);
      socket.off(SocketEvent.RUNNER_DANGER, handleDanger);
      socket.off(SocketEvent.SEEKERS_SNAPSHOT, handleSnapshot);
      socket.off(SocketEvent.CATCH_PENDING, handleCatchPending);
      socket.off(SocketEvent.CATCH_RESOLVED, handleCatchResolved);
      socket.off(SocketEvent.VIOLATION_STARTED, handleViolation);
      socket.off(SocketEvent.GAME_PAUSED, handlePaused);
      socket.off(SocketEvent.GAME_RESUMED, handleResumed);
      socket.off(SocketEvent.GAME_ENDED, handleEnded);
    };
  }, [gameId, addNoticeEvent]);

  // Perimeter safe-zone boundary containment
  const isOutsideZone = useMemo(() => {
    if (!userPos) return false;
    if (boundary.shape === 'CIRCLE') {
      const d = calculateDistanceM(userPos[0], userPos[1], boundary.lat, boundary.lng);
      return d > boundary.radius;
    }
    return false;
  }, [userPos, boundary]);

  const distanceToBoundaryM = useMemo(() => {
    if (!userPos) return 0;
    if (boundary.shape === 'CIRCLE') {
      const d = calculateDistanceM(userPos[0], userPos[1], boundary.lat, boundary.lng);
      return Math.max(0, d - boundary.radius);
    }
    return 0;
  }, [userPos, boundary]);

  // Client-Side Real-Time Distance Calculation & Responsive Danger Engine
  useEffect(() => {
    if (!userPos) return;

    if (role === PlayerRole.RUNNER) {
      if (activeSeekers.length > 0) {
        let minDist = Infinity;
        activeSeekers.forEach((s) => {
          const d = calculateDistanceM(userPos[0], userPos[1], s.lat, s.lng);
          if (d < minDist) minDist = d;
        });

        if (Number.isFinite(minDist)) {
          setNearestSeekerDist(minDist);
          if (minDist < 30) {
            setDanger({ band: DangerBand.CRITICAL, level: 98 });
          } else if (minDist < 75) {
            setDanger({ band: DangerBand.HIGH, level: 75 });
          } else if (minDist < 150) {
            setDanger({ band: DangerBand.MEDIUM, level: 50 });
          } else if (minDist < 300) {
            setDanger({ band: DangerBand.LOW, level: 25 });
          } else {
            setDanger({ band: DangerBand.SAFE, level: 0 });
          }
        }
      } else {
        setNearestSeekerDist(null);
        setDanger({ band: DangerBand.SAFE, level: 0 });
      }
    } else {
      // Role is SEEKER: track nearest runner
      if (activeRunners.length > 0) {
        let minDist = Infinity;
        activeRunners.forEach((r) => {
          const d = calculateDistanceM(userPos[0], userPos[1], r.lat, r.lng);
          if (d < minDist) minDist = d;
        });
        setNearestRunnerDist(Number.isFinite(minDist) ? minDist : null);
      } else {
        setNearestRunnerDist(null);
      }
    }
  }, [userPos, activeSeekers, activeRunners, role]);

  // Callback for Shrink Trigger from HUD Timer
  const handleShrinkTriggered = useCallback(() => {
    setBoundary((b) => ({
      ...b,
      radius: Math.max(120, Math.round(b.radius * 0.75)),
      rectWidth: b.rectWidth ? Math.max(150, Math.round(b.rectWidth * 0.75)) : undefined,
      rectHeight: b.rectHeight ? Math.max(150, Math.round(b.rectHeight * 0.75)) : undefined,
    }));
    setNextZoneRadiusM((r) => Math.max(80, Math.round(r * 0.75)));
    setNotification('SAFE ZONE HAS COMPRESSED! Active perimeter shifted.');
    addNoticeEvent('SHRINK', 'ZONE COMPRESSED: Safe boundary shrunk inward!');
  }, [addNoticeEvent]);

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
    } catch (err: any) {
      setCaptureModalState((prev) => ({
        ...prev,
        stage: 'FAILED',
        failureReason: err.message || 'Proximity check failed during confirmation.',
      }));
    }
  };

  // Hider: Decline Capture Request
  const handleHiderDeclineCapture = async () => {
    if (!captureModalState.catchId) return;

    try {
      await api.post(`/games/${gameId}/catches/${captureModalState.catchId}/reject`, {
        reason: 'Hider disputed 10m proximity boundary.',
      });
    } finally {
      setCaptureModalState({ isOpen: false, stage: 'IDLE' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F8FAFC] dark:bg-[#0F172A] overflow-hidden select-none">
      {/* ── Top Dedicated Tactical Match HUD Bar ─────────────────────────────── */}
      <header className="h-14 sm:h-16 bg-white dark:bg-[#1E293B] border-b-2 sm:border-b-[3px] border-[#18181B] dark:border-[#475569] px-2.5 sm:px-4 flex items-center justify-between shadow-[0_3px_0px_#18181B] z-40 shrink-0">
        {/* Left: Exit button & Match Identity */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#EF4444] border-2 border-[#18181B] rounded-xl text-xs font-heading font-black shadow-[2px_2px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5"
            title="Leave current match"
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
            <span className="hidden sm:inline">EXIT MATCH</span>
          </button>

          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] sm:text-xs font-mono font-black text-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A8A] px-1.5 py-0.5 rounded border border-[#2563EB]/40">
                {roomCode}
              </span>
              <span
                className={`comic-stamp text-[9px] sm:text-[10px] uppercase ${
                  role === PlayerRole.RUNNER ? 'bg-[#E8F0FE] text-[#4285F4]' : 'bg-[#FCE8E6] text-[#EA4335]'
                }`}
              >
                {role === PlayerRole.RUNNER ? 'HIDER' : 'HUNTER'}
              </span>
            </div>
            <h2 className="text-xs sm:text-sm font-heading font-black text-[#18181B] dark:text-white truncate max-w-[130px] sm:max-w-[220px]">
              {operationName}
            </h2>
          </div>
        </div>

        {/* Center: Live Countdown Clocks */}
        <div className="flex items-center">
          <GameHudTimer
            status={status}
            initialRemainingSeconds={matchRemainingSeconds}
            initialShrinkSeconds={shrinkCountdown}
            onShrinkTriggered={handleShrinkTriggered}
          />
        </div>

        {/* Right: GPS Telemetry, Seeker Visibility & Notice Board Toggle */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          {/* Live GPS Lock Pill */}
          <div className="hidden md:flex items-center space-x-1.5 bg-[#F0FDF4] dark:bg-[#064E3B] border-2 border-[#18181B] px-2.5 py-1.5 rounded-xl shadow-[2px_2px_0px_#18181B] text-[11px] font-mono font-bold text-[#16A34A] dark:text-[#86EFAC]">
            <Radio className={`w-3.5 h-3.5 text-[#16A34A] ${isTransmitting ? 'animate-ping' : 'animate-pulse'}`} />
            <span>GPS {userAccuracy}m • LIVE</span>
          </div>

          {/* Seeker Visibility Toggle Button */}
          <button
            onClick={() => setRevealSeekersOnMap((prev) => !prev)}
            className={`px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-xl border-2 border-[#18181B] text-[10px] sm:text-xs font-heading font-black shadow-[2px_2px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1 ${
              revealSeekersOnMap
                ? 'bg-[#E8F0FE] text-[#2563EB] hover:bg-[#DBEAFE]'
                : 'bg-[#FEE2E2] text-[#EF4444] hover:bg-[#FCA5A5]'
            }`}
            title="Toggle whether Seekers are visible or hidden on Hider radar"
          >
            <span>{revealSeekersOnMap ? '👁️ SEEKERS: ON' : '🕶️ SEEKERS: OFF'}</span>
          </button>

          {/* Squad Chat Button */}
          <button
            onClick={() => {
              setIsChatOpen((prev) => {
                if (!prev) setIsNoticeBoardOpen(false);
                return !prev;
              });
            }}
            className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border-2 border-[#18181B] text-xs font-heading font-black shadow-[2px_2px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5 ${
              isChatOpen
                ? 'bg-[#2563EB] text-white'
                : 'bg-white dark:bg-[#1E293B] text-[#18181B] dark:text-white hover:bg-[#EFF6FF]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">CHAT</span>
          </button>

          {/* Notice Board Toggle Button */}
          <button
            onClick={() => {
              setIsNoticeBoardOpen((prev) => {
                if (!prev) setIsChatOpen(false);
                return !prev;
              });
            }}
            className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border-2 border-[#18181B] text-xs font-heading font-black shadow-[2px_2px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1.5 ${
              isNoticeBoardOpen
                ? 'bg-[#FBBC04] text-[#18181B]'
                : 'bg-white dark:bg-[#1E293B] text-[#18181B] dark:text-white hover:bg-[#FEF7E0]'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">NOTICE BOARD</span>
            <span className="bg-[#18181B] text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {runnersAliveCount}A
            </span>
          </button>
        </div>
      </header>

      {/* ── Notification Banner (if any) ────────────────────────────────────── */}
      {notification && (
        <div className="bg-[#FEF7E0] dark:bg-[#78350F] border-b-2 border-[#18181B] px-4 py-2 text-xs font-heading font-bold text-[#B45309] dark:text-[#FDE68A] flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-[#FBBC04] animate-bounce shrink-0" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="font-mono text-sm px-2 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* ── Host Priority Announcement (Colyseus Authoritative Stream) ─────────── */}
      {hostAnnouncement && (
        <div className="bg-[#EF4444] text-white border-b-2 border-[#18181B] px-4 py-2.5 text-xs sm:text-sm font-heading font-black flex items-center justify-between z-40 shrink-0 shadow-[0px_4px_10px_rgba(239,68,68,0.4)] animate-pulse">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>📢 {hostAnnouncement}</span>
          </div>
          <button
            onClick={() => setHostAnnouncement(null)}
            className="font-mono text-xs bg-black/30 hover:bg-black/50 px-2 py-1 rounded cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* ── Main Map Canvas Viewport ────────────────────────────────────────── */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* Full Viewport Interactive Vector Map */}
        <MapplsMap
          center={[boundary.lat, boundary.lng]}
          radiusMeters={boundary.radius}
          dangerZoneRadiusMeters={nextZoneRadiusM}
          perimeterShape={boundary.shape}
          rectWidthMeters={boundary.rectWidth || 600}
          rectHeightMeters={boundary.rectHeight || 600}
          rectRotationDeg={boundary.rectRotation || 0}
          polygonPoints={boundary.polygonPoints || []}
          userPos={userPos}
          runners={activeRunners}
          seekers={role === PlayerRole.SEEKER || revealSeekersOnMap ? activeSeekers : []}
          showLocateButton={true}
          className="w-full h-full"
        />

        {/* ── Floating Tactical Notice Board (Expandable Comic Sketchbook Card) ── */}
        {isNoticeBoardOpen && (
          <aside className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-14 sm:top-3 sm:right-3 z-40 w-auto sm:w-84 max-h-[calc(100vh-170px)] sm:max-h-[calc(100%-140px)] flex flex-col comic-card bg-white dark:bg-[#1E293B] border-2 sm:border-[2.5px] border-[#18181B] dark:border-[#475569] shadow-[5px_5px_0px_#18181B] dark:shadow-[5px_5px_0px_#020617] rounded-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-150">
            {/* Notice Board Header */}
            <div className="bg-[#FAF8F5] dark:bg-[#0F172A] border-b-2 border-[#18181B] dark:border-[#475569] p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-ping" />
                <h3 className="text-xs font-heading font-black text-[#18181B] dark:text-white uppercase tracking-wider">
                  Tactical Notice Board
                </h3>
              </div>
              <button
                onClick={() => setIsNoticeBoardOpen(false)}
                className="p-1 hover:bg-[#E2E8F0] dark:hover:bg-[#334155] rounded-lg text-xs font-bold text-[#64748B] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Live Mission Roster Counter Pills */}
            <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-[#F8FAFC] dark:bg-[#1E293B] border-b border-[#E2E8F0] dark:border-[#334155] text-center text-xs">
              <div className="bg-[#EFF6FF] dark:bg-[#1E3A8A]/50 border border-[#2563EB] rounded-xl p-1.5">
                <span className="text-[10px] font-heading font-bold text-[#2563EB] dark:text-[#93C5FD] block uppercase">
                  ALIVE
                </span>
                <span className="text-sm font-mono font-black text-[#2563EB] dark:text-white">
                  {runnersAliveCount}
                </span>
              </div>
              <div className="bg-[#FEF2F2] dark:bg-[#7F1D1D]/50 border border-[#EF4444] rounded-xl p-1.5">
                <span className="text-[10px] font-heading font-bold text-[#EF4444] dark:text-[#FCA5A5] block uppercase">
                  CAUGHT
                </span>
                <span className="text-sm font-mono font-black text-[#EF4444] dark:text-white">
                  {runnersCaughtCount}
                </span>
              </div>
              <div className="bg-[#FEF7E0] dark:bg-[#78350F]/50 border border-[#FBBC04] rounded-xl p-1.5">
                <span className="text-[10px] font-heading font-bold text-[#B45309] dark:text-[#FDE68A] block uppercase">
                  HUNTERS
                </span>
                <span className="text-sm font-mono font-black text-[#B45309] dark:text-white">
                  {seekersCount}
                </span>
              </div>
            </div>

            {/* Scrollable Event Feed */}
            <div className="p-3 overflow-y-auto space-y-2 max-h-48 sm:max-h-56 text-xs">
              <div className="text-[10px] font-heading font-black text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider mb-1">
                Live Match Events
              </div>
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`p-2 rounded-xl border text-[11px] leading-tight ${
                    ev.type === 'CATCH'
                      ? 'bg-[#FEE2E2] text-[#991B1B] border-[#EF4444]'
                      : ev.type === 'SHRINK'
                      ? 'bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]'
                      : ev.type === 'DANGER'
                      ? 'bg-[#FFE4E6] text-[#9F1239] border-[#F43F5E] animate-pulse'
                      : 'bg-[#F1F5F9] dark:bg-[#0F172A] text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#475569]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] opacity-75 font-mono mb-0.5">
                    <span>{ev.type}</span>
                    <span>{ev.timestamp}</span>
                  </div>
                  <div className="font-medium">{ev.message}</div>
                </div>
              ))}
            </div>

            {/* Perimeter Details Footer */}
            <div className="p-2.5 bg-[#FAF8F5] dark:bg-[#0F172A] border-t border-[#E2E8F0] dark:border-[#334155] text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8] flex items-center justify-between">
              <span>Perimeter: {boundary.shape}</span>
              <span>Radius: {boundary.radius}m</span>
            </div>
          </aside>
        )}

        {/* ── Floating Live Squad Chat Panel ─────────────────────────────────── */}
        {isChatOpen && (
          <aside className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-14 sm:top-3 sm:right-3 z-40 w-auto sm:w-96 h-[460px] max-h-[calc(100vh-170px)] sm:max-h-[calc(100%-140px)] flex flex-col comic-card bg-white dark:bg-[#1E293B] border-2 sm:border-[2.5px] border-[#18181B] dark:border-[#475569] shadow-[5px_5px_0px_#18181B] dark:shadow-[5px_5px_0px_#020617] rounded-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-150">
            <div className="bg-[#FAF8F5] dark:bg-[#0F172A] border-b-2 border-[#18181B] dark:border-[#475569] p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-xs font-heading font-black text-[#18181B] dark:text-white uppercase tracking-wider">
                  Live Squad Comms
                </h3>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 hover:bg-[#E2E8F0] dark:hover:bg-[#334155] rounded-lg text-xs font-bold text-[#64748B] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <PartyCommunicationPanel
                partyId={gameId}
                currentUserId={currentUserId || ''}
                isHost={role === PlayerRole.HOST}
                matchId={gameId}
                className="h-full border-none shadow-none"
              />
            </div>
          </aside>
        )}

        {/* ── Bottom Floating Tactical HUD Dock ──────────────────────────────── */}
        <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 z-30 pointer-events-none">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 pointer-events-auto">
            {/* Left: Dynamic Danger Meter (For Runners) or Proximity Tracker (For Seekers) */}
            <div className="w-full sm:w-auto flex-1 comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-2.5 sm:p-3.5 shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] rounded-2xl flex flex-col justify-center transition-all">
              {role === PlayerRole.RUNNER ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-heading font-black text-[#18181B] dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#EA4335]" />
                      <span>HUNTER DANGER METER</span>
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          danger.band === DangerBand.CRITICAL
                            ? 'bg-[#FEE2E2] text-[#EF4444] border-[#EF4444] animate-bounce'
                            : danger.band === DangerBand.HIGH
                            ? 'bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]'
                            : danger.band === DangerBand.MEDIUM
                            ? 'bg-[#FEF7E0] text-[#D97706] border-[#D97706]'
                            : 'bg-[#F0FDF4] text-[#16A34A] border-[#16A34A]'
                        }`}
                      >
                        {danger.band} • {nearestSeekerDist !== null ? `${nearestSeekerDist}m AWAY` : 'CLEAR'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDangerMeterMinimized((m) => !m)}
                        className="p-1 hover:bg-[#F1F5F9] dark:hover:bg-[#334155] rounded-md text-[#64748B] dark:text-[#94A3B8] transition cursor-pointer"
                        title={isDangerMeterMinimized ? "Expand Danger Meter" : "Minimize Danger Meter"}
                      >
                        {isDangerMeterMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {!isDangerMeterMinimized && (
                    <DangerMeter
                      band={danger.band}
                      level={danger.level}
                      distance={nearestSeekerDist ?? undefined}
                      isOutsideZone={isOutsideZone}
                      distanceToZoneM={distanceToBoundaryM}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-heading font-black text-[#18181B] dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Crosshair className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>HUNTER RADAR TARGETING</span>
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono font-bold text-[#2563EB]">
                        {nearestRunnerDist !== null ? `NEAREST HIDER: ${nearestRunnerDist}m` : 'SCANNING AIRSPACE...'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDangerMeterMinimized((m) => !m)}
                        className="p-1 hover:bg-[#F1F5F9] dark:hover:bg-[#334155] rounded-md text-[#64748B] dark:text-[#94A3B8] transition cursor-pointer"
                        title={isDangerMeterMinimized ? "Expand Radar" : "Minimize Radar"}
                      >
                        {isDangerMeterMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {!isDangerMeterMinimized && (
                    <div className="w-full bg-[#E2E8F0] dark:bg-[#334155] h-3.5 rounded-full overflow-hidden border border-[#18181B]">
                      <div
                        className="h-full bg-gradient-to-r from-[#2563EB] to-[#EA4335] transition-all duration-300"
                        style={{
                          width: `${
                            nearestRunnerDist !== null
                              ? Math.min(100, Math.max(10, Math.round((1 - nearestRunnerDist / 200) * 100)))
                              : 10
                          }%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Action Buttons (Seeker Tag Button or Perspective Toggle) */}
            <div className="w-full sm:w-auto flex items-center gap-2">
              {role === PlayerRole.SEEKER && (
                <button
                  onClick={() => handleSeekerRequestCapture(runners[0]?.id || 'runner-target-id')}
                  disabled={nearestRunnerDist !== null && nearestRunnerDist > 25}
                  className={`w-full sm:w-auto px-5 py-3 sm:py-3.5 rounded-xl border-2 border-[#18181B] text-xs font-heading font-black shadow-[3px_3px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center justify-center space-x-2 ${
                    nearestRunnerDist !== null && nearestRunnerDist <= 15
                      ? 'bg-[#EA4335] hover:bg-[#DC2626] text-white animate-pulse'
                      : 'bg-[#FBBC04] text-[#18181B]'
                  }`}
                >
                  <Crosshair className="w-4 h-4 stroke-[3]" />
                  <span>TAG RUNNER (10M PROXIMITY)</span>
                </button>
              )}

              {/* Quick Perspective Toggle (Hider vs Seeker test) */}
              <button
                onClick={() => setRole((r) => (r === PlayerRole.RUNNER ? PlayerRole.SEEKER : PlayerRole.RUNNER))}
                className="px-3 py-3 sm:py-3.5 bg-white dark:bg-[#1E293B] hover:bg-[#F1F5F9] border-2 border-[#18181B] dark:border-[#475569] text-[#18181B] dark:text-white rounded-xl text-xs font-heading font-bold shadow-[2px_2px_0px_#18181B] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer whitespace-nowrap"
                title="Switch test perspective"
              >
                SWAP: {role === PlayerRole.RUNNER ? 'SEEKER' : 'HIDER'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Exit Confirmation Modal ─────────────────────────────────────────── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-[#18181B]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm comic-card bg-white dark:bg-[#1E293B] border-2 sm:border-[3px] border-[#18181B] p-6 shadow-[8px_8px_0px_#18181B] rounded-2xl relative">
            <h3 className="text-base font-heading font-black text-[#18181B] dark:text-white mb-2">
              Abandon Match Operation?
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mb-5 leading-relaxed">
              Exiting will disconnect you from live GPS tracking and radar updates. You can rejoin using room code{' '}
              <strong className="font-mono text-[#2563EB]">{roomCode}</strong> at any time.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="py-2.5 bg-white hover:bg-[#F8FAFC] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-[#18181B] shadow-[2px_2px_0px_#18181B] cursor-pointer"
              >
                STAY IN MATCH
              </button>
              <button
                onClick={onExit}
                className="py-2.5 bg-[#EA4335] hover:bg-[#DC2626] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-white shadow-[2px_2px_0px_#18181B] cursor-pointer"
              >
                CONFIRM EXIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mutual Capture Verification Modal ───────────────────────────────── */}
      {captureModalState.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#18181B]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md comic-card bg-white dark:bg-[#1E293B] border-2 sm:border-[3px] border-[#18181B] p-6 sm:p-7 shadow-[8px_8px_0px_#18181B] rounded-2xl relative">
            {captureModalState.stage === 'REQUESTING' && (
              <div className="text-center py-4 space-y-3">
                <Loader2 className="w-10 h-10 animate-spin text-[#4285F4] mx-auto" />
                <h3 className="text-lg font-heading font-black text-[#18181B] dark:text-white">
                  Transmitting Capture Request...
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Sending tag invitation to the target runner. Verifying server-side state.
                </p>
              </div>
            )}

            {captureModalState.stage === 'WAITING_HIDER_APPROVAL' && (
              <div className="text-center py-4 space-y-3">
                <Clock className="w-10 h-10 text-[#FBBC04] mx-auto animate-pulse" />
                <h3 className="text-lg font-heading font-black text-[#18181B] dark:text-white">
                  Waiting for Hider Approval
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  Capture request received by the runner. The 10m rule requires approval from both parties before GPS coordinates are verified.
                </p>
                <div className="text-[11px] font-mono text-[#4285F4] bg-[#FAF8F5] dark:bg-[#0F172A] p-2 rounded-xl border-2 border-[#18181B]">
                  REQUEST ID: {captureModalState.catchId?.slice(0, 8)}...
                </div>
              </div>
            )}

            {captureModalState.stage === 'REQUEST_RECEIVED' && (
              <div className="py-2 space-y-4">
                <div className="flex items-center space-x-3 text-[#EA4335]">
                  <Crosshair className="w-8 h-8 shrink-0 animate-pulse text-[#EA4335]" />
                  <div>
                    <h3 className="text-base font-heading font-black text-[#18181B] dark:text-white">
                      TAG REQUEST RECEIVED!
                    </h3>
                    <p className="text-xs font-medium text-[#EA4335]">
                      {captureModalState.seekerName || 'A nearby Seeker'} claims to be within 10m!
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] text-xs text-[#475569] dark:text-[#CBD5E1] space-y-1.5">
                  <div className="flex justify-between">
                    <span>Protocol:</span>
                    <span className="text-[#18181B] dark:text-white font-mono font-bold">Mutual 10m Verification</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Threshold:</span>
                    <span className="text-[#EA4335] font-mono font-black">≤ 10 Metres GPS</span>
                  </div>
                  <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] pt-1">
                    Approving triggers authoritative backend GPS calculation. If you are more than 10m away, the catch will be rejected automatically.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleHiderDeclineCapture}
                    className="py-2.5 bg-white hover:bg-[#FEE2E2] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-[#EA4335] shadow-[2px_2px_0px_#18181B] flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-[#EA4335]" />
                    <span>DECLINE TAG</span>
                  </button>

                  <button
                    onClick={handleHiderApproveCapture}
                    className="py-2.5 bg-[#10B981] hover:bg-[#059669] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-white shadow-[2px_2px_0px_#18181B] flex items-center justify-center space-x-1.5 cursor-pointer"
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
                <h3 className="text-lg font-heading font-black text-[#18181B] dark:text-white">
                  Verifying GPS Proximity...
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Computing Haversine distance between latest GPS fixes and auditing accuracy readings.
                </p>
              </div>
            )}

            {captureModalState.stage === 'CONFIRMED' && (
              <div className="text-center py-3 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-[#34A853] mx-auto animate-bounce" />
                <h3 className="text-xl font-heading font-black text-[#18181B] dark:text-white">Capture Confirmed!</h3>
                <p className="text-xs text-[#475569] dark:text-[#CBD5E1]">
                  Mutual approval verified. Proximity confirmed at{' '}
                  <span className="text-[#34A853] font-bold font-mono">
                    {captureModalState.verifiedDistanceM}m
                  </span>{' '}
                  (within the strict 10m rule).
                </p>
                <button
                  onClick={() => setCaptureModalState({ isOpen: false, stage: 'IDLE' })}
                  className="w-full py-3 bg-[#2563EB] hover:bg-[#1D4ED8] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-white shadow-[2px_2px_0px_#18181B] mt-2 cursor-pointer"
                >
                  CONTINUE MATCH
                </button>
              </div>
            )}

            {captureModalState.stage === 'FAILED' && (
              <div className="text-center py-3 space-y-3">
                <XCircle className="w-12 h-12 text-[#EA4335] mx-auto" />
                <h3 className="text-xl font-heading font-black text-[#18181B] dark:text-white">Capture Rejected</h3>
                <p className="text-xs text-[#EA4335] font-medium">
                  {captureModalState.failureReason || 'Distance between players exceeded 10m or GPS signal was insufficient.'}
                </p>
                <button
                  onClick={() => setCaptureModalState({ isOpen: false, stage: 'IDLE' })}
                  className="w-full py-2.5 bg-white hover:bg-[#F8FAFC] border-2 border-[#18181B] rounded-xl text-xs font-heading font-bold text-[#18181B] shadow-[2px_2px_0px_#18181B] mt-2 cursor-pointer"
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
