import React, { useState } from 'react';
import { api } from '../lib/api';
import {
  MapPin,
  Sliders,
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Navigation,
} from 'lucide-react';
import { CampusMap } from './CampusMap';

interface HostPerimeterEditorProps {
  onBack: () => void;
  onGameCreated: (gameId: string) => void;
}

export const HostPerimeterEditor: React.FC<HostPerimeterEditorProps> = ({
  onBack,
  onGameCreated,
}) => {
  const [gameName, setGameName] = useState('Campus Tag Championship');
  const [lat, setLat] = useState(28.4595);
  const [lng, setLng] = useState(77.5135);
  const [radiusMeters, setRadiusMeters] = useState(500);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [isLocating, setIsLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use browser geolocation to pin center to host current location
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setIsLocating(false);
      },
      (err) => {
        setError(err.message || 'Unable to retrieve location');
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCreateMatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ game: { id: string } }>('/games', {
        name: gameName,
        boundaryCenterLat: lat,
        boundaryCenterLng: lng,
        boundaryRadiusMeters: radiusMeters,
        totalRounds: 1,
        roundDurationMinutes: durationMinutes,
      });
      onGameCreated(res.game.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create match');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Lobby</span>
        </button>
        <div className="flex items-center space-x-2 text-rose-500 font-bold text-sm">
          <MapPin className="w-5 h-5" />
          <span>HOST ZONE EDITOR</span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Campus Map Perimeter Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">Campus Circular Zone</h3>
            <p className="text-xs text-slate-400">
              Center: {lat.toFixed(4)}, {lng.toFixed(4)} | Radius: {radiusMeters}m
            </p>
          </div>
          <button
            onClick={handleUseMyLocation}
            disabled={isLocating}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition"
          >
            <Navigation className="w-3.5 h-3.5 text-blue-400" />
            <span>{isLocating ? 'Locating...' : 'Snap Center to GPS'}</span>
          </button>
        </div>

        <CampusMap
          center={[lat, lng]}
          radiusMeters={radiusMeters}
          userPos={[lat, lng]}
        />
      </div>

      {/* Boundary Controls Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
            Match Name
          </label>
          <input
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase text-slate-400">
                Zone Radius: {radiusMeters}m
              </label>
            </div>
            <input
              type="range"
              min={100}
              max={3000}
              step={50}
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-mono">
              <span>100m</span>
              <span>1000m</span>
              <span>3000m</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase text-slate-400">
                Round Duration: {durationMinutes} min
              </label>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-mono">
              <span>5m</span>
              <span>30m</span>
              <span>60m</span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleCreateMatch}
            disabled={loading}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-xl shadow-rose-950/40 transition flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4" />
            <span>{loading ? 'Creating Match Room...' : 'Confirm Perimeter & Host Match'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
