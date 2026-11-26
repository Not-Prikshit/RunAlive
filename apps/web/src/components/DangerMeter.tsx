import React from 'react';
import { DangerBand } from '@runalive/shared';
import { Radio } from 'lucide-react';

interface DangerMeterProps {
  band: DangerBand;
  level: number; // 0 - 100
  distance?: number;
}

export const DangerMeter: React.FC<DangerMeterProps> = React.memo(({ band, level }) => {
  const getBandConfig = (b: DangerBand) => {
    switch (b) {
      case DangerBand.CRITICAL:
        return {
          color: '#EA4335',
          bg: '#FCE8E6',
          border: '#EA4335',
          label: 'CRITICAL HAZARD // SEEKER ADJACENT!',
          desc: 'DISTANCE < 50M • SEEK COVER IMMEDIATELY!',
          bars: 5,
        };
      case DangerBand.HIGH:
        return {
          color: '#FA7B17',
          bg: '#FEEFE3',
          border: '#FA7B17',
          label: 'HIGH THREAT // PURSUIT VECTOR ENGAGED',
          desc: 'DISTANCE 50M - 100M • DANGER ZONE CLOSING',
          bars: 4,
        };
      case DangerBand.MEDIUM:
        return {
          color: '#FBBC04',
          bg: '#FEF7E0',
          border: '#FBBC04',
          label: 'ELEVATED RADAR // SEEKER IN SECTOR',
          desc: 'DISTANCE 100M - 150M • EXERCISE CAUTION',
          bars: 3,
        };
      case DangerBand.LOW:
        return {
          color: '#4285F4',
          bg: '#E8F0FE',
          border: '#4285F4',
          label: 'PERIPHERAL TRACE // LOW RISK',
          desc: 'DISTANCE 150M - 300M • MAINTAIN POSITION',
          bars: 2,
        };
      case DangerBand.SAFE:
      default:
        return {
          color: '#34A853',
          bg: '#E6F4EA',
          border: '#34A853',
          label: 'ALL CLEAR // SECTOR SECURE',
          desc: 'DISTANCE > 300M • ZERO THREAT DETECTED',
          bars: 1,
        };
    }
  };

  const config = getBandConfig(band);

  return (
    <div
      className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-4 sm:p-5 shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] transition-all relative overflow-hidden"
      style={{ borderLeftColor: config.color, borderLeftWidth: '6px' }}
    >
      {/* Top Threat Indicator Header */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-[#CBD5E1] dark:border-[#334155] pb-2.5 mb-3">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 animate-pulse" style={{ color: config.color }} />
          <span className="text-xs font-heading font-black uppercase tracking-wider text-[#18181B] dark:text-white">
            PROXIMITY DANGER RADAR
          </span>
        </div>
        <div className="text-xs font-mono font-bold text-[#64748B] dark:text-[#94A3B8]">
          THREAT LEVEL:{' '}
          <span className="font-heading font-black text-sm" style={{ color: config.color }}>
            {Math.round(level)}%
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div
            className="text-xs sm:text-sm font-heading font-black uppercase tracking-tight"
            style={{ color: config.color }}
          >
            {config.label}
          </div>
          <span className="text-[10px] font-mono text-[#64748B] hidden sm:inline">{config.desc}</span>
        </div>

        {/* 5-Step Comic Threat Meter Bars */}
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((bar) => {
            const isActive = bar <= config.bars;
            return (
              <div
                key={bar}
                className="h-3 rounded-md border-2 border-[#18181B] transition-all duration-300"
                style={{
                  backgroundColor: isActive ? config.color : '#FAF8F5',
                  boxShadow: isActive ? '1px 1px 0px #18181B' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

DangerMeter.displayName = 'DangerMeter';
export default DangerMeter;
