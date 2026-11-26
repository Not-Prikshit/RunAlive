import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useThemeStore } from '../stores/themeStore';
import { globalInterpolationEngine, type VisualPosition } from '../lib/interpolation';
import {
  Compass,
  Navigation,
  Crosshair,
  Layers,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Undo2,
  ShieldAlert,
  Radio,
  MapPin,
  RefreshCw,
  Move,
  Maximize2,
  RotateCw,
  Check,
  AlertCircle,
  Sliders,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  role?: 'RUNNER' | 'SEEKER' | 'HOST';
  isCurrentUser?: boolean;
  lastSeenAt?: string | null;
  accuracyMeters?: number;
}

export type PerimeterShape = 'CIRCLE' | 'RECTANGLE' | 'POLYGON';

export interface MapplsMapProps {
  center: [number, number]; // [lat, lng]
  radiusMeters?: number; // Safe zone or play perimeter
  dangerZoneRadiusMeters?: number; // Shrinking danger zone
  perimeterShape?: PerimeterShape;
  polygonPoints?: Array<[number, number]>;
  onPolygonPointsChange?: (points: Array<[number, number]>) => void;
  // Rectangle interactive controls
  rectWidthMeters?: number;
  rectHeightMeters?: number;
  rectRotationDeg?: number;
  onRectangleChange?: (params: {
    widthMeters: number;
    heightMeters: number;
    rotationDeg: number;
    center: [number, number];
  }) => void;
  onCenterChange?: (center: [number, number]) => void;
  onRadiusChange?: (radiusM: number) => void;
  userPos?: [number, number] | null;
  runners?: MapMarker[];
  seekers?: MapMarker[];
  interactive?: boolean;
  editablePerimeter?: boolean;
  zoom?: number;
  showLocateButton?: boolean;
  isDrawingPolygon?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

export type TacticalMapProps = MapplsMapProps;

// Approximate distance in meters between two lat/lng coordinates (Haversine)
function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

// Convert center, dimensions, and rotation into 4 polygon vertex points
function getRotatedRectangleVertices(
  centerLat: number,
  centerLng: number,
  widthM: number,
  heightM: number,
  rotationDeg: number
): Array<[number, number]> {
  const rad = (rotationDeg * Math.PI) / 180;
  const metersToLat = 1 / 111320;
  const metersToLng = 1 / (111320 * Math.cos((centerLat * Math.PI) / 180));

  const halfW = widthM / 2;
  const halfH = heightM / 2;

  // Unrotated local offsets: [dx, dy] relative to center
  const corners: Array<[number, number]> = [
    [-halfW, halfH], // Top-Left
    [halfW, halfH], // Top-Right
    [halfW, -halfH], // Bottom-Right
    [-halfW, -halfH], // Bottom-Left
  ];

  return corners.map(([dx, dy]) => {
    // Clockwise rotation from North
    const rotX = dx * Math.cos(rad) + dy * Math.sin(rad);
    const rotY = -dx * Math.sin(rad) + dy * Math.cos(rad);
    return [centerLat + rotY * metersToLat, centerLng + rotX * metersToLng];
  });
}

// Get rotation stem handle position (North from top-center edge)
function getRotationHandlePosition(
  centerLat: number,
  centerLng: number,
  heightM: number,
  rotationDeg: number
): [number, number] {
  const rad = (rotationDeg * Math.PI) / 180;
  const metersToLat = 1 / 111320;
  const metersToLng = 1 / (111320 * Math.cos((centerLat * Math.PI) / 180));

  const stemDistM = heightM / 2 + Math.max(35, heightM * 0.15);
  const rotX = stemDistM * Math.sin(rad);
  const rotY = stemDistM * Math.cos(rad);

  return [centerLat + rotY * metersToLat, centerLng + rotX * metersToLng];
}

function buildMarkerDivIcon(
  color: string,
  label: string,
  isMe: boolean,
  isStale: boolean
): L.DivIcon {
  const markerHtml = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; opacity: ${isStale ? 0.6 : 1}; transform: translate3d(0,0,0);">
      ${
        isMe
          ? `<div style="position: absolute; top: -6px; left: -6px; width: 30px; height: 30px; border-radius: 50%; border: 2.5px solid ${color}; opacity: 0.7; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
          : ''
      }
      <div style="width: 18px; height: 18px; border-radius: 50%; background: ${color}; border: 2.5px solid #18181B; box-shadow: 2px 2px 0px #18181B; display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 900;">
        ${label.charAt(0)}
      </div>
      <div style="margin-top: 3px; padding: 2px 6px; background: #FFFFFF; border: 1.5px solid #18181B; border-radius: 6px; color: #18181B; font-family: monospace; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 1.5px 1.5px 0px #18181B;">
        ${label} ${isStale ? '⚠️' : ''}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-tactical-marker',
    html: markerHtml,
    iconSize: [70, 42],
    iconAnchor: [35, 9],
  });
}

export const MapplsMap: React.FC<MapplsMapProps> = React.memo(({
  center,
  radiusMeters = 500,
  dangerZoneRadiusMeters,
  perimeterShape = 'CIRCLE',
  polygonPoints = [],
  onPolygonPointsChange,
  rectWidthMeters = 600,
  rectHeightMeters = 600,
  rectRotationDeg = 0,
  onRectangleChange,
  onCenterChange,
  onRadiusChange,
  userPos,
  runners = [],
  seekers = [],
  interactive = true,
  editablePerimeter = false,
  zoom = 15,
  showLocateButton = true,
  isDrawingPolygon = false,
  onMapClick,
  className = 'w-full h-80 sm:h-96',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Distinct Layer Groups to isolate renders
  const perimeterGroupRef = useRef<L.LayerGroup | null>(null);
  const handlesGroupRef = useRef<L.LayerGroup | null>(null);
  const playersGroupRef = useRef<L.LayerGroup | null>(null);

  // Marker Pool: Maps player id -> L.Marker
  const markerPoolRef = useRef<
    Map<
      string,
      {
        marker: L.Marker;
        role: string;
        label: string;
        isMe: boolean;
        isStale: boolean;
      }
    >
  >(new Map());

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const { theme } = useThemeStore();

  const [mapLayer, setMapLayer] = useState<'STREET' | 'SATELLITE'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('runalive_map_layer');
      if (saved === 'STREET' || saved === 'SATELLITE') return saved;
    }
    return 'STREET';
  });

  const [gpsCountdown, setGpsCountdown] = useState<number>(30);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [liveLocation, setLiveLocation] = useState<[number, number] | null>(userPos || null);

  const [editCenter, setEditCenter] = useState<[number, number]>(center);
  const [editRadius, setEditRadius] = useState<number>(radiusMeters);
  const [editRectWidth, setEditRectWidth] = useState<number>(rectWidthMeters);
  const [editRectHeight, setEditRectHeight] = useState<number>(rectHeightMeters);
  const [editRectRotation, setEditRectRotation] = useState<number>(rectRotationDeg);

  useEffect(() => {
    setEditCenter(center);
  }, [center[0], center[1]]);

  useEffect(() => {
    setEditRadius(radiusMeters);
  }, [radiusMeters]);

  useEffect(() => {
    setEditRectWidth(rectWidthMeters);
  }, [rectWidthMeters]);

  useEffect(() => {
    setEditRectHeight(rectHeightMeters);
  }, [rectHeightMeters]);

  useEffect(() => {
    setEditRectRotation(rectRotationDeg);
  }, [rectRotationDeg]);

  useEffect(() => {
    if (userPos && userPos[0] && userPos[1]) {
      setLiveLocation(userPos);
    }
  }, [userPos]);

  const isDraggingRef = useRef<boolean>(false);
  const editCenterRef = useRef<[number, number]>(center);
  const editRadiusRef = useRef<number>(radiusMeters);
  const editRectWidthRef = useRef<number>(rectWidthMeters);
  const editRectHeightRef = useRef<number>(rectHeightMeters);
  const editRectRotationRef = useRef<number>(rectRotationDeg);

  useEffect(() => {
    editCenterRef.current = editCenter;
  }, [editCenter]);

  useEffect(() => {
    editRadiusRef.current = editRadius;
  }, [editRadius]);

  useEffect(() => {
    editRectWidthRef.current = editRectWidth;
  }, [editRectWidth]);

  useEffect(() => {
    editRectHeightRef.current = editRectHeight;
  }, [editRectHeight]);

  useEffect(() => {
    editRectRotationRef.current = editRectRotation;
  }, [editRectRotation]);

  const triggerGPSRefresh = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setLiveLocation(coords);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // 30-second GPS refresh cycle (avoids 1-second map re-renders)
  useEffect(() => {
    const timer = setInterval(() => {
      triggerGPSRefresh();
    }, 30000);

    return () => clearInterval(timer);
  }, [triggerGPSRefresh]);

  const applyTileLayer = useCallback(
    (targetMap: L.Map, layer: 'STREET' | 'SATELLITE', currentTheme: 'light' | 'dark') => {
      if (tileLayerRef.current) {
        targetMap.removeLayer(tileLayerRef.current);
        tileLayerRef.current = null;
      }

      if (layer === 'STREET') {
        const googleStreet = L.tileLayer(
          'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google',
            className: currentTheme === 'dark' ? 'dark-theme-map-tiles' : '',
          }
        ).addTo(targetMap);
        tileLayerRef.current = googleStreet;
      } else if (layer === 'SATELLITE') {
        const googleSatHybrid = L.tileLayer(
          'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google, Maxar',
          }
        ).addTo(targetMap);
        tileLayerRef.current = googleSatHybrid;
      }
    },
    []
  );

  const switchMapLayer = (layer: 'STREET' | 'SATELLITE') => {
    setMapLayer(layer);
    localStorage.setItem('runalive_map_layer', layer);
    if (mapInstanceRef.current) {
      applyTileLayer(mapInstanceRef.current, layer, theme);
    }
  };

  useEffect(() => {
    if (mapInstanceRef.current) {
      applyTileLayer(mapInstanceRef.current, mapLayer, theme);
    }
  }, [theme, mapLayer, applyTileLayer]);

  // Initialize Map Instance once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [editCenter[0] || 28.4595, editCenter[1] || 77.5135],
        zoom: zoom,
        zoomControl: false,
        attributionControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
      });

      applyTileLayer(map, mapLayer, theme);

      perimeterGroupRef.current = L.layerGroup().addTo(map);
      handlesGroupRef.current = L.layerGroup().addTo(map);
      playersGroupRef.current = L.layerGroup().addTo(map);

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onMapClickRef.current) {
          onMapClickRef.current(e.latlng.lat, e.latlng.lng);
        }
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerPoolRef.current.clear();
    };
  }, []);

  // Smooth pan when center prop changes
  useEffect(() => {
    if (mapInstanceRef.current && center && center[0] && center[1]) {
      const currentCenter = mapInstanceRef.current.getCenter();
      const dist = calculateDistanceMeters(currentCenter.lat, currentCenter.lng, center[0], center[1]);
      if (dist > 80) {
        mapInstanceRef.current.panTo([center[0], center[1]], { animate: true, duration: 0.5 });
      }
    }
  }, [center[0], center[1]]);

  // ─── 1. RENDER PERIMETER GEOMETRY & EDIT HANDLES (Isolated from markers) ──
  useEffect(() => {
    const perimeterGroup = perimeterGroupRef.current;
    const handlesGroup = handlesGroupRef.current;
    const map = mapInstanceRef.current;
    if (!perimeterGroup || !handlesGroup || !map) return;

    if (isDraggingRef.current) return;

    perimeterGroup.clearLayers();
    handlesGroup.clearLayers();

    const currentCenter = editCenter;

    // 1. CIRCLE PERIMETER
    if (perimeterShape === 'CIRCLE') {
      const safeCircle = L.circle(currentCenter, {
        radius: editRadius,
        color: '#4285F4',
        weight: 3.5,
        opacity: 0.95,
        fillColor: '#4285F4',
        fillOpacity: 0.18,
      });
      perimeterGroup.addLayer(safeCircle);

      if (editablePerimeter) {
        const metersToLng = 1 / (111320 * Math.cos((currentCenter[0] * Math.PI) / 180));

        const centerMarkerIcon = L.divIcon({
          className: 'custom-center-dragger',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: move; touch-action: none; user-select: none;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #FBBC04; border: 3px solid #18181B; box-shadow: 2.5px 2.5px 0px #18181B; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #18181B;">
                ✥
              </div>
              <div style="margin-top: 2px; padding: 2px 7px; background: #FBBC04; border: 2px solid #18181B; border-radius: 7px; color: #18181B; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 2px 2px 0px #18181B;">
                HOLD TO MOVE
              </div>
            </div>
          `,
          iconSize: [84, 58],
          iconAnchor: [42, 22],
        });

        const centerMarker = L.marker(currentCenter, { icon: centerMarkerIcon, interactive: true });
        handlesGroup.addLayer(centerMarker);

        const eastPos: [number, number] = [
          currentCenter[0],
          currentCenter[1] + editRadius * metersToLng,
        ];
        const eastIcon = L.divIcon({
          className: 'custom-axis-dragger-east',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: ew-resize; touch-action: none; user-select: none;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #4285F4; border: 3px solid #18181B; box-shadow: 2.5px 2.5px 0px #18181B; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; font-weight: 900;">
                ↔
              </div>
              <div id="axis-badge-radius-text" style="margin-top: 2px; padding: 2px 8px; background: white; border: 2px solid #18181B; border-radius: 7px; color: #18181B; font-size: 11px; font-weight: 900; white-space: nowrap; box-shadow: 2px 2px 0px #18181B;">
                ${Math.round(editRadius)}m • HOLD & DRAG
              </div>
            </div>
          `,
          iconSize: [130, 58],
          iconAnchor: [65, 22],
        });
        const eastMarker = L.marker(eastPos, { icon: eastIcon, interactive: true });
        handlesGroup.addLayer(eastMarker);

        const updateDraggers = (c: [number, number], r: number) => {
          const mLng = 1 / (111320 * Math.cos((c[0] * Math.PI) / 180));
          eastMarker.setLatLng([c[0], c[1] + r * mLng]);
          const badgeEl = document.getElementById('axis-badge-radius-text');
          if (badgeEl) badgeEl.textContent = `${Math.round(r)}m • HOLD & DRAG`;
        };

        eastMarker.on('mousedown touchstart', (startEvt: any) => {
          L.DomEvent.stopPropagation(startEvt);
          L.DomEvent.preventDefault(startEvt);
          isDraggingRef.current = true;
          map.dragging.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();

          let activeRadius = editRadiusRef.current;
          const centerPt = editCenterRef.current;

          const onMove = (moveEvt: L.LeafletMouseEvent) => {
            if (!isDraggingRef.current) return;
            const dist = calculateDistanceMeters(centerPt[0], centerPt[1], moveEvt.latlng.lat, moveEvt.latlng.lng);
            const clamped = Math.max(20, Math.min(3000, Math.round(dist)));
            activeRadius = clamped;
            safeCircle.setRadius(clamped);
            updateDraggers(centerPt, clamped);
          };

          const onEnd = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.off('mousemove touchmove', onMove as any);
            map.off('mouseup touchend', onEnd as any);

            setEditRadius(activeRadius);
            if (onRadiusChange) onRadiusChange(activeRadius);
          };

          map.on('mousemove touchmove', onMove as any);
          map.on('mouseup touchend', onEnd as any);
        });

        const bindMoveDragger = (targetLayer: L.Layer) => {
          targetLayer.on('mousedown touchstart', (startEvt: any) => {
            L.DomEvent.stopPropagation(startEvt);
            L.DomEvent.preventDefault(startEvt);
            isDraggingRef.current = true;
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();

            const startCenter: [number, number] = [editCenterRef.current[0], editCenterRef.current[1]];
            const startLatLng = startEvt.latlng;
            let activeCenter: [number, number] = [startCenter[0], startCenter[1]];

            const onMove = (moveEvt: L.LeafletMouseEvent) => {
              if (!isDraggingRef.current || !startLatLng) return;
              const dLat = moveEvt.latlng.lat - startLatLng.lat;
              const dLng = moveEvt.latlng.lng - startLatLng.lng;
              activeCenter = [
                Number((startCenter[0] + dLat).toFixed(6)),
                Number((startCenter[1] + dLng).toFixed(6)),
              ];
              safeCircle.setLatLng(activeCenter);
              centerMarker.setLatLng(activeCenter);
              updateDraggers(activeCenter, editRadiusRef.current);
            };

            const onEnd = () => {
              if (!isDraggingRef.current) return;
              isDraggingRef.current = false;
              map.dragging.enable();
              map.touchZoom.enable();
              map.doubleClickZoom.enable();
              map.off('mousemove touchmove', onMove as any);
              map.off('mouseup touchend', onEnd as any);

              setEditCenter(activeCenter);
              if (onCenterChange) onCenterChange(activeCenter);
            };

            map.on('mousemove touchmove', onMove as any);
            map.on('mouseup touchend', onEnd as any);
          });
        };

        bindMoveDragger(centerMarker);
        bindMoveDragger(safeCircle);

        setTimeout(() => {
          const path = (safeCircle as any)._path as SVGElement | undefined;
          if (path) path.style.cursor = 'grab';
        }, 10);
      }
    }

    // 2. RECTANGLE PERIMETER
    else if (perimeterShape === 'RECTANGLE') {
      let activeCenter: [number, number] = [currentCenter[0], currentCenter[1]];
      let activeWidth = editRectWidthRef.current;
      let activeHeight = editRectHeightRef.current;
      let activeRotation = editRectRotationRef.current;

      const initialVerts = getRotatedRectangleVertices(
        activeCenter[0],
        activeCenter[1],
        activeWidth,
        activeHeight,
        activeRotation
      );

      const rectPoly = L.polygon(initialVerts, {
        color: '#FBBC04',
        weight: 3.5,
        opacity: 0.95,
        fillColor: '#FBBC04',
        fillOpacity: 0.18,
      });
      perimeterGroup.addLayer(rectPoly);

      if (editablePerimeter) {
        // Center Anchor Dragger (Hold to Move Box)
        const centerMarkerIcon = L.divIcon({
          className: 'custom-center-anchor',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: move; touch-action: none; user-select: none;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #FBBC04; border: 3px solid #18181B; box-shadow: 2.5px 2.5px 0px #18181B; display: flex; align-items: center; justify-content: center;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #18181B;"></div>
              </div>
              <div style="margin-top: 2px; padding: 2px 7px; background: #FBBC04; border: 2px solid #18181B; border-radius: 7px; color: #18181B; font-size: 10px; font-weight: 900; white-space: nowrap; box-shadow: 2px 2px 0px #18181B;">MOVE BOX</div>
            </div>
          `,
          iconSize: [84, 56],
          iconAnchor: [42, 18],
        });

        const centerMarker = L.marker(activeCenter, {
          icon: centerMarkerIcon,
          interactive: true,
        });
        handlesGroup.addLayer(centerMarker);

        // 4 Corner Resize Handles
        const cornerMarkers: L.Marker[] = initialVerts.map((cornerPos) => {
          const cornerIcon = L.divIcon({
            className: 'custom-corner-handle',
            html: `
              <div style="width: 30px; height: 30px; border-radius: 8px; background: #FFFFFF; border: 2.5px solid #18181B; box-shadow: 2px 2px 0px #18181B; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; cursor: nwse-resize; touch-action: none; user-select: none;">
                +
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          const cm = L.marker(cornerPos, { icon: cornerIcon, interactive: true });
          handlesGroup.addLayer(cm);
          return cm;
        });

        // Rotation Handle Stem & Marker
        const initialRotPos = getRotationHandlePosition(
          activeCenter[0],
          activeCenter[1],
          activeHeight,
          activeRotation
        );

        const stemLine = L.polyline([activeCenter, initialRotPos], {
          color: '#FBBC04',
          weight: 2,
          dashArray: '4, 4',
          opacity: 0.8,
        });
        handlesGroup.addLayer(stemLine);

        const rotHandleIcon = L.divIcon({
          className: 'custom-rotation-handle',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: grab; touch-action: none; user-select: none;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #FBBC04; border: 2.5px solid #18181B; box-shadow: 2px 2px 0px #18181B; display: flex; align-items: center; justify-content: center; color: #18181B; font-size: 14px; font-weight: 900;">
                ↻
              </div>
              <div id="rect-rotation-angle-badge" style="margin-top: 2px; padding: 2px 6px; background: #FEF7E0; border: 1.5px solid #18181B; border-radius: 6px; color: #18181B; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 1.5px 1.5px 0px #18181B;">
                ${Math.round(activeRotation)}°
              </div>
            </div>
          `,
          iconSize: [64, 48],
          iconAnchor: [32, 16],
        });

        const rotMarker = L.marker(initialRotPos, { icon: rotHandleIcon, interactive: true });
        handlesGroup.addLayer(rotMarker);

        // Helper to update all Leaflet layers synchronously during drag without React state thrash
        const syncRectangleLayers = (
          c: [number, number],
          w: number,
          h: number,
          rot: number
        ) => {
          const updatedVerts = getRotatedRectangleVertices(c[0], c[1], w, h, rot);
          rectPoly.setLatLngs(updatedVerts);
          centerMarker.setLatLng(c);
          updatedVerts.forEach((v, i) => {
            if (cornerMarkers[i]) cornerMarkers[i].setLatLng(v);
          });
          const rotPos = getRotationHandlePosition(c[0], c[1], h, rot);
          stemLine.setLatLngs([c, rotPos]);
          rotMarker.setLatLng(rotPos);
          const badgeEl = document.getElementById('rect-rotation-angle-badge');
          if (badgeEl) badgeEl.textContent = `${Math.round(rot)}°`;
        };

        // ─── A. HOLD & MOVE HANDLER (Center Marker & Rectangle Body) ────────
        const bindMoveHandler = (layer: L.Layer) => {
          layer.on('mousedown touchstart', (startEvt: any) => {
            L.DomEvent.stopPropagation(startEvt);
            L.DomEvent.preventDefault(startEvt);
            isDraggingRef.current = true;
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();

            const startCenterPt: [number, number] = [activeCenter[0], activeCenter[1]];
            const startLatLng = startEvt.latlng;

            const onMove = (moveEvt: L.LeafletMouseEvent) => {
              if (!isDraggingRef.current || !startLatLng) return;
              const dLat = moveEvt.latlng.lat - startLatLng.lat;
              const dLng = moveEvt.latlng.lng - startLatLng.lng;
              activeCenter = [
                Number((startCenterPt[0] + dLat).toFixed(6)),
                Number((startCenterPt[1] + dLng).toFixed(6)),
              ];
              syncRectangleLayers(activeCenter, activeWidth, activeHeight, activeRotation);
            };

            const onEnd = () => {
              if (!isDraggingRef.current) return;
              isDraggingRef.current = false;
              map.dragging.enable();
              map.touchZoom.enable();
              map.doubleClickZoom.enable();
              map.off('mousemove touchmove', onMove as any);
              map.off('mouseup touchend', onEnd as any);

              setEditCenter(activeCenter);
              if (onRectangleChange) {
                onRectangleChange({
                  widthMeters: activeWidth,
                  heightMeters: activeHeight,
                  rotationDeg: activeRotation,
                  center: activeCenter,
                });
              }
              if (onCenterChange) onCenterChange(activeCenter);
            };

            map.on('mousemove touchmove', onMove as any);
            map.on('mouseup touchend', onEnd as any);
          });
        };

        bindMoveHandler(centerMarker);
        bindMoveHandler(rectPoly);

        // ─── B. CORNER RESIZE HANDLERS (4 Corners) ──────────────────────────
        cornerMarkers.forEach((cm) => {
          cm.on('mousedown touchstart', (startEvt: any) => {
            L.DomEvent.stopPropagation(startEvt);
            L.DomEvent.preventDefault(startEvt);
            isDraggingRef.current = true;
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();

            const onMove = (moveEvt: L.LeafletMouseEvent) => {
              if (!isDraggingRef.current) return;
              const dist = calculateDistanceMeters(
                activeCenter[0],
                activeCenter[1],
                moveEvt.latlng.lat,
                moveEvt.latlng.lng
              );
              const newSide = Math.max(40, Math.min(3000, Math.round(dist * Math.SQRT2)));
              activeWidth = newSide;
              activeHeight = newSide;
              syncRectangleLayers(activeCenter, activeWidth, activeHeight, activeRotation);
            };

            const onEnd = () => {
              if (!isDraggingRef.current) return;
              isDraggingRef.current = false;
              map.dragging.enable();
              map.touchZoom.enable();
              map.doubleClickZoom.enable();
              map.off('mousemove touchmove', onMove as any);
              map.off('mouseup touchend', onEnd as any);

              setEditRectWidth(activeWidth);
              setEditRectHeight(activeHeight);
              if (onRectangleChange) {
                onRectangleChange({
                  widthMeters: activeWidth,
                  heightMeters: activeHeight,
                  rotationDeg: activeRotation,
                  center: activeCenter,
                });
              }
            };

            map.on('mousemove touchmove', onMove as any);
            map.on('mouseup touchend', onEnd as any);
          });
        });

        // ─── C. ROTATION DRAGGER (↻ Handle) ─────────────────────────────────
        rotMarker.on('mousedown touchstart', (startEvt: any) => {
          L.DomEvent.stopPropagation(startEvt);
          L.DomEvent.preventDefault(startEvt);
          isDraggingRef.current = true;
          map.dragging.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();

          const metersToLat = 1 / 111320;
          const metersToLng = 1 / (111320 * Math.cos((activeCenter[0] * Math.PI) / 180));

          const onMove = (moveEvt: L.LeafletMouseEvent) => {
            if (!isDraggingRef.current) return;
            const dLatM = (moveEvt.latlng.lat - activeCenter[0]) / metersToLat;
            const dLngM = (moveEvt.latlng.lng - activeCenter[1]) / metersToLng;
            let angle = Math.atan2(dLngM, dLatM) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            activeRotation = Math.round(angle);
            syncRectangleLayers(activeCenter, activeWidth, activeHeight, activeRotation);
          };

          const onEnd = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.off('mousemove touchmove', onMove as any);
            map.off('mouseup touchend', onEnd as any);

            setEditRectRotation(activeRotation);
            if (onRectangleChange) {
              onRectangleChange({
                widthMeters: activeWidth,
                heightMeters: activeHeight,
                rotationDeg: activeRotation,
                center: activeCenter,
              });
            }
          };

          map.on('mousemove touchmove', onMove as any);
          map.on('mouseup touchend', onEnd as any);
        });

        setTimeout(() => {
          const path = (rectPoly as any)._path as SVGElement | undefined;
          if (path) path.style.cursor = 'grab';
        }, 10);
      }
    }

    // 3. POLYGON PERIMETER
    else if (perimeterShape === 'POLYGON' && polygonPoints.length > 0) {
      const poly = L.polygon(polygonPoints, {
        color: '#EA4335',
        weight: 3.5,
        opacity: 0.95,
        fillColor: '#EA4335',
        fillOpacity: 0.2,
      });
      perimeterGroup.addLayer(poly);

      if (editablePerimeter && polygonPoints.length >= 3) {
        let isDraggingPoly = false;
        let dragStartLatLng: L.LatLng | null = null;
        let startPoints: Array<[number, number]> = [...polygonPoints];

        poly.on('mousedown touchstart', (e: any) => {
          L.DomEvent.stopPropagation(e);
          map.dragging.disable();
          isDraggingPoly = true;
          dragStartLatLng = e.latlng;
          startPoints = [...polygonPoints];

          const onDragMove = (moveEvt: L.LeafletMouseEvent) => {
            if (!isDraggingPoly || !dragStartLatLng) return;
            const dLat = moveEvt.latlng.lat - dragStartLatLng.lat;
            const dLng = moveEvt.latlng.lng - dragStartLatLng.lng;
            const shiftedPoints: Array<[number, number]> = startPoints.map(([pLat, pLng]) => [
              Number((pLat + dLat).toFixed(6)),
              Number((pLng + dLng).toFixed(6)),
            ]);
            if (onPolygonPointsChange) {
              onPolygonPointsChange(shiftedPoints);
            }
          };

          const onDragEnd = () => {
            if (!isDraggingPoly) return;
            isDraggingPoly = false;
            dragStartLatLng = null;
            map.dragging.enable();
            map.off('mousemove touchmove', onDragMove as any);
            map.off('mouseup touchend', onDragEnd as any);
          };

          map.on('mousemove touchmove', onDragMove as any);
          map.on('mouseup touchend', onDragEnd as any);
        });
      }

      polygonPoints.forEach((pt, idx) => {
        const vertexIcon = L.divIcon({
          className: 'custom-polygon-vertex',
          html: `
            <div style="width: 30px; height: 30px; border-radius: 50%; background: ${idx === 0 ? '#FBBC04' : '#EA4335'}; border: 2.5px solid #18181B; color: ${idx === 0 ? '#18181B' : '#FFFFFF'}; font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 0px #18181B; cursor: move; touch-action: none; user-select: none;">
              ${idx + 1}
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const vertexMarker = L.marker(pt, { icon: vertexIcon, draggable: editablePerimeter });
        if (editablePerimeter) {
          vertexMarker.on('mousedown touchstart', () => {
            isDraggingRef.current = true;
            map.dragging.disable();
          });
          vertexMarker.on('mouseup touchend dragend', () => {
            isDraggingRef.current = false;
            map.dragging.enable();
          });
          vertexMarker.on('drag', (e: any) => {
            const latlng = e.latlng;
            const updatedPoints = [...polygonPoints];
            updatedPoints[idx] = [latlng.lat, latlng.lng];
            if (onPolygonPointsChange) {
              onPolygonPointsChange(updatedPoints);
            }
          });
        }
        handlesGroup.addLayer(vertexMarker);
      });
    }

    // 4. SHRINK RING
    if (dangerZoneRadiusMeters && dangerZoneRadiusMeters < radiusMeters) {
      const dangerCircle = L.circle(currentCenter, {
        radius: dangerZoneRadiusMeters,
        color: '#EA4335',
        weight: 2.5,
        dashArray: '6, 6',
        opacity: 0.9,
        fillColor: '#EA4335',
        fillOpacity: 0.08,
      });
      perimeterGroup.addLayer(dangerCircle);
    }
  }, [
    editCenter,
    editRadius,
    editRectWidth,
    editRectHeight,
    editRectRotation,
    perimeterShape,
    polygonPoints,
    dangerZoneRadiusMeters,
    editablePerimeter,
  ]);

  // ─── 2. HIGH-PERFORMANCE PLAYER MARKER POOL & SMOOTH POSITION LERP ────────
  useEffect(() => {
    const playersGroup = playersGroupRef.current;
    if (!playersGroup) return;

    // Build desired player set from props
    const allExpectedMarkers = new Map<string, MapMarker>();

    seekers.forEach((s) => allExpectedMarkers.set(s.id, { ...s, role: 'SEEKER' }));
    runners.forEach((r) => allExpectedMarkers.set(r.id, { ...r, role: 'RUNNER' }));

    if (liveLocation && liveLocation[0] && liveLocation[1]) {
      allExpectedMarkers.set('me', {
        id: 'me',
        lat: liveLocation[0],
        lng: liveLocation[1],
        label: 'YOU (LIVE GPS)',
        role: 'RUNNER',
        isCurrentUser: true,
        lastSeenAt: new Date().toISOString(),
      });
    }

    // Feed authoritative coordinates into Interpolation Engine
    allExpectedMarkers.forEach((m) => {
      globalInterpolationEngine.updatePlayer(m.id, m.lat, m.lng);
    });

    // Remove any markers for players that have left
    markerPoolRef.current.forEach((item, id) => {
      if (!allExpectedMarkers.has(id)) {
        playersGroup.removeLayer(item.marker);
        markerPoolRef.current.delete(id);
        globalInterpolationEngine.removePlayer(id);
      }
    });

    // Instantiate markers once for any newly joined players
    allExpectedMarkers.forEach((m, id) => {
      const existing = markerPoolRef.current.get(id);
      const isMe = !!m.isCurrentUser;
      const isSeeker = m.role === 'SEEKER';
      const color = isMe ? '#4285F4' : isSeeker ? '#EA4335' : '#34A853';
      const label = m.label || (isMe ? 'YOU' : isSeeker ? 'SEEKER' : 'HIDER');

      const isStale =
        !isMe &&
        !!m.lastSeenAt &&
        Date.now() - new Date(m.lastSeenAt).getTime() > 45_000;

      if (!existing) {
        const icon = buildMarkerDivIcon(color, label, isMe, isStale);
        const marker = L.marker([m.lat, m.lng], { icon });
        playersGroup.addLayer(marker);

        markerPoolRef.current.set(id, {
          marker,
          role: m.role || 'RUNNER',
          label,
          isMe,
          isStale,
        });
      } else {
        // If role or label changed, update icon
        if (existing.role !== m.role || existing.label !== label || existing.isStale !== isStale) {
          existing.role = m.role || 'RUNNER';
          existing.label = label;
          existing.isStale = isStale;
          existing.marker.setIcon(buildMarkerDivIcon(color, label, isMe, isStale));
        }
      }
    });
  }, [runners, seekers, liveLocation]);

  // Subscribe to Interpolation Engine for Smooth Marker Updates
  useEffect(() => {
    const unsubscribe = globalInterpolationEngine.subscribe((positions: Map<string, VisualPosition>) => {
      positions.forEach((pos, id) => {
        const item = markerPoolRef.current.get(id);
        if (item) {
          const cur = item.marker.getLatLng();
          if (Math.abs(cur.lat - pos.lat) > 0.000003 || Math.abs(cur.lng - pos.lng) > 0.000003) {
            item.marker.setLatLng([pos.lat, pos.lng]);
          }
        }
      });
    });

    return unsubscribe;
  }, []);

  const recenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([editCenter[0], editCenter[1]], zoom, { duration: 0.6 });
    }
  };

  const locateUser = () => {
    triggerGPSRefresh();
    if (liveLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([liveLocation[0], liveLocation[1]], 16, { duration: 0.6 });
    }
  };

  const resetRotation = () => {
    setEditRectRotation(0);
    if (onRectangleChange) {
      onRectangleChange({
        widthMeters: editRectWidth,
        heightMeters: editRectHeight,
        rotationDeg: 0,
        center: editCenter,
      });
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-[#18181B] dark:border-[#475569] bg-white dark:bg-[#0F172A] select-none shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] ${className}`}
    >
      {/* Real Geographic Map Container (Leaflet) */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px]" />

      {/* Top Floating HUD Status Bar & Layer Switcher */}
      <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0">
          <div className="flex items-center space-x-1.5 sm:space-x-2 bg-white/95 dark:bg-[#1E293B]/95 border-2 border-[#0F172A] dark:border-[#475569] px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-heading font-black shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] max-w-[150px] sm:max-w-none truncate">
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#10B981] animate-pulse border border-[#0F172A] shrink-0" />
            <span className="text-[#2563EB] dark:text-[#93C5FD] hidden sm:inline shrink-0">
              {mapLayer === 'SATELLITE' ? 'SATELLITE HYBRID:' : theme === 'dark' ? 'DARK STREET RADAR:' : 'GOOGLE STREETS:'}
            </span>
            <span className="text-[#0F172A] dark:text-white font-mono font-bold truncate">
              {liveLocation ? `${liveLocation[0].toFixed(3)}°, ${liveLocation[1].toFixed(3)}°` : 'LOCATING...'}
            </span>
          </div>

          {/* 30s Countdown Chip */}
          <div className="hidden md:flex items-center space-x-1.5 bg-white/95 dark:bg-[#1E293B]/95 border-2 border-[#0F172A] dark:border-[#475569] px-2.5 py-1.5 rounded-xl text-[11px] font-mono shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617] text-[#475569] dark:text-[#94A3B8]">
            <Radio className="w-3.5 h-3.5 text-[#10B981] animate-pulse" />
            <span>GPS PING:</span>
            <span className="font-bold text-[#0F172A] dark:text-white">{gpsCountdown}s</span>
          </div>
        </div>

        {/* Top Right Map Layer Switcher */}
        <div className="flex items-center space-x-1 bg-white/95 dark:bg-[#1E293B]/95 border-2 border-[#0F172A] dark:border-[#475569] p-1 rounded-xl shadow-[2.5px_2.5px_0px_#0F172A] dark:shadow-[2.5px_2.5px_0px_#020617] pointer-events-auto shrink-0">
          <button
            onClick={() => switchMapLayer('STREET')}
            type="button"
            title="Street Map (Adapts dynamically to Light & Dark themes)"
            className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-heading font-black transition cursor-pointer ${
              mapLayer === 'STREET'
                ? 'bg-[#2563EB] text-white border border-[#0F172A] shadow-[1px_1px_0px_#0F172A]'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
            }`}
          >
            {theme === 'dark' ? 'Street (Dark)' : 'Street'}
          </button>
          <button
            onClick={() => switchMapLayer('SATELLITE')}
            type="button"
            title="High-Resolution Photorealistic Satellite Imagery with Street Labels"
            className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-heading font-black transition cursor-pointer ${
              mapLayer === 'SATELLITE'
                ? 'bg-[#10B981] text-white border border-[#0F172A] shadow-[1px_1px_0px_#0F172A]'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
            }`}
          >
            Satellite
          </button>
        </div>
      </div>

      {/* Floating Controls */}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col space-y-2 pointer-events-auto">
        {perimeterShape === 'RECTANGLE' && editablePerimeter && editRectRotation !== 0 && (
          <button
            onClick={resetRotation}
            type="button"
            className="p-2.5 bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] hover:bg-[#FEF7E0] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer text-[#B45309]"
            title="Reset Rectangle Rotation to 0°"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

        {showLocateButton && (
          <button
            onClick={locateUser}
            type="button"
            className="p-2.5 bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] hover:bg-[#E8F0FE] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer text-[#4285F4]"
            title="Snap to Live GPS Location"
          >
            <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
          </button>
        )}

        <button
          onClick={recenter}
          type="button"
          className="p-2.5 bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] rounded-xl shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] hover:bg-[#F1F5F9] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer text-[#0F172A] dark:text-white"
          title="Recenter Arena"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

MapplsMap.displayName = 'MapplsMap';
export const TacticalMap = MapplsMap;
export default MapplsMap;
