import React from 'react';

interface RunAliveLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  animated?: boolean;
}

export const RunAliveLogo: React.FC<RunAliveLogoProps> = React.memo(({
  className = '',
  size = 'md',
  showText = true,
  animated = true,
}) => {
  // Dimensions per size
  const dimensions = {
    sm: { img: 'h-8 sm:h-9 w-auto', text: 'text-lg', stamp: 'text-[9px]' },
    md: { img: 'h-10 sm:h-12 w-auto', text: 'text-xl sm:text-2xl', stamp: 'text-[10px]' },
    lg: { img: 'h-14 sm:h-16 w-auto', text: 'text-2xl sm:text-3xl', stamp: 'text-xs' },
    xl: { img: 'h-20 sm:h-24 w-auto', text: 'text-3xl sm:text-4xl', stamp: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center space-x-2 sm:space-x-3 select-none group cursor-pointer ${className}`}>
      {/* Clean Runner Character (runalive_logo.png) - No Enclosing Box Container */}
      <div className="relative shrink-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-2 active:translate-x-0.5 active:translate-y-0.5">
        <img
          src="/runalive_logo.png"
          alt="RunAlive Runner"
          className={`${dimensions.img} object-contain transition-transform duration-200 drop-shadow-sm`}
        />

        {/* Live GPS Green Pulse Beacon on the Runner */}
        {animated && (
          <>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10B981] border border-[#0F172A] rounded-full animate-ping pointer-events-none" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10B981] border border-[#0F172A] rounded-full pointer-events-none" />
          </>
        )}
      </div>

      {/* Typography with Matching Yellow for ALIVE */}
      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <span
              className={`font-heading font-black tracking-tight ${dimensions.text} text-[#0F172A] dark:text-[#F8FAFC]`}
            >
              RUN<span className="text-[#FBBC04] dark:text-[#FDE047]">ALIVE</span>
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest text-[#2563EB] dark:text-[#93C5FD] uppercase">
            GPS Multi-Tag
          </span>
        </div>
      )}
    </div>
  );
});

RunAliveLogo.displayName = 'RunAliveLogo';
export default RunAliveLogo;
