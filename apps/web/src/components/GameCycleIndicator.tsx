import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface GameCycleIndicatorProps {
  isTransmitting: boolean;
  onTriggerPing: () => void;
  cycleSeconds?: number;
}

export const GameCycleIndicator: React.FC<GameCycleIndicatorProps> = React.memo(({
  isTransmitting,
  onTriggerPing,
  cycleSeconds = 30,
}) => {
  const [countdown, setCountdown] = useState(cycleSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onTriggerPing();
          return cycleSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cycleSeconds, onTriggerPing]);

  // Reset countdown if external transmit completes
  useEffect(() => {
    if (!isTransmitting) {
      setCountdown(cycleSeconds);
    }
  }, [isTransmitting, cycleSeconds]);

  return (
    <div className="bg-white/95 border-2 border-[#18181B] px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs font-heading font-bold shadow-[2px_2px_0px_#18181B]">
      <RefreshCw className={`w-3.5 h-3.5 text-[#34A853] ${isTransmitting ? 'animate-spin' : ''}`} />
      <span className="text-[#64748B]">CYCLE:</span>
      <span className="text-[#34A853] font-mono font-bold">
        {isTransmitting ? 'SYNCING...' : `${countdown}s`}
      </span>
      <button
        onClick={onTriggerPing}
        disabled={isTransmitting}
        className="ml-1 text-[10px] text-[#4285F4] hover:underline font-mono cursor-pointer"
        title="Force GPS update now"
      >
        PING NOW
      </button>
    </div>
  );
});

GameCycleIndicator.displayName = 'GameCycleIndicator';
export default GameCycleIndicator;
