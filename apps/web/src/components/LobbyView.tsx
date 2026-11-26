import React, { useState } from 'react';
import { api } from '../lib/api';
import { Plus, LogIn, History, MapPin, Zap } from 'lucide-react';

interface LobbyViewProps {
  onJoinGame: (gameId: string) => void;
  onOpenPerimeterEditor: () => void;
  onOpenHistory: () => void;
  userDisplayName: string;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  onJoinGame,
  onOpenPerimeterEditor,
  onOpenHistory,
  userDisplayName,
}) => {
  const [roomCode, setRoomCode] = useState('');
  const [gameName, setGameName] = useState('Campus Tag Match');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ game: { id: string; roomCode: string } }>('/games', {
        name: gameName,
        boundaryCenterLat: 28.4595,
        boundaryCenterLng: 77.5135,
        boundaryRadiusMeters: 500,
        totalRounds: 1,
        roundDurationMinutes: 15,
      });
      onJoinGame(res.game.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!roomCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ gameId: string }>('/games/join', {
        roomCode: roomCode.trim().toUpperCase(),
        safetyConsentAccepted: true,
        locationConsentAccepted: true,
      });
      onJoinGame(res.gameId);
    } catch (err: any) {
      setError(err.message || 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-mono font-bold text-rose-500 tracking-wider">
            Player Dashboard
          </span>
          <h2 className="text-2xl font-black text-white mt-1">Welcome back, {userDisplayName}!</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md">
            Ready to play? Enter a room code to sprint as a Runner or track as a Seeker.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenHistory}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-2xl text-xs font-bold transition"
          >
            <History className="w-4 h-4 text-rose-500" />
            <span>Match History</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-200 text-xs sm:text-sm">
          {error}
        </div>
      )}

      {/* Main Action Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Join by Code */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl">
                <LogIn className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Join Match</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Enter the 6-character room code from your host to enter the arena.
            </p>
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. XK92WP"
              className="w-full text-center tracking-widest text-2xl font-mono uppercase bg-slate-950 border border-slate-800 rounded-2xl py-3 text-white focus:outline-none focus:border-blue-500 mb-2"
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={loading || roomCode.length < 4}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-2xl shadow-lg shadow-blue-950/50 transition disabled:opacity-40"
          >
            {loading ? 'Entering...' : 'Enter Match'}
          </button>
        </div>

        {/* Host / Create Game */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-2xl">
                <Plus className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Host Match</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Quickly create a match or customize circular boundary radius on campus map.
            </p>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Match Name"
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-rose-500 mb-2"
            />
          </div>
          <div className="space-y-2">
            <button
              onClick={handleQuickCreate}
              disabled={loading}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-2xl shadow-lg shadow-rose-950/50 transition disabled:opacity-40"
            >
              {loading ? 'Creating...' : 'Quick Host (Default Perimeter)'}
            </button>
            <button
              onClick={onOpenPerimeterEditor}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-2xl transition flex items-center justify-center space-x-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>Customize Perimeter on Map</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
