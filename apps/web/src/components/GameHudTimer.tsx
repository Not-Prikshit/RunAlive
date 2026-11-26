import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';

interface GameHudTimerProps {
  status: 'LOBBY' | 'ACTIVE' | 'PAUSED' | 'FINISHED';
  initialRemainingSeconds?: number;
  initialShrinkSeconds?: number;
  onShrinkTriggered?: () => void;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const GameHudTimer: React.FC<GameHudTimerProps> = React.memo(({
  status,
  initialRemainingSeconds = 900,
  initialShrinkSeconds = 180,
  onShrinkTriggered,
}) => {
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(initialRemainingSeconds);
  const [nextShrinkCountdown, setNextShrinkCountdown] = useState(initialShrinkSeconds);

  useEffect(() => {
    if (status !== 'ACTIVE') return;

    const interval = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setNextShrinkCountdown((prev) => {
        if (prev <= 1) {
          if (onShrinkTriggered) onShrinkTriggered();
          return 180;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, onShrinkTriggered]);

  return (
    <div className="flex items-center space-x-3 sm:space-x-4">
      {/* Match Timer */}
      <div className="bg-[#FEF7E0] dark:bg-[#78350F] border-2 border-[#18181B] dark:border-[#475569] px-3.5 py-1.5 rounded-xl flex items-center space-x-2 shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617]">
        <Clock className="w-4 h-4 text-[#B45309] dark:text-[#FDE68A]" />
        <div>
          <span className="text-[9px] font-heading font-bold uppercase text-[#B45309] dark:text-[#FDE68A] block">
            MATCH TIMER
          </span>
          <span className="text-base sm:text-lg font-mono font-black text-[#18181B] dark:text-white tracking-wider">
            {formatTimer(timeRemainingSeconds)}
          </span>
        </div>
      </div>

      {/* Safe Zone Shrink Countdown Indicator */}
      <div className="hidden sm:flex bg-[#FCE8E6] dark:bg-[#7F1D1D] border-2 border-[#18181B] dark:border-[#475569] px-3.5 py-1.5 rounded-xl items-center space-x-2 shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617]">
        <ShieldAlert className="w-4 h-4 text-[#EA4335] dark:text-[#FECACA] animate-pulse" />
        <div>
          <span className="text-[9px] font-heading font-bold uppercase text-[#EA4335] dark:text-[#FECACA] block">
            NEXT SHRINK
          </span>
          <span className="text-base font-mono font-black text-[#EA4335] dark:text-[#FECACA]">
            {formatTimer(nextShrinkCountdown)}
          </span>
        </div>
      </div>
    </div>
  );
});

GameHudTimer.displayName = 'GameHudTimer';
export default GameHudTimer;
