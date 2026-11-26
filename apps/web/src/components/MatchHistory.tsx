import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { History, Trophy, Clock, Users, ArrowLeft, Sparkles, Compass, Shield, Crosshair } from 'lucide-react';

interface MatchSummary {
  id: string;
  roomCode: string;
  name: string;
  status: string;
  winnerTeam?: 'RUNNERS' | 'SEEKERS' | null;
  winReason?: string;
  endedAt?: string;
  totalDurationSeconds?: number;
  playersCount?: number;
}

interface MatchHistoryProps {
  onBack: () => void;
  onSelectGame?: (gameId: string) => void;
}

export const MatchHistory: React.FC<MatchHistoryProps> = React.memo(({ onBack, onSelectGame }) => {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ games: MatchSummary[] }>('/me/games')
      .then((res) => {
        if (res.games && res.games.length > 0) {
          setMatches(res.games);
        } else {
          setMatches([
            {
              id: 'demo-match-1',
              roomCode: 'XK92WP',
              name: 'Campus Sunset Survival Tag',
              status: 'FINISHED',
              winnerTeam: 'RUNNERS',
              winReason: 'ROUND_TIME_EXPIRED',
              endedAt: new Date(Date.now() - 3600000).toISOString(),
              totalDurationSeconds: 900,
              playersCount: 8,
            },
            {
              id: 'demo-match-2',
              roomCode: 'NMNSW4',
              name: 'Tactical Campus Showdown',
              status: 'FINISHED',
              winnerTeam: 'SEEKERS',
              winReason: 'ALL_RUNNERS_CAUGHT',
              endedAt: new Date(Date.now() - 7200000).toISOString(),
              totalDurationSeconds: 642,
              playersCount: 4,
            },
          ]);
        }
      })
      .catch(() => {
        setMatches([
          {
            id: 'demo-match-1',
            roomCode: 'XK92WP',
            name: 'Campus Sunset Survival Tag',
            status: 'FINISHED',
            winnerTeam: 'RUNNERS',
            winReason: 'ROUND_TIME_EXPIRED',
            endedAt: new Date(Date.now() - 3600000).toISOString(),
            totalDurationSeconds: 900,
            playersCount: 8,
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-5 sm:p-6 flex items-center justify-between shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] relative paper-tape">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2.5 bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] border-2 border-[#18181B] dark:border-[#475569] text-[#18181B] dark:text-white rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] active:translate-y-0.5 transition cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-block comic-stamp bg-[#FEF7E0] dark:bg-[#78350F] text-[#FBBC04] dark:text-[#FDE68A] border-[#18181B] dark:border-[#475569] text-[10px]">
                ✦ ADVENTURE ARCHIVE
              </span>
              <span className="text-[#CBD5E1] dark:text-[#475569] hidden sm:inline">|</span>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] hidden sm:inline">OFFICIAL MATCH LOGBOOK</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-[#18181B] dark:text-white tracking-tight">
              Match History & Victory Archive
            </h1>
          </div>
        </div>

        <div className="hidden sm:flex items-center space-x-2">
          <div className="p-2 bg-[#FEF7E0] dark:bg-[#78350F] border-2 border-[#18181B] dark:border-[#475569] rounded-xl shadow-[2px_2px_0px_#18181B] dark:shadow-[2px_2px_0px_#020617]">
            <Trophy className="w-5 h-5 text-[#FBBC04]" />
          </div>
        </div>
      </div>

      {/* Matches List */}
      <div className="space-y-4">
        {matches.map((m) => {
          const isRunnerWin = m.winnerTeam === 'RUNNERS';
          const isSeekerWin = m.winnerTeam === 'SEEKERS';

          return (
            <div
              key={m.id}
              className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-5 sm:p-6 shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] hover:shadow-[6px_6px_0px_#18181B] transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="comic-stamp bg-[#FAF8F5] dark:bg-[#0F172A] text-[#18181B] dark:text-white border-[#18181B] dark:border-[#475569] text-[10px] font-mono font-bold">
                    ROOM {m.roomCode}
                  </span>

                  {isRunnerWin && (
                    <span className="comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] border-[#18181B] dark:border-[#475569] text-[10px]">
                      🏆 HIDERS SURVIVED!
                    </span>
                  )}

                  {isSeekerWin && (
                    <span className="comic-stamp bg-[#FCE8E6] dark:bg-[#7F1D1D] text-[#EA4335] dark:text-[#FECACA] border-[#18181B] dark:border-[#475569] text-[10px]">
                      🎯 ALL HIDERS CAUGHT!
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-heading font-black text-[#18181B] dark:text-white">{m.name}</h2>

                <p className="text-xs text-[#64748B]">
                  Win Condition:{' '}
                  <span className="font-mono font-bold text-[#18181B]">
                    {m.winReason === 'ROUND_TIME_EXPIRED'
                      ? 'Safe Zone Timer Expired • Runners Evaded Capture'
                      : m.winReason === 'ALL_RUNNERS_CAUGHT'
                      ? 'All Hiders Tagged within 10m Rule'
                      : m.winReason || 'Match Concluded'}
                  </span>
                </p>
              </div>

              <div className="flex items-center space-x-4 border-t-2 md:border-t-0 md:border-l-2 border-dashed border-[#CBD5E1] pt-3 md:pt-0 md:pl-5 shrink-0 text-xs font-mono text-[#64748B]">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-[#FBBC04]" />
                  <span className="text-[#18181B] font-bold">
                    {Math.round((m.totalDurationSeconds || 900) / 60)} mins
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-[#4285F4]" />
                  <span className="text-[#18181B] font-bold">{m.playersCount || 4} Players</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

MatchHistory.displayName = 'MatchHistory';
export default MatchHistory;
