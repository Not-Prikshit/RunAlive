import React from 'react';
import { Trophy, Shield, Crosshair, RotateCcw, Clock, AlertTriangle } from 'lucide-react';

interface MatchResultsProps {
  roomCode: string;
  gameName: string;
  winnerTeam: 'RUNNERS' | 'SEEKERS' | 'DRAW';
  winReason: string;
  durationSeconds: number;
  stats?: {
    runnersCaught: number;
    runnersRemaining: number;
    totalCatches: number;
    violationsCount: number;
  };
  onPlayAgain: () => void;
}

export const MatchResults: React.FC<MatchResultsProps> = ({
  roomCode,
  gameName,
  winnerTeam,
  winReason,
  durationSeconds,
  stats = {
    runnersCaught: 3,
    runnersRemaining: 1,
    totalCatches: 3,
    violationsCount: 0,
  },
  onPlayAgain,
}) => {
  const isRunnersWin = winnerTeam === 'RUNNERS';

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Victory / Defeat Banner */}
      <div
        className={`border rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl ${
          isRunnersWin
            ? 'bg-gradient-to-b from-emerald-950/80 to-slate-900 border-emerald-500/30'
            : 'bg-gradient-to-b from-rose-950/80 to-slate-900 border-rose-500/30'
        }`}
      >
        <div className="flex justify-center mb-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              isRunnersWin
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}
          >
            <Trophy className="w-8 h-8 animate-bounce" />
          </div>
        </div>

        <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
          Match Room: {roomCode}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-1 mb-2">
          {winnerTeam} VICTORY!
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-sm mx-auto">
          {winReason || 'All objectives completed for the round.'}
        </p>

        <div className="mt-6 inline-flex items-center space-x-2 bg-slate-950/60 border border-slate-800 px-4 py-2 rounded-xl text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Match Duration: {Math.floor(durationSeconds / 60)}m {durationSeconds % 60}s
          </span>
        </div>
      </div>

      {/* Match Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase">Runners Survived</p>
            <p className="text-xl font-bold text-white">{stats.runnersRemaining}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5">
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase">Runners Caught</p>
            <p className="text-xl font-bold text-white">{stats.runnersCaught}</p>
          </div>
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-2">
        <button
          onClick={onPlayAgain}
          className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-xl shadow-rose-950/40 transition flex items-center justify-center space-x-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Return to Lobby</span>
        </button>
      </div>
    </div>
  );
};
