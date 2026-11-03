// apps/mobile/src/components/PerimeterEditor.tsx
// Interactive circular perimeter editor with draggable center, radius slider, and current GPS locator.

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { COLORS, SPACING, RADIUS } from '@/design/tokens';

export interface PerimeterValue {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusM: number;
}

export interface PerimeterEditorProps {
  initialCenter?: { latitude: number; longitude: number };
  initialRadiusM?: number;
  onChange?: (value: PerimeterValue) => void;
  readOnly?: boolean;
}

const DEFAULT_CENTER = {
  latitude: 37.7749,
  longitude: -122.4194,
};
const DEFAULT_RADIUS = 300; // 300 meters

export function PerimeterEditor({
  initialCenter = DEFAULT_CENTER,
  initialRadiusM = DEFAULT_RADIUS,
  onChange,
  readOnly = false,
}: PerimeterEditorProps) {
  const [center, setCenter] = useState(initialCenter);
  const [radiusM, setRadiusM] = useState(initialRadiusM);
  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    onChange?.({ center, radiusM });
  }, [center, radiusM, onChange]);

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const newCenter = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setCenter(newCenter);

      mapRef.current?.animateToRegion(
        {
          latitude: newCenter.latitude,
          longitude: newCenter.longitude,
          latitudeDelta: (radiusM / 111320) * 3,
          longitudeDelta: (radiusM / 111320) * 3,
        },
        500
      );
    } catch {
      // Best-effort
    } finally {
      setIsLocating(false);
    }
  };

  const adjustRadius = (delta: number) => {
    setRadiusM((prev) => Math.max(50, Math.min(5000, prev + delta)));
  };

  const initialRegion: Region = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: (radiusM / 111320) * 3.5,
    longitudeDelta: (radiusM / 111320) * 3.5,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Perimeter Circle */}
        <Circle
          center={center}
          radius={radiusM}
          strokeColor={COLORS.danger}
          strokeWidth={3}
          fillColor="rgba(255, 59, 48, 0.18)"
        />

        {/* Draggable Zone Center Marker */}
        <Marker
          coordinate={center}
          draggable={!readOnly}
          onDragEnd={(e) => {
            if (!readOnly) {
              setCenter(e.nativeEvent.coordinate);
            }
          }}
          title="Zone Center"
          description={readOnly ? 'Active Boundary' : 'Hold & drag to reposition center'}
          pinColor={COLORS.danger}
        />
      </MapView>

      {/* Overlay Information Bar */}
      <View style={styles.infoBar}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Zone Radius:</Text>
          <Text style={styles.infoValue}>{Math.round(radiusM)} meters</Text>
        </View>
        <Text style={styles.coordText}>
          {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
        </Text>
      </View>

      {/* Editor Controls (hidden if readOnly) */}
      {!readOnly ? (
        <View style={styles.controls}>
          <View style={styles.radiusButtonRow}>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => adjustRadius(-50)}
              activeOpacity={0.7}
            >
              <Text style={styles.radiusBtnText}>-50m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => adjustRadius(-10)}
              activeOpacity={0.7}
            >
              <Text style={styles.radiusBtnText}>-10m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => adjustRadius(+10)}
              activeOpacity={0.7}
            >
              <Text style={styles.radiusBtnText}>+10m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => adjustRadius(+50)}
              activeOpacity={0.7}
            >
              <Text style={styles.radiusBtnText}>+50m</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.locateBtn}
            onPress={() => void handleUseCurrentLocation()}
            disabled={isLocating}
            activeOpacity={0.8}
          >
            <Text style={styles.locateBtnText}>
              {isLocating ? 'Locating GPS…' : '📍 Center at My Location'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 380,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  infoBar: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: 'rgba(10, 15, 29, 0.85)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  coordText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  controls: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
  },
  radiusButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  radiusBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },
  radiusBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  locateBtn: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  locateBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
