import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import {
  MapPin,
  Sliders,
  Crosshair,
  ArrowLeft,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Compass,
  Sparkles,
  Layers,
  Square,
  Circle,
  Hexagon,
  Users,
  ShieldAlert,
  Shuffle,
  Undo2,
  Trash2,
  Check,
  Flame,
  Zap,
} from 'lucide-react';
import { MapplsMap, type PerimeterShape } from './MapplsMap';

interface TacticalMapRoomProps {
  gameId?: string | null;
  onBack: () => void;
  onConfirmPerimeter: (params: {
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
  }) => void;
}

export const TacticalMapRoom: React.FC<TacticalMapRoomProps> = React.memo(({
  gameId,
  onBack,
  onConfirmPerimeter,
}) => {
  // Center Coordinate
  const [lat, setLat] = useState(28.4595);
  const [lng, setLng] = useState(77.5135);

  // Game Configuration Parameters
  const [matchName, setMatchName] = useState('Campus Tag Championship');
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [radiusMeters, setRadiusMeters] = useState(100);
  const [roundDurationMinutes, setRoundDurationMinutes] = useState(15);
  const [totalRounds, setTotalRounds] = useState(2);
  const [hiderHeadstartSeconds, setHiderHeadstartSeconds] = useState(60);
  const [allowTeamSwitching, setAllowTeamSwitching] = useState(true);

  // Perimeter Shape & Rectangle Interactive States
  const [shape, setShape] = useState<PerimeterShape>('CIRCLE');
  const [rectWidth, setRectWidth] = useState(600);
  const [rectHeight, setRectHeight] = useState(600);
  const [rectRotation, setRectRotation] = useState(0);
  const [polygonPoints, setPolygonPoints] = useState<Array<[number, number]>>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);

  const [isLocating, setIsLocating] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Browser GPS Centering
  const handleGPSCenter = () => {
    if (!navigator.geolocation) {
      setNotification('GPS tracking not supported in this client.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = Number(pos.coords.latitude.toFixed(5));
        const userLng = Number(pos.coords.longitude.toFixed(5));
        setLat(userLat);
        setLng(userLng);
        setIsLocating(false);
        setNotification('Center pinned to your live GPS coordinates.');
      },
      (err) => {
        setNotification(`GPS acquisition failed: ${err.message}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    handleGPSCenter();
  }, []);

  // Calculate estimated playing area in km²
  const estimatedAreaKm2 = useMemo(() => {
    if (shape === 'CIRCLE') {
      const areaM2 = Math.PI * Math.pow(radiusMeters, 2);
      return (areaM2 / 1_000_000).toFixed(2);
    }
    if (shape === 'RECTANGLE') {
      const areaM2 = rectWidth * rectHeight;
      return (areaM2 / 1_000_000).toFixed(2);
    }
    if (shape === 'POLYGON' && polygonPoints.length >= 3) {
      let area = 0;
      for (let i = 0; i < polygonPoints.length; i++) {
        const j = (i + 1) % polygonPoints.length;
        const p1 = polygonPoints[i];
        const p2 = polygonPoints[j];
        const x1 = p1[1] * 111320 * Math.cos((p1[0] * Math.PI) / 180);
        const y1 = p1[0] * 111320;
        const x2 = p2[1] * 111320 * Math.cos((p2[0] * Math.PI) / 180);
        const y2 = p2[0] * 111320;
        area += x1 * y2 - x2 * y1;
      }
      return (Math.abs(area) / 2 / 1_000_000).toFixed(2);
    }
    return '0.79';
  }, [shape, radiusMeters, rectWidth, rectHeight, polygonPoints]);

  const handleCreateAndConfirmMatch = async () => {
    setIsCreating(true);
    setNotification(null);

    try {
      let createdGameId = gameId;

      if (!createdGameId) {
        const res = await api.post<any>('/games', {
          name: matchName || 'Campus Tag Match',
          boundaryCenterLat: lat,
          boundaryCenterLng: lng,
          boundaryRadiusMeters: radiusMeters,
          totalRounds: totalRounds,
          roundDurationMinutes: roundDurationMinutes,
          maxPlayers: maxPlayers,
          shape,
          rectWidth,
          rectHeight,
          rectRotation,
          polygonPoints: shape === 'POLYGON' ? polygonPoints : undefined,
        });
        createdGameId = res.game?.id || res.id || res.gameId;
      } else {
        await api.put(`/games/${createdGameId}/perimeter`, {
          shape,
          rectWidth,
          rectHeight,
          rectRotation,
          polygonPoints: shape === 'POLYGON' ? polygonPoints : undefined,
        }).catch(() => {});
      }

      if (!createdGameId) {
        throw new Error('Failed to obtain a valid match ID from the server.');
      }

      onConfirmPerimeter({
        gameId: createdGameId,
        lat,
        lng,
        radius: radiusMeters,
        rounds: totalRounds,
        shape,
        rectWidth,
        rectHeight,
        rectRotation,
        polygonPoints: shape === 'POLYGON' ? polygonPoints : undefined,
      });
    } catch (err: any) {
      setNotification(err.message || 'Failed to initialize match configuration.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Top Workstation Bar */}
      <div className="comic-card bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-[4px_4px_0px_#18181B] relative paper-tape">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="p-2.5 bg-white hover:bg-[#F8FAFC] border-2 border-[#18181B] text-[#18181B] rounded-xl shadow-[2.5px_2.5px_0px_#18181B] active:translate-y-0.5 transition cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-block comic-stamp bg-[#E8F0FE] text-[#4285F4] border-[#18181B] text-[10px]">
                ✦ HOST WORKSTATION
              </span>
              <span className="text-[#CBD5E1] hidden sm:inline">|</span>
              <span className="text-[11px] font-mono text-[#64748B] hidden sm:inline">PERIMETER & RULES SETUP</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-[#18181B] tracking-tight">
              Host Match Configuration
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleGPSCenter}
            disabled={isLocating}
            className="px-3.5 py-2.5 comic-btn-yellow text-xs flex items-center space-x-2"
          >
            <Navigation className="w-3.5 h-3.5 text-[#18181B]" />
            <span>{isLocating ? 'Locating...' : 'Sync to My GPS'}</span>
          </button>

          <button
            onClick={handleCreateAndConfirmMatch}
            disabled={isCreating}
            className="px-5 py-2.5 comic-btn-green text-xs sm:text-sm flex items-center space-x-2 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isCreating ? 'Creating Match...' : 'Confirm & Open Lobby'}</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="bg-[#FEF7E0] border-2 border-[#FBBC04] p-3 rounded-xl text-xs font-heading font-bold text-[#B45309] flex items-center justify-between shadow-[2.5px_2.5px_0px_#18181B]">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-[#B45309] hover:text-[#18181B] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Main Map Workstation Grid */}
      <div className="grid lg:grid-cols-4 gap-4">
        {/* Dominant Map Canvas (3 Columns on Desktop, Full Width on Mobile) */}
        <div className="lg:col-span-3 comic-card bg-white dark:bg-[#1E293B] p-2.5 sm:p-3 relative flex flex-col justify-between shadow-[5px_5px_0px_#0F172A] dark:shadow-[5px_5px_0px_#020617]">
          {/* Quick Shape Mode Switcher Tabs directly above Map */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-xl border-2 border-[#0F172A] dark:border-[#475569]">
              <button
                type="button"
                onClick={() => setShape('CIRCLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-black transition flex items-center space-x-1.5 cursor-pointer ${
                  shape === 'CIRCLE'
                    ? 'bg-[#2563EB] text-white border border-[#0F172A] shadow-[2px_2px_0px_#0F172A]'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Circle className="w-3.5 h-3.5" />
                <span>Circle (Draggable)</span>
              </button>

              <button
                type="button"
                onClick={() => setShape('RECTANGLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-black transition flex items-center space-x-1.5 cursor-pointer ${
                  shape === 'RECTANGLE'
                    ? 'bg-[#FBBF24] text-[#0F172A] border border-[#0F172A] shadow-[2px_2px_0px_#0F172A]'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Box (Draggable & Rotatable)</span>
              </button>

              <button
                type="button"
                onClick={() => setShape('POLYGON')}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-black transition flex items-center space-x-1.5 cursor-pointer ${
                  shape === 'POLYGON'
                    ? 'bg-[#EF4444] text-white border border-[#0F172A] shadow-[2px_2px_0px_#0F172A]'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Hexagon className="w-3.5 h-3.5" />
                <span>Custom Polygon (Draw Points)</span>
              </button>
            </div>

            {shape === 'POLYGON' && (
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-[#EA4335] dark:text-[#FECACA] bg-[#FCE8E6] dark:bg-[#7F1D1D] px-2.5 py-1 rounded-lg border border-[#EA4335]">
                  ✏️ Click map to add points ({polygonPoints.length}/3 min)
                </span>
                {polygonPoints.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPolygonPoints((prev) => prev.slice(0, -1))}
                      className="px-2 py-1 bg-white dark:bg-[#1E293B] border border-[#18181B] rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer hover:bg-[#FEEFC3]"
                      title="Undo Last Point"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolygonPoints([])}
                      className="px-2 py-1 bg-white dark:bg-[#1E293B] border border-[#18181B] rounded-lg text-xs font-bold text-[#EA4335] flex items-center space-x-1 cursor-pointer hover:bg-[#FCE8E6]"
                      title="Clear All Points"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Interactive Map with Shape Selector & Custom Drawing */}
          <MapplsMap
            center={[lat, lng]}
            radiusMeters={radiusMeters}
            dangerZoneRadiusMeters={totalRounds > 1 ? Math.round(radiusMeters * 0.6) : undefined}
            perimeterShape={shape}
            editablePerimeter={true}
            rectWidthMeters={rectWidth}
            rectHeightMeters={rectHeight}
            rectRotationDeg={rectRotation}
            onRectangleChange={(params) => {
              setRectWidth(params.widthMeters);
              setRectHeight(params.heightMeters);
              setRectRotation(params.rotationDeg);
              setLat(params.center[0]);
              setLng(params.center[1]);
            }}
            onCenterChange={(newCenter) => {
              setLat(newCenter[0]);
              setLng(newCenter[1]);
            }}
            onRadiusChange={(newRadius) => {
              setRadiusMeters(newRadius);
            }}
            polygonPoints={polygonPoints}
            onPolygonPointsChange={setPolygonPoints}
            isDrawingPolygon={isDrawingPolygon}
            userPos={[lat, lng]}
            className="w-full h-[460px] sm:h-[560px] rounded-xl border-2 border-[#18181B] dark:border-[#475569]"
            onMapClick={(clickedLat, clickedLng) => {
              if (shape === 'POLYGON') {
                setPolygonPoints((prev) => [...prev, [clickedLat, clickedLng]]);
                setNotification(`Added Polygon Vertex #${polygonPoints.length + 1} at [${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)}]`);
              } else {
                setNotification('💡 Grab and drag the perimeter shape or center handle to move the arena anywhere!');
              }
            }}
          />

          {/* Map Footer Metadata & Polygon Controls */}
          <div className="mt-3 px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] dark:border-[#475569] flex flex-wrap items-center justify-between text-xs font-heading font-bold text-[#18181B] dark:text-[#F8FAFC] gap-2">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-[#4285F4] border border-[#18181B]" />
                <span>
                  Active Perimeter ({shape}: {shape === 'RECTANGLE' ? `${rectWidth}m × ${rectHeight}m • ${rectRotation}°` : `${radiusMeters}m`} • {estimatedAreaKm2} km²)
                </span>
              </span>
              {totalRounds > 1 && (
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#EA4335] border border-[#18181B]" />
                  <span>
                    Next Safe Zone ({Math.round(radiusMeters * 0.6)}m)
                  </span>
                </span>
              )}
            </div>

            {shape === 'POLYGON' && (
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  {polygonPoints.length} vertices
                </span>
                {polygonPoints.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPolygonPoints((prev) => prev.slice(0, -1))}
                      className="px-2 py-1 text-xs font-heading font-bold bg-white dark:bg-[#1E293B] text-[#4285F4] rounded-lg border-2 border-[#18181B] dark:border-[#475569] shadow-[1.5px_1.5px_0px_#18181B] cursor-pointer flex items-center space-x-1"
                      title="Undo Last Vertex"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolygonPoints([])}
                      className="p-1 text-[#EA4335] bg-[#FCE8E6] hover:bg-[#FAD2CF] rounded-lg border-2 border-[#18181B] shadow-[1.5px_1.5px_0px_#18181B] cursor-pointer"
                      title="Clear All Polygon Vertices"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Configuration Parameters (1 Column) */}
        <div className="space-y-4">
          <div className="comic-card bg-white dark:bg-[#1E293B] p-5 space-y-4 shadow-[5px_5px_0px_#18181B] dark:shadow-[5px_5px_0px_#020617] border-2 border-[#18181B] dark:border-[#475569]">
            <div className="border-b-2 border-dashed border-[#CBD5E1] dark:border-[#334155] pb-3">
              <h3 className="text-sm font-heading font-black text-[#18181B] dark:text-[#F8FAFC] flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-[#4285F4]" />
                <span>Match Parameters</span>
              </h3>
            </div>

            {/* Match Title */}
            <div>
              <label className="block text-xs font-heading font-bold text-[#18181B] dark:text-[#F8FAFC] mb-1 uppercase">
                Match Title
              </label>
              <input
                type="text"
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                className="w-full bg-[#FAF8F5] dark:bg-[#0F172A] text-[#18181B] dark:text-[#F8FAFC] text-xs font-medium px-3 py-2 rounded-xl border-2 border-[#18181B] dark:border-[#475569] focus:bg-white focus:shadow-[2.5px_2.5px_0px_#4285F4] outline-none"
              />
            </div>

            {/* Perimeter Shape Selector */}
            <div>
              <label className="block text-xs font-heading font-bold text-[#18181B] dark:text-[#F8FAFC] mb-1.5 uppercase">
                Perimeter Geometry
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F1ECE4] dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] dark:border-[#475569]">
                <button
                  type="button"
                  onClick={() => setShape('CIRCLE')}
                  className={`py-1.5 text-xs font-heading font-bold rounded-lg flex items-center justify-center space-x-1 transition cursor-pointer ${
                    shape === 'CIRCLE'
                      ? 'bg-[#4285F4] text-white border-2 border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white'
                  }`}
                >
                  <Circle className="w-3.5 h-3.5" />
                  <span>Circle</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShape('RECTANGLE')}
                  className={`py-1.5 text-xs font-heading font-bold rounded-lg flex items-center justify-center space-x-1 transition cursor-pointer ${
                    shape === 'RECTANGLE'
                      ? 'bg-[#4285F4] text-white border-2 border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Rectangle</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShape('POLYGON');
                    setIsDrawingPolygon(true);
                  }}
                  className={`py-1.5 text-xs font-heading font-bold rounded-lg flex items-center justify-center space-x-1 transition cursor-pointer ${
                    shape === 'POLYGON'
                      ? 'bg-[#4285F4] text-white border-2 border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white'
                  }`}
                >
                  <Hexagon className="w-3.5 h-3.5" />
                  <span>Polygon</span>
                </button>
              </div>
            </div>

            {/* Shape Specific Sliders */}
            {shape === 'CIRCLE' && (
              <div>
                <div className="flex justify-between items-center text-xs font-heading font-bold mb-1.5">
                  <span className="text-[#18181B] dark:text-[#F8FAFC]">BOUNDARY RADIUS</span>
                  <span className="text-[#4285F4] font-mono text-sm font-black">{radiusMeters}m</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setRadiusMeters((prev) => Math.max(25, prev - 25))}
                    className="px-2 py-1 bg-[#FCE8E6] text-[#EA4335] border-2 border-[#18181B] rounded-lg font-heading font-black text-xs cursor-pointer hover:bg-[#FAD2CF] active:translate-y-0.5"
                    title="Shrink -25m"
                  >
                    -25m
                  </button>
                  <input
                    type="range"
                    min={25}
                    max={2000}
                    step={5}
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(Number(e.target.value))}
                    className="flex-1 accent-[#4285F4] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setRadiusMeters((prev) => Math.min(2000, prev + 25))}
                    className="px-2 py-1 bg-[#E6F4EA] text-[#1E8E3E] border-2 border-[#18181B] rounded-lg font-heading font-black text-xs cursor-pointer hover:bg-[#CEEAD6] active:translate-y-0.5"
                    title="Expand +25m"
                  >
                    +25m
                  </button>
                </div>
                {/* Short to Long Preset Pills */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {[25, 50, 100, 250, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRadiusMeters(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                        radiusMeters === preset
                          ? 'bg-[#4285F4] text-white border-[#18181B]'
                          : 'bg-white dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8] hover:border-[#18181B]'
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8] mt-1">
                  <span>25m (Courtyard)</span>
                  <span>2000m (City)</span>
                </div>
              </div>
            )}

            {shape === 'RECTANGLE' && (
              <div className="space-y-3 p-3 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                <div className="flex justify-between items-center text-xs font-heading font-bold">
                  <span className="text-[#18181B] dark:text-[#F8FAFC]">ROTATION ORIENTATION</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[#FBBC04] font-mono text-sm font-black">{Math.round(rectRotation)}°</span>
                    {rectRotation !== 0 && (
                      <button
                        type="button"
                        onClick={() => setRectRotation(0)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#1E293B] border border-[#18181B] text-[#EA4335] font-bold cursor-pointer"
                        title="Reset Rotation to 0°"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={rectRotation}
                  onChange={(e) => setRectRotation(Number(e.target.value))}
                  className="w-full accent-[#FBBC04] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  <span>0° (North)</span>
                  <span>180° (South)</span>
                  <span>360°</span>
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] pt-1">
                  💡 Drag the yellow stem handle directly on the map to rotate!
                </div>
              </div>
            )}

            {shape === 'POLYGON' && (
              <div className="p-3 bg-[#FAF8F5] dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs text-[#475569] dark:text-[#94A3B8] space-y-1.5">
                <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                  How to Build Polygon:
                </span>
                <p className="text-[11px] leading-relaxed">
                  1. Click on the map to add boundary points.
                  <br />
                  2. Drag numbered nodes to adjust fence lines.
                  <br />
                  3. Minimum 3 points required.
                </p>
                {polygonPoints.length < 3 && (
                  <div className="text-[#EA4335] text-[11px] font-bold flex items-center space-x-1 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Add {3 - polygonPoints.length} more point{3 - polygonPoints.length > 1 ? 's' : ''} to form a closed polygon.</span>
                  </div>
                )}
              </div>
            )}

            {/* Max Players */}
            <div>
              <div className="flex justify-between items-center text-xs font-heading font-bold mb-1.5">
                <span className="text-[#18181B] dark:text-[#F8FAFC]">PLAYER CAPACITY</span>
                <span className="text-[#34A853] font-mono text-sm">{maxPlayers} Players</span>
              </div>
              <input
                type="range"
                min={2}
                max={40}
                step={2}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full accent-[#34A853] cursor-pointer"
              />
            </div>

            {/* Total Rounds */}
            <div>
              <div className="flex justify-between items-center text-xs font-heading font-bold mb-1.5">
                <span className="text-[#18181B] dark:text-[#F8FAFC]">ROUNDS</span>
                <span className="text-[#EA4335] font-mono text-sm">{totalRounds} Rounds</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTotalRounds(r)}
                    className={`py-1.5 text-xs font-heading font-bold rounded-lg border-2 transition cursor-pointer ${
                      totalRounds === r
                        ? 'bg-[#EA4335] text-white border-[#18181B] shadow-[2px_2px_0px_#18181B]'
                        : 'bg-[#FAF8F5] text-[#475569] border-[#CBD5E1] hover:border-[#18181B]'
                    }`}
                  >
                    {r}R
                  </button>
                ))}
              </div>
            </div>

            {/* Round Duration */}
            <div>
              <div className="flex justify-between items-center text-xs font-heading font-bold mb-1.5">
                <span className="text-[#18181B] dark:text-[#F8FAFC]">ROUND DURATION</span>
                <span className="text-[#FBBC04] font-mono text-sm">{roundDurationMinutes} Mins</span>
              </div>
              <input
                type="range"
                min={5}
                max={45}
                step={5}
                value={roundDurationMinutes}
                onChange={(e) => setRoundDurationMinutes(Number(e.target.value))}
                className="w-full accent-[#FBBC04] cursor-pointer"
              />
            </div>

            {/* Hider Headstart Duration */}
            <div>
              <div className="flex justify-between items-center text-xs font-heading font-bold mb-1.5">
                <span className="text-[#18181B] dark:text-[#F8FAFC]">HIDER HEADSTART</span>
                <span className="text-[#4285F4] font-mono text-sm">{hiderHeadstartSeconds}s</span>
              </div>
              <input
                type="range"
                min={15}
                max={120}
                step={15}
                value={hiderHeadstartSeconds}
                onChange={(e) => setHiderHeadstartSeconds(Number(e.target.value))}
                className="w-full accent-[#4285F4] cursor-pointer"
              />
            </div>

            {/* Team Switching Toggle */}
            <div className="pt-2 border-t-2 border-dashed border-[#CBD5E1] dark:border-[#475569]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-heading font-bold text-[#18181B] dark:text-[#F8FAFC] block">Allow Team Switching</span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">Players can choose Hider / Seeker</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowTeamSwitching(!allowTeamSwitching)}
                  className={`w-12 h-7 rounded-full border-2 border-[#18181B] dark:border-[#475569] transition-colors relative cursor-pointer ${
                    allowTeamSwitching ? 'bg-[#34A853]' : 'bg-[#E2E8F0] dark:bg-[#334155]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white border border-[#18181B] shadow-sm absolute top-1 transition-transform ${
                      allowTeamSwitching ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TacticalMapRoom.displayName = 'TacticalMapRoom';
export default TacticalMapRoom;
