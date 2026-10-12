import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors, ProvenanceBadge } from './ui';

export type ViewerMode = 'PHOTOS' | 'RAW' | 'BBOX' | 'DEFECTS' | 'ENVELOPE' | 'DRESSING' | 'FINAL';

interface Mobile3DViewerProps {
  points?: Array<[number, number, number]> | null;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  dressedL?: number;
  dressedB?: number;
  dressedH?: number;
  observedSurfaces?: string[];
  defects?: Array<{
    kind: string;
    surface: string;
    bbox?: number[];
    affected_length_cm?: number;
  }>;
  cuttingSteps?: Array<{
    step_number: number;
    cut_name: string;
    plane_axis: string;
    position_cm: number;
    position_m: number;
    removed_volume_m3: number;
    waste_category: string;
    reason: string;
  }>;
  activeStep?: number;
  onStepChange?: (step: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function Mobile3DViewer({
  points,
  lengthCm = 285,
  breadthCm = 165,
  heightCm = 135,
  dressedL = 270,
  dressedB = 150,
  dressedH = 120,
  observedSurfaces = ['FRONT', 'LEFT', 'RIGHT', 'BACK', 'TOP'],
  defects = [],
  cuttingSteps = [],
  activeStep = 0,
  onStepChange,
  style,
}: Mobile3DViewerProps) {
  const [mode, setMode] = useState<ViewerMode>('RAW');
  const [rotX, setRotX] = useState<number>(-0.45);
  const [rotY, setRotY] = useState<number>(0.65);
  const [zoom, setZoom] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

  // Drag handling via PanResponder
  const lastRot = useRef<{ x: number; y: number }>({ x: -0.45, y: 0.65 });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          lastRot.current = { x: rotX, y: rotY };
        },
        onPanResponderMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          setRotY(lastRot.current.y + gestureState.dx * 0.012);
          setRotX(Math.max(-1.4, Math.min(1.4, lastRot.current.x - gestureState.dy * 0.012)));
        },
      }),
    [rotX, rotY]
  );

  // Auto-rotation ticker
  useEffect(() => {
    if (!autoRotate) return;
    const interval = setInterval(() => {
      setRotY((prev) => prev + 0.015);
    }, 30);
    return () => clearInterval(interval);
  }, [autoRotate]);

  // Genuine point cloud strictly from photogrammetric reconstruction
  const activePoints = useMemo(() => {
    return points || [];
  }, [points]);

  // Project a 3D coordinate [x, y, z] to 2D screen coordinate [u, v]
  const project = (x: number, y: number, z: number, viewW = 320, viewH = 260): { u: number; v: number; depth: number } => {
    // Rotation around Y
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;

    // Rotation around X
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const baseScale = Math.min(viewW, viewH) / (Math.max(lengthCm, breadthCm, heightCm) * 1.6);
    const finalScale = baseScale * zoom;

    const distance = 800;
    const fov = distance / (distance + z2);

    const u = viewW / 2 + x1 * finalScale * fov;
    const v = viewH / 2 - y2 * finalScale * fov;

    return { u, v, depth: z2 };
  };

  // 8 corners of raw bounding box
  const hl = lengthCm / 2;
  const hb = breadthCm / 2;
  const hh = heightCm / 2;

  // 8 corners of dressed cuboid
  const dhl = dressedL / 2;
  const dhb = dressedB / 2;
  const dhh = dressedH / 2;

  const rawCorners = [
    [-hl, -hb, -hh], [hl, -hb, -hh], [hl, hb, -hh], [-hl, hb, -hh],
    [-hl, -hb, hh], [hl, -hb, hh], [hl, hb, hh], [-hl, hb, hh],
  ];

  const dressedCorners = [
    [-dhl, -dhb, -dhh], [dhl, -dhb, -dhh], [dhl, dhb, -dhh], [-dhl, dhb, -dhh],
    [-dhl, -dhb, dhh], [dhl, -dhb, dhh], [dhl, dhb, dhh], [-dhl, dhb, dhh],
  ];

  // Projected corner points
  const rawProjected = rawCorners.map(([x, y, z]) => project(x, y, z));
  const dressedProjected = dressedCorners.map(([x, y, z]) => project(x, y, z));

  // Subsample points for smooth performance
  const sampledPoints = useMemo(() => {
    const step = Math.max(1, Math.floor(activePoints.length / 280));
    return activePoints.filter((_, idx) => idx % step === 0);
  }, [activePoints]);

  return (
    <View style={[styles.container, style]}>
      {/* Top Header Mode Tabs */}
      <View style={styles.tabRow}>
        {(
          [
            { id: 'PHOTOS', label: '1.Photos' },
            { id: 'RAW', label: '2.Raw 3D' },
            { id: 'BBOX', label: '3.BBox' },
            { id: 'DEFECTS', label: '4.Defects' },
            { id: 'ENVELOPE', label: '5.Envelope' },
            { id: 'DRESSING', label: '6.Dressing' },
            { id: 'FINAL', label: '7.Final' },
          ] as { id: ViewerMode; label: string }[]
        ).map((m) => {
          const isActive = mode === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => setMode(m.id)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Surface Observation Checklist Bar */}
      <View style={styles.surfaceStatusRow}>
        {['FRONT', 'LEFT', 'RIGHT', 'BACK', 'TOP', 'BOTTOM'].map((side) => {
          const isObserved = observedSurfaces.includes(side);
          return (
            <View
              key={side}
              style={[
                styles.surfaceBadge,
                isObserved ? styles.surfaceBadgeObserved : styles.surfaceBadgeMissing,
              ]}
            >
              <Text
                style={[
                  styles.surfaceBadgeText,
                  isObserved ? styles.surfaceTextObserved : styles.surfaceTextMissing,
                ]}
              >
                {side} {isObserved ? '✓' : '✗'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Interactive 3D Canvas Projection Viewport */}
      <View style={styles.canvasContainer} {...panResponder.panHandlers}>
        {/* Render Camera Frustums & Photo Selector in PHOTOS mode */}
        {mode === 'PHOTOS' && (
          <View style={styles.cameraPoseContainer}>
            {[
              { side: 'FRONT', label: 'PHOTO 001', rx: 0.18, ry: 0 },
              { side: 'LEFT', label: 'PHOTO 002', rx: 0.20, ry: 1.57 },
              { side: 'BACK', label: 'PHOTO 003', rx: 0.18, ry: 3.14 },
              { side: 'RIGHT', label: 'PHOTO 004', rx: 0.20, ry: -1.57 },
              { side: 'TOP', label: 'PHOTO 005', rx: 1.35, ry: 0 },
            ].map((cam) => {
              const isObs = observedSurfaces.includes(cam.side);
              return (
                <TouchableOpacity
                  key={cam.side}
                  onPress={() => {
                    setRotX(cam.rx);
                    setRotY(cam.ry);
                  }}
                  style={[
                    styles.camNodeBadge,
                    isObs ? styles.camNodeObserved : styles.camNodeMissing,
                  ]}
                >
                  <Text style={styles.camNodeText}>📷 {cam.label} ({cam.side})</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Render Sparse Point Cloud for RAW, BBOX, DEFECTS, and PHOTOS modes */}
        {(mode === 'RAW' || mode === 'BBOX' || mode === 'DEFECTS' || mode === 'PHOTOS') &&
          sampledPoints.map((pt, idx) => {
            const p = project(pt[0], pt[1], pt[2]);
            const isTop = pt[2] > hh - 5;
            const isBottom = pt[2] < -hh + 5;
            const dotColor = isBottom
              ? colors.amber
              : isTop
              ? '#38bdf8'
              : 'rgba(230, 235, 245, 0.7)';

            return (
              <View
                key={idx}
                style={[
                  styles.pointDot,
                  {
                    left: p.u,
                    top: p.v,
                    backgroundColor: dotColor,
                  },
                ]}
              />
            );
          })}

        {/* Render Bounding Box Outline for BBOX & ENVELOPE modes */}
        {(mode === 'BBOX' || mode === 'ENVELOPE') && (
          <View
            style={[
              styles.rawBoundingFrame,
              {
                left: Math.min(...rawProjected.map((p) => p.u)),
                top: Math.min(...rawProjected.map((p) => p.v)),
                width: Math.max(...rawProjected.map((p) => p.u)) - Math.min(...rawProjected.map((p) => p.u)),
                height: Math.max(...rawProjected.map((p) => p.v)) - Math.min(...rawProjected.map((p) => p.v)),
              },
            ]}
          >
            <Text style={styles.bboxLabelText}>MINIMUM OBB [DERIVED]</Text>
          </View>
        )}

        {/* Render Defect Highlights */}
        {mode === 'DEFECTS' && (
          <View
            style={[
              styles.defectHighlightBox,
              {
                left: project(0, 0, hh).u - 30,
                top: project(0, 0, hh).v - 18,
              },
            ]}
          >
            <Text style={styles.defectLabel}>⚠ SURFACE FISSURE ZONE</Text>
          </View>
        )}

        {/* Render Usable Inscribed Envelope */}
        {(mode === 'ENVELOPE' || mode === 'FINAL') && (
          <View
            style={[
              styles.dressedCuboidFrame,
              {
                left: Math.min(...dressedProjected.map((p) => p.u)),
                top: Math.min(...dressedProjected.map((p) => p.v)),
                width: Math.max(...dressedProjected.map((p) => p.u)) - Math.min(...dressedProjected.map((p) => p.u)),
                height: Math.max(...dressedProjected.map((p) => p.v)) - Math.min(...dressedProjected.map((p) => p.v)),
              },
            ]}
          >
            <View style={styles.sawnFaceOverlay}>
              <Text style={styles.dressedFaceText}>{mode === 'FINAL' ? 'COMMERCIAL DRESSED BLOCK' : 'SAFE INSCRIBED CUBOID'}</Text>
              <Text style={styles.dressedDimText}>
                {(dressedL / 100).toFixed(2)}m × {(dressedB / 100).toFixed(2)}m × {(dressedH / 100).toFixed(2)}m
              </Text>
            </View>
          </View>
        )}

        {/* Render Active Cutting Step Plane for DRESSING mode */}
        {mode === 'DRESSING' && (
          <View style={styles.cutOverlayContainer}>
            <View style={styles.cutPlaneIndicator}>
              <Text style={styles.cutPlaneTitle}>
                CUT {activeStep + 1}: {cuttingSteps[activeStep]?.cut_name || 'Primary Reference Trim'}
              </Text>
              <Text style={styles.cutPlaneCoord}>
                Axis {cuttingSteps[activeStep]?.plane_axis || 'X'} at {cuttingSteps[activeStep]?.position_m?.toFixed(2) || '0.12'}m ({cuttingSteps[activeStep]?.position_cm?.toFixed(1) || '12.0'}cm)
              </Text>
              <Text style={styles.cutPlaneReason}>
                Waste Removed: {cuttingSteps[activeStep]?.removed_volume_m3?.toFixed(4) || '0.1800'} m³ · {cuttingSteps[activeStep]?.waste_category || 'Squaring Cut'}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom Floating Overlay Bar */}
        <View style={styles.overlayBar}>
          <View>
            <Text style={styles.overlayDimText}>
              EXTENTS: {(lengthCm / 100).toFixed(2)}m × {(breadthCm / 100).toFixed(2)}m × {(heightCm / 100).toFixed(2)}m
            </Text>
            <Text style={styles.overlaySubText}>
              {lengthCm.toFixed(1)}cm × {breadthCm.toFixed(1)}cm × {heightCm.toFixed(1)}cm
            </Text>
          </View>
          <ProvenanceBadge tag={mode === 'RAW' ? 'RECONSTRUCTED' : mode === 'FINAL' ? 'DERIVED' : mode === 'PHOTOS' ? 'OBSERVED' : 'DERIVED'} />
        </View>
      </View>

      {/* Interactive 3D Controls (Zoom In, Zoom Out, Reset, Auto Rotate) */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => setZoom((z) => Math.min(2.5, z + 0.2))}
          style={styles.controlBtn}
        >
          <Text style={styles.controlBtnText}>🔍 +</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          style={styles.controlBtn}
        >
          <Text style={styles.controlBtnText}>🔍 -</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setRotX(-0.45);
            setRotY(0.65);
            setZoom(1.0);
          }}
          style={styles.controlBtn}
        >
          <Text style={styles.controlBtnText}>↺ RESET</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAutoRotate((r) => !r)}
          style={[styles.controlBtn, autoRotate && styles.controlBtnActive]}
        >
          <Text style={[styles.controlBtnText, autoRotate && styles.controlBtnActiveText]}>
            {autoRotate ? '⏸ PAUSE' : '▶ ORBIT'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Step Player Controls for DRESSING Mode */}
      {mode === 'DRESSING' && cuttingSteps.length > 0 && (
        <View style={styles.stepPlayerRow}>
          <TouchableOpacity
            onPress={() => onStepChange?.(Math.max(0, activeStep - 1))}
            disabled={activeStep <= 0}
            style={[styles.stepBtn, activeStep <= 0 && styles.stepBtnDisabled]}
          >
            <Text style={styles.stepBtnText}>◀ PREV</Text>
          </TouchableOpacity>
          <Text style={styles.stepCounterText}>
            CUT {activeStep + 1} / {cuttingSteps.length}
          </Text>
          <TouchableOpacity
            onPress={() => onStepChange?.(Math.min(cuttingSteps.length - 1, activeStep + 1))}
            disabled={activeStep >= cuttingSteps.length - 1}
            style={[styles.stepBtn, activeStep >= cuttingSteps.length - 1 && styles.stepBtnDisabled]}
          >
            <Text style={styles.stepBtnText}>NEXT ▶</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.inkSecondary,
    borderColor: colors.line,
    borderWidth: 1.2,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 8,
    padding: 12,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.panelRaised,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
  },
  tabButtonActive: {
    backgroundColor: colors.amber,
  },
  tabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: colors.ink,
  },
  canvasContainer: {
    height: 270,
    backgroundColor: '#040711',
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  pointDot: {
    position: 'absolute',
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  defectHighlightBox: {
    position: 'absolute',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  defectLabel: {
    color: colors.danger,
    fontSize: 9,
    fontWeight: '900',
  },
  dressedCuboidFrame: {
    position: 'absolute',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: colors.amber,
    borderWidth: 1.8,
    borderRadius: 6,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sawnFaceOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 17, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderColor: colors.amber,
    borderWidth: 1,
  },
  dressedFaceText: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dressedDimText: {
    color: colors.stone,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  cutOverlayContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
  },
  cutPlaneIndicator: {
    backgroundColor: 'rgba(5, 8, 17, 0.88)',
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  cutPlaneTitle: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: '800',
  },
  cutPlaneCoord: {
    color: colors.stone,
    fontSize: 11,
    fontWeight: '700',
  },
  cutPlaneReason: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  overlayBar: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 17, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  overlayDimText: {
    color: colors.stone,
    fontSize: 11,
    fontWeight: '800',
  },
  overlaySubText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 6,
  },
  controlBtn: {
    flex: 1,
    backgroundColor: colors.panelRaised,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: colors.amber,
  },
  controlBtnText: {
    color: colors.stone,
    fontSize: 10,
    fontWeight: '800',
  },
  controlBtnActiveText: {
    color: colors.amber,
  },
  stepPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.panelRaised,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    marginTop: 2,
  },
  stepBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  stepBtnText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '900',
  },
  stepCounterText: {
    color: colors.stone,
    fontSize: 11,
    fontWeight: '800',
  },
  surfaceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginVertical: 2,
  },
  surfaceBadge: {
    flex: 1,
    paddingVertical: 3,
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
  },
  surfaceBadgeObserved: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  surfaceBadgeMissing: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  surfaceBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  surfaceTextObserved: {
    color: '#34d399',
  },
  surfaceTextMissing: {
    color: '#f87171',
  },
  cameraPoseContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  camNodeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  camNodeObserved: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  camNodeMissing: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  camNodeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  rawBoundingFrame: {
    position: 'absolute',
    backgroundColor: 'rgba(232, 180, 94, 0.06)',
    borderColor: colors.amber,
    borderWidth: 1.5,
    borderRadius: 6,
    borderStyle: 'dashed',
    padding: 4,
  },
  bboxLabelText: {
    color: colors.amber,
    fontSize: 8,
    fontWeight: '900',
  },
});
