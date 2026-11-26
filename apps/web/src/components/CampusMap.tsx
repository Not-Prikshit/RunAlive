import React from 'react';
import { TacticalMap, type MapMarker } from './TacticalMap';

interface CampusMapProps {
  center: [number, number];
  radiusMeters: number;
  userPos: [number, number] | null;
  runners?: Array<{ id: string; lat: number; lng: number; label?: string }>;
  seekers?: Array<{ id: string; lat: number; lng: number; label?: string }>;
}

export const CampusMap: React.FC<CampusMapProps> = ({
  center,
  radiusMeters,
  userPos,
  runners = [],
  seekers = [],
}) => {
  const runnerMarkers: MapMarker[] = runners.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    label: r.label,
    role: 'RUNNER',
  }));

  const seekerMarkers: MapMarker[] = seekers.map((s) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    label: s.label,
    role: 'SEEKER',
  }));

  return (
    <TacticalMap
      center={userPos || center}
      radiusMeters={radiusMeters}
      userPos={userPos}
      runners={runnerMarkers}
      seekers={seekerMarkers}
      className="w-full h-80 sm:h-96"
    />
  );
};
