import { GLView } from "expo-gl";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Vec3 = [number, number, number];
type Triangle = [number, number, number];

type MeshPayload = {
  format?: string;
  role?: string;
  units?: string;
  vertices?: number[][];
  triangles?: number[][];
  vertex_normals?: number[][];
  vertex_count?: number;
  triangle_count?: number;
  surface_area_cm2?: number | null;
  volume_cm3?: number | null;
  is_watertight?: boolean | null;
  mesh_method?: string | null;
  mesh_status?: string | null;
  unobserved_surface_policy?: string | null;
  hole_filling_performed?: boolean | null;
  raw_granite_is_bounding_box?: boolean | null;
  geometry_point_source?: string | null;
  reconstruction_provider?: string | null;
  reconstruction_status?: string | null;
};

type PointCloudPayload = {
  points?: number[][];
  point_count?: number;
  units?: string;
  geometry_point_source?: string | null;
  reconstruction_provider?: string | null;
  reconstruction_status?: string | null;
};

export type ObservedShapeValidation = {
  status?: string | null;
  target_iou?: number | null;
  target_is_validation_goal_not_guarantee?: boolean | null;
  target_met?: boolean | null;
  overall_silhouette_iou?: number | null;
  median_silhouette_iou?: number | null;
  minimum_silhouette_iou?: number | null;
  mean_boundary_error_px?: number | null;
  maximum_boundary_error_px?: number | null;
  valid_view_count?: number | null;
  total_view_count?: number | null;
  weak_view_ids?: string[] | null;
  recapture_recommended?: boolean | null;
  recapture_view_id?: string | null;
  recapture_view_label?: string | null;
  recapture_reason?: string | null;
  score_scope?: string | null;
  unobserved_surface_policy?: string | null;
};

export type PhotoEvidenceRow = Record<string, unknown>;

export type MetricMeasurementOverlay = {
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  length_uncertainty_cm?: number | null;
  breadth_uncertainty_cm?: number | null;
  height_uncertainty_cm?: number | null;
};

type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];


type Props = {
  meshUrl?: string | null;
  pointsUrl?: string | null;
  selectedUserId?: string | null;
  language?: "en" | "te";
  shapeValidation?: ObservedShapeValidation | null;
  selectedPhotoId?: string | null;
  selectedPhotoLabel?: string | null;
  selectedPhotoSequenceNumber?: number | null;
  photoEvidenceMatrix?: PhotoEvidenceRow[] | null;
  measurement?: MetricMeasurementOverlay | null;
  metricScaleProven?: boolean;
  unobservedSurfaces?: string[] | null;
};

type RenderMode = "MESH" | "POINTS";

type PreparedGeometry = {
  mode: RenderMode;
  positions: Float32Array;
  normals: Float32Array;
  count: number;
  sourceCount: number;
  renderedCount: number;
  units: string;
  role: string;
  method: string;
  status: string;
  isWatertight: boolean | null;
  source: string;
};

type GLState = {
  gl: any;
  program: any;
  positionBuffer: any;
  normalBuffer: any;
  aPosition: number;
  aNormal: number;
  uViewRotation: any;
  uZoom: any;
  uMode: any;
  count: number;
  mode: RenderMode;
};

const MAX_RENDERED_TRIANGLES = 120_000;
const MAX_RENDERED_POINTS = 180_000;

export default function GraniteMesh3DViewer({
  meshUrl,
  pointsUrl,
  selectedUserId,
  language = "en",
  shapeValidation,
  selectedPhotoId,
  selectedPhotoLabel,
  selectedPhotoSequenceNumber,
  photoEvidenceMatrix,
  measurement,
  metricScaleProven = false,
  unobservedSurfaces,
}: Props) {
  const isTe = language === "te";
  const [prepared, setPrepared] = useState<PreparedGeometry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState({ x: -0.28, y: 0.58 });
  const [zoom, setZoom] = useState(1);
  const [photoAligned, setPhotoAligned] = useState(false);
  const glStateRef = useRef<GLState | null>(null);
  const rotationRef = useRef(rotation);
  const zoomRef = useRef(zoom);
  const gestureStartRef = useRef(rotation);
  const viewMatrixRef = useRef<Mat3>(manualRotationMatrix(-0.28, 0.58));

  const selectedEvidence = useMemo(
    () =>
      findPhotoEvidenceRow(
        photoEvidenceMatrix,
        selectedPhotoId,
        selectedPhotoSequenceNumber,
        selectedPhotoLabel,
      ),
    [
      photoEvidenceMatrix,
      selectedPhotoId,
      selectedPhotoLabel,
      selectedPhotoSequenceNumber,
    ],
  );

  const photoPoseMatrix = useMemo(
    () => cameraViewMatrixFromEvidence(selectedEvidence),
    [selectedEvidence],
  );

  const poseStatus =
    getString(selectedEvidence, "camera_pose_status") ||
    (photoPoseMatrix ? "REGISTERED" : "CAMERA_POSE_UNAVAILABLE");

  const selectedViewIou =
    getFiniteNumber(selectedEvidence, "silhouette_iou");

  const selectedEvidenceLabel =
    getString(selectedEvidence, "photo_label") ||
    getString(selectedEvidence, "view_name") ||
    getString(selectedEvidence, "side") ||
    selectedPhotoLabel ||
    (selectedPhotoSequenceNumber != null
      ? `PHOTO_${String(selectedPhotoSequenceNumber).padStart(3, "0")}`
      : selectedPhotoId
        ? "SELECTED PHOTO"
        : "");

  const metricOverlayReady =
    metricScaleProven &&
    isPositiveNumber(measurement?.length_cm) &&
    isPositiveNumber(measurement?.breadth_cm) &&
    isPositiveNumber(measurement?.height_cm);

  const activeViewMatrix = useMemo(() => {
    const manual = manualRotationMatrix(rotation.x, rotation.y);
    return photoAligned && photoPoseMatrix
      ? multiplyMat3(manual, photoPoseMatrix)
      : manual;
  }, [photoAligned, photoPoseMatrix, rotation.x, rotation.y]);

  useEffect(() => {
    viewMatrixRef.current = activeViewMatrix;
  }, [activeViewMatrix]);

  useEffect(() => {
    if (!selectedPhotoId && selectedPhotoSequenceNumber == null) {
      return;
    }

    if (photoPoseMatrix) {
      const next = { x: 0, y: 0 };
      rotationRef.current = next;
      setRotation(next);
      setZoom(1);
      setPhotoAligned(true);
    } else {
      setPhotoAligned(false);
    }
  }, [photoPoseMatrix, selectedPhotoId, selectedPhotoSequenceNumber]);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const requestHeaders = useMemo(() => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (selectedUserId) headers["x-selected-user-id"] = selectedUserId;
    return headers;
  }, [selectedUserId]);

  const loadGeometry = useCallback(async () => {
    if (!meshUrl && !pointsUrl) {
      setPrepared(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (meshUrl) {
        const response = await fetch(meshUrl, { headers: requestHeaders });
        if (response.ok) {
          const mesh = (await response.json()) as MeshPayload;
          setPrepared(prepareMesh(mesh));
          return;
        }
        if (response.status !== 404) {
          throw new Error(`Mesh request failed (${response.status}).`);
        }
      }

      if (pointsUrl) {
        const response = await fetch(pointsUrl, { headers: requestHeaders });
        if (!response.ok) {
          throw new Error(`Point-cloud request failed (${response.status}).`);
        }
        const cloud = (await response.json()) as PointCloudPayload;
        setPrepared(preparePointCloud(cloud));
        return;
      }

      throw new Error(
        "The backend did not persist an observed irregular surface for this analysis.",
      );
    } catch (reason) {
      setPrepared(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load reconstructed geometry.",
      );
    } finally {
      setLoading(false);
    }
  }, [meshUrl, pointsUrl, requestHeaders]);

  useEffect(() => {
    void loadGeometry();
  }, [loadGeometry]);

  const draw = useCallback(() => {
    const state = glStateRef.current;
    if (!state) return;

    const { gl, program } = state;
    try {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      // Ball-pivoting patches can contain inconsistent winding. Rendering both
      // sides preserves the observed open surface without inventing faces.
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0.035, 0.055, 0.064, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.positionBuffer);
      gl.enableVertexAttribArray(state.aPosition);
      gl.vertexAttribPointer(state.aPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.normalBuffer);
      gl.enableVertexAttribArray(state.aNormal);
      gl.vertexAttribPointer(state.aNormal, 3, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix3fv(
        state.uViewRotation,
        false,
        rowMajorMat3ToGl(viewMatrixRef.current),
      );
      gl.uniform1f(state.uZoom, zoomRef.current);
      gl.uniform1f(state.uMode, state.mode === "MESH" ? 1 : 0);

      if (state.mode === "MESH") {
        gl.drawArrays(gl.TRIANGLES, 0, state.count);
      } else {
        gl.drawArrays(gl.POINTS, 0, state.count);
      }

      gl.flush();
      gl.endFrameEXP();
    } catch {
      // A lost GL context is allowed to recover through a new GLView context.
    }
  }, []);

  const installGeometry = useCallback(
    (gl: any, geometry: PreparedGeometry) => {
      destroyGlState(glStateRef.current);

      const vertexShader = compileShader(
        gl,
        gl.VERTEX_SHADER,
        `
          precision mediump float;
          attribute vec3 aPosition;
          attribute vec3 aNormal;
          uniform mat3 uViewRotation;
          uniform float uZoom;
          uniform float uMode;
          varying float vLight;
          varying float vDepth;

          void main() {
            vec3 p = uViewRotation * aPosition;
            vec3 n = normalize(uViewRotation * aNormal);
            vec3 lightDir = normalize(vec3(0.45, 0.75, 0.65));
            vLight = 0.34 + 0.66 * max(dot(n, lightDir), 0.0);
            vDepth = p.z;

            float cameraDistance = 3.6;
            float w = max(1.35, cameraDistance - p.z);
            gl_Position = vec4(
              p.x * 2.45 * uZoom,
              p.y * 2.45 * uZoom,
              p.z * 0.75,
              w
            );
            gl_PointSize = mix(3.0, 1.0, clamp(w / 5.0, 0.0, 1.0));
          }
        `,
      );

      const fragmentShader = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        `
          precision mediump float;
          uniform float uMode;
          varying float vLight;
          varying float vDepth;

          void main() {
            vec3 graniteDark = vec3(0.26, 0.31, 0.32);
            vec3 graniteLight = vec3(0.67, 0.72, 0.70);
            vec3 pointTone = vec3(0.35, 0.86, 0.78);
            vec3 meshTone = mix(graniteDark, graniteLight, vLight);
            vec3 tone = mix(pointTone, meshTone, uMode);
            float edgeDepth = 0.92 + 0.08 * clamp((vDepth + 1.2) / 2.4, 0.0, 1.0);
            gl_FragColor = vec4(tone * edgeDepth, 1.0);
          }
        `,
      );

      const program = gl.createProgram();
      if (!program) throw new Error("Unable to create the 3D shader program.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "3D shader link failed.");
      }

      const positionBuffer = gl.createBuffer();
      const normalBuffer = gl.createBuffer();
      if (!positionBuffer || !normalBuffer) {
        throw new Error("Unable to allocate 3D geometry buffers.");
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);

      const state: GLState = {
        gl,
        program,
        positionBuffer,
        normalBuffer,
        aPosition: gl.getAttribLocation(program, "aPosition"),
        aNormal: gl.getAttribLocation(program, "aNormal"),
        uViewRotation: gl.getUniformLocation(program, "uViewRotation"),
        uZoom: gl.getUniformLocation(program, "uZoom"),
        uMode: gl.getUniformLocation(program, "uMode"),
        count: geometry.count,
        mode: geometry.mode,
      };

      glStateRef.current = state;
      draw();
    },
    [draw],
  );

  const onContextCreate = useCallback(
    (gl: any) => {
      if (!prepared) return;
      try {
        installGeometry(gl, prepared);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to initialize the 3D viewer.",
        );
      }
    },
    [installGeometry, prepared],
  );

  useEffect(() => {
    const state = glStateRef.current;
    if (!state || !prepared) return;
    try {
      installGeometry(state.gl, prepared);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to refresh the reconstructed geometry.",
      );
    }
  }, [installGeometry, prepared]);

  useEffect(() => {
    draw();
  }, [activeViewMatrix, draw, zoom]);

  useEffect(
    () => () => {
      destroyGlState(glStateRef.current);
      glStateRef.current = null;
    },
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          gestureStartRef.current = rotationRef.current;
          if (photoAligned) {
            setPhotoAligned(false);
          }
        },
        onPanResponderMove: (_, gesture) => {
          const next = {
            x: clamp(
              gestureStartRef.current.x + gesture.dy * 0.009,
              -1.45,
              1.45,
            ),
            y: gestureStartRef.current.y + gesture.dx * 0.011,
          };
          rotationRef.current = next;
          setRotation(next);
        },
      }),
    [photoAligned],
  );

  const similarity = shapeValidation?.overall_silhouette_iou;
  const target = shapeValidation?.target_iou ?? 0.9;
  const targetMet = shapeValidation?.target_met === true;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>
            {isTe ? "రియల్ 3D రీకన్స్ట్రక్షన్" : "REAL 3D RECONSTRUCTION"}
          </Text>
          <Text style={styles.title}>
            {prepared?.mode === "MESH"
              ? isTe
                ? "పరిశీలించిన అసమాన గ్రానైట్ మెష్"
                : "Observed irregular granite mesh"
              : isTe
                ? "పునర్నిర్మించిన పాయింట్ క్లౌడ్"
                : "Reconstructed point cloud"}
          </Text>
        </View>
        <View
          style={[
            styles.validationPill,
            targetMet ? styles.validationPass : styles.validationPending,
          ]}
        >
          <Text
            style={[
              styles.validationPillText,
              targetMet
                ? styles.validationPassText
                : styles.validationPendingText,
            ]}
          >
            {targetMet ? "≥90% VALIDATED" : "90% TARGET"}
          </Text>
        </View>
      </View>

      <View style={styles.validationCard}>
        <ValidationMetric
          label={isTe ? "సిల్హౌట్ IoU" : "Observed silhouette IoU"}
          value={formatScore(similarity)}
        />
        <ValidationMetric
          label={isTe ? "లక్ష్యం" : "Validation target"}
          value={formatScore(target)}
        />
        <ValidationMetric
          label={isTe ? "వ్యూలు" : "Validated views"}
          value={formatViews(shapeValidation)}
        />
      </View>

      {selectedPhotoId || selectedPhotoSequenceNumber != null ? (
        <View
          style={[
            styles.photoSyncCard,
            photoPoseMatrix ? styles.photoSyncCardReady : styles.photoSyncCardUnavailable,
          ]}
        >
          <View
            style={[
              styles.photoSyncIcon,
              photoPoseMatrix
                ? styles.photoSyncIconReady
                : styles.photoSyncIconUnavailable,
            ]}
          >
            <Text style={styles.photoSyncIconText}>
              {photoPoseMatrix ? "3D" : "!"}
            </Text>
          </View>

          <View style={styles.photoSyncCopy}>
            <Text style={styles.photoSyncEyebrow}>
              {isTe ? "ఫోటో ↔ 3D సమకాలీకరణ" : "PHOTO ↔ 3D SYNC"}
            </Text>
            <Text style={styles.photoSyncTitle}>
              {photoPoseMatrix
                ? isTe
                  ? `${selectedEvidenceLabel || "ఎంచుకున్న ఫోటో"} కెమెరా దిశతో 3D ఆటో-అలైన్ అయింది`
                  : `3D auto-aligned to ${selectedEvidenceLabel || "the selected photo"} camera orientation`
                : isTe
                  ? "ఈ ఫోటోకు రిజిస్టర్డ్ కెమెరా పోజ్ లేదు"
                  : "No registered camera pose for this photo"}
            </Text>
            <Text style={styles.photoSyncMeta}>
              {photoPoseMatrix
                ? `${poseStatus}${selectedViewIou !== null ? ` · IoU ${formatScore(selectedViewIou)}` : ""}`
                : "CAMERA_POSE_UNAVAILABLE · orientation is not simulated"}
            </Text>
          </View>

          {photoPoseMatrix ? (
            <View style={styles.photoSyncLivePill}>
              <View style={styles.photoSyncLiveDot} />
              <Text style={styles.photoSyncLiveText}>
                {photoAligned
                  ? isTe
                    ? "అలైన్"
                    : "ALIGNED"
                  : isTe
                    ? "మాన్యువల్"
                    : "MANUAL"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.canvasCard} {...panResponder.panHandlers}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#58D2C3" />
            <Text style={styles.stateText}>
              {isTe ? "3D ఆధారాలు లోడ్ అవుతున్నాయి…" : "Loading reconstructed geometry…"}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorMark}>!</Text>
            <Text style={styles.errorTitle}>
              {isTe ? "3D ఉపరితలం అందుబాటులో లేదు" : "3D surface unavailable"}
            </Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadGeometry()} style={styles.retryButton}>
              <Text style={styles.retryText}>{isTe ? "మళ్లీ ప్రయత్నించు" : "Retry"}</Text>
            </Pressable>
          </View>
        ) : prepared ? (
          <>
            <GLView
              key={`${prepared.mode}-${prepared.sourceCount}-${meshUrl || pointsUrl || "geometry"}`}
              style={styles.glView}
              onContextCreate={onContextCreate}
              msaaSamples={4}
              pointerEvents="none"
            />
            <View pointerEvents="none" style={styles.canvasTopOverlay}>
              <View style={styles.canvasModeGroup}>
                <Text style={styles.canvasMode}>
                  {prepared.mode === "MESH" ? "SURFACE" : "POINT CLOUD"}
                </Text>
                {photoAligned && photoPoseMatrix ? (
                  <Text style={styles.canvasPhotoMode}>
                    {selectedEvidenceLabel || (isTe ? "ఫోటో వ్యూ" : "PHOTO VIEW")}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.canvasHint}>
                {photoAligned && photoPoseMatrix
                  ? isTe
                    ? "ఎంచుకున్న ఫోటో కెమెరా దిశ"
                    : "Selected photo camera orientation"
                  : isTe
                    ? "తిప్పడానికి డ్రాగ్ చేయండి"
                    : "Drag to rotate"}
              </Text>
            </View>

            {metricOverlayReady ? (
              <View pointerEvents="none" style={styles.metricOverlay}>
                <Text style={styles.metricOverlayEyebrow}>
                  {isTe ? "మెట్రిక్ కొలతలు" : "METRIC DIMENSIONS"}
                </Text>
                <View style={styles.metricOverlayRow}>
                  <MetricOverlayChip
                    label="L"
                    value={measurement?.length_cm ?? null}
                  />
                  <MetricOverlayChip
                    label="B"
                    value={measurement?.breadth_cm ?? null}
                  />
                  <MetricOverlayChip
                    label="H"
                    value={measurement?.height_cm ?? null}
                  />
                </View>
              </View>
            ) : measurement ? (
              <View pointerEvents="none" style={styles.metricLockedBadge}>
                <Text style={styles.metricLockedText}>
                  {isTe
                    ? "మెట్రిక్ ఓవర్‌లే లాక్ · స్కేల్ నిర్ధారణ అవసరం"
                    : "METRIC OVERLAY LOCKED · SCALE PROOF REQUIRED"}
                </Text>
              </View>
            ) : null}

            <View pointerEvents="none" style={styles.openBoundaryBadge}>
              <Text style={styles.openBoundaryText}>
                {unobservedSurfaces && unobservedSurfaces.length > 0
                  ? isTe
                    ? `${unobservedSurfaces.slice(0, 3).join(", ")} · తెలియని భాగాలు తెరిచి ఉంటాయి`
                    : `${unobservedSurfaces.slice(0, 3).join(", ")} · unknown surfaces stay open`
                  : isTe
                    ? "తెలియని ముఖాలు తెరిచి ఉంటాయి"
                    : "Unknown faces stay open"}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>
              {isTe ? "3D ఆధారాలు లేవు" : "No 3D evidence"}
            </Text>
            <Text style={styles.errorText}>
              {isTe
                ? "ఈ బ్లాక్‌కు బ్యాక్‌ఎండ్ మెష్ లేదా పాయింట్ క్లౌడ్‌ను ఇవ్వలేదు."
                : "The backend has not reported a mesh or point cloud for this block."}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          disabled={!photoPoseMatrix}
          onPress={() => {
            if (!photoPoseMatrix) return;
            const next = { x: 0, y: 0 };
            rotationRef.current = next;
            setRotation(next);
            setZoom(1);
            setPhotoAligned(true);
          }}
          style={[
            styles.alignButton,
            photoAligned && photoPoseMatrix && styles.alignButtonActive,
            !photoPoseMatrix && styles.alignButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.alignButtonText,
              photoAligned && photoPoseMatrix && styles.alignButtonTextActive,
            ]}
          >
            {isTe ? "ఫోటోకు అలైన్" : "Align to photo"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const next = { x: -0.28, y: 0.58 };
            rotationRef.current = next;
            setRotation(next);
            setZoom(1);
            setPhotoAligned(false);
          }}
          style={styles.controlButton}
        >
          <Text style={styles.controlText}>{isTe ? "రిసెట్" : "Reset"}</Text>
        </Pressable>
        <Pressable
          onPress={() => setZoom((value) => clamp(value - 0.12, 0.62, 1.7))}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
        <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
        <Pressable
          onPress={() => setZoom((value) => clamp(value + 0.12, 0.62, 1.7))}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
      </View>

      {prepared ? (
        <View style={styles.evidenceCard}>
          <EvidenceRow label={isTe ? "ఆధారం" : "Geometry role"} value={prepared.role} />
          <EvidenceRow label={isTe ? "పద్ధతి" : "Mesh method"} value={prepared.method} />
          <EvidenceRow label={isTe ? "స్థితి" : "Geometry status"} value={prepared.status} />
          <EvidenceRow label={isTe ? "యూనిట్లు" : "Units"} value={prepared.units} />
          <EvidenceRow
            label={isTe ? "ట్రయాంగిల్స్ / పాయింట్లు" : "Triangles / points"}
            value={
              prepared.sourceCount === prepared.renderedCount
                ? prepared.sourceCount.toLocaleString()
                : `${prepared.renderedCount.toLocaleString()} rendered / ${prepared.sourceCount.toLocaleString()} source`
            }
          />
          <EvidenceRow
            label={isTe ? "వాటర్‌టైట్" : "Watertight"}
            value={
              prepared.isWatertight === null
                ? "NOT REPORTED"
                : prepared.isWatertight
                  ? "YES"
                  : "NO — OPEN OBSERVED SURFACE"
            }
            last
          />
        </View>
      ) : null}

      {shapeValidation?.recapture_recommended ? (
        <View style={styles.recaptureCard}>
          <Text style={styles.recaptureTitle}>
            {isTe ? "అదనపు ఫోటో సిఫార్సు" : "Additional photo recommended"}
          </Text>
          <Text style={styles.recaptureText}>
            {shapeValidation.recapture_view_label
              ? `${isTe ? "వీక్ వ్యూ" : "Weak view"}: ${shapeValidation.recapture_view_label}. `
              : ""}
            {shapeValidation.recapture_reason ||
              (isTe
                ? "90% పరిశీలించిన-ఆకృతి లక్ష్యాన్ని మళ్లీ ధృవీకరించడానికి అదనపు ఆధారం అవసరం."
                : "Additional evidence is required before the 90% observed-shape target can be validated.")}
          </Text>
        </View>
      ) : null}

      <Text style={styles.truthText}>
        {isTe
          ? "ఈ వ్యూయర్ బ్యాక్‌ఎండ్ ఇచ్చిన అదే vertices/triangles లేదా పాయింట్లను మాత్రమే చూపిస్తుంది. 90% అనేది పరిశీలించిన ఫోటో వ్యూలపై render-back silhouette IoU లక్ష్యం; కనిపించని ఉపరితలాలకు ఇది ఖచ్చితత్వ హామీ కాదు."
          : "This viewer renders only the backend vertices/triangles or reconstructed points for this exact block. The 90% figure is a render-back silhouette IoU target on observed photographic views; it is not an accuracy claim for unseen surfaces."}
      </Text>
    </View>
  );
}

function MetricOverlayChip({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <View style={styles.metricOverlayChip}>
      <Text style={styles.metricOverlayLabel}>{label}</Text>
      <Text style={styles.metricOverlayValue}>
        {isPositiveNumber(value) ? `${value.toFixed(1)} cm` : "—"}
      </Text>
    </View>
  );
}

function ValidationMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.validationMetric}>
      <Text style={styles.validationLabel}>{label}</Text>
      <Text style={styles.validationValue}>{value}</Text>
    </View>
  );
}

function EvidenceRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.evidenceRow, last && styles.evidenceRowLast]}>
      <Text style={styles.evidenceLabel}>{label}</Text>
      <Text selectable style={styles.evidenceValue}>
        {value}
      </Text>
    </View>
  );
}

function prepareMesh(payload: MeshPayload): PreparedGeometry {
  if (payload.raw_granite_is_bounding_box === true) {
    throw new Error(
      "Rejected backend geometry: a bounding box cannot be rendered as raw granite.",
    );
  }

  const vertices = sanitizeVertices(payload.vertices);
  const triangles = sanitizeTriangles(payload.triangles, vertices.length);
  if (vertices.length < 3 || triangles.length < 1) {
    throw new Error("The backend mesh contains no renderable observed surface.");
  }

  const normalizedVertices = normalizeVertices(vertices);
  const normals = sanitizeNormals(payload.vertex_normals, vertices.length);
  const selected = sampleEvenly(triangles, MAX_RENDERED_TRIANGLES);

  const positionValues: number[] = [];
  const normalValues: number[] = [];

  for (const triangle of selected) {
    const a = normalizedVertices[triangle[0]];
    const b = normalizedVertices[triangle[1]];
    const c = normalizedVertices[triangle[2]];
    const faceNormal = triangleNormal(a, b, c);

    for (const index of triangle) {
      const p = normalizedVertices[index];
      const n = normals[index] || faceNormal;
      positionValues.push(p[0], p[1], p[2]);
      normalValues.push(n[0], n[1], n[2]);
    }
  }

  return {
    mode: "MESH",
    positions: new Float32Array(positionValues),
    normals: new Float32Array(normalValues),
    count: selected.length * 3,
    sourceCount: triangles.length,
    renderedCount: selected.length,
    units: payload.units || "unknown",
    role: payload.role || "OBSERVED_IRREGULAR_GRANITE_SURFACE",
    method: payload.mesh_method || "BACKEND_OBSERVED_SURFACE_MESH",
    status: payload.mesh_status || payload.reconstruction_status || "REPORTED",
    isWatertight:
      typeof payload.is_watertight === "boolean" ? payload.is_watertight : null,
    source: payload.geometry_point_source || payload.reconstruction_provider || "backend",
  };
}

function preparePointCloud(payload: PointCloudPayload): PreparedGeometry {
  const points = sanitizeVertices(payload.points);
  if (points.length < 3) {
    throw new Error("The backend point cloud contains too few reconstructed points.");
  }
  const normalized = normalizeVertices(points);
  const selected = sampleEvenly(normalized, MAX_RENDERED_POINTS);
  const positionValues: number[] = [];
  const normalValues: number[] = [];

  for (const point of selected) {
    positionValues.push(point[0], point[1], point[2]);
    const n = normalizeVec(point);
    normalValues.push(n[0], n[1], n[2]);
  }

  return {
    mode: "POINTS",
    positions: new Float32Array(positionValues),
    normals: new Float32Array(normalValues),
    count: selected.length,
    sourceCount: points.length,
    renderedCount: selected.length,
    units: payload.units || "unknown",
    role: "RECONSTRUCTED_POINT_CLOUD_EVIDENCE",
    method: "BACKEND_POINT_CLOUD",
    status: payload.reconstruction_status || "REPORTED",
    isWatertight: null,
    source: payload.geometry_point_source || payload.reconstruction_provider || "backend",
  };
}

function sanitizeVertices(value: number[][] | undefined): Vec3[] {
  if (!Array.isArray(value)) return [];
  const out: Vec3[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const x = Number(row[0]);
    const y = Number(row[1]);
    const z = Number(row[2]);
    if (![x, y, z].every(Number.isFinite)) continue;
    out.push([x, y, z]);
  }
  return out;
}

function sanitizeTriangles(
  value: number[][] | undefined,
  vertexCount: number,
): Triangle[] {
  if (!Array.isArray(value)) return [];
  const out: Triangle[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const a = Number(row[0]);
    const b = Number(row[1]);
    const c = Number(row[2]);
    if (![a, b, c].every(Number.isInteger)) continue;
    if (a < 0 || b < 0 || c < 0) continue;
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
    if (a === b || b === c || a === c) continue;
    out.push([a, b, c]);
  }
  return out;
}

function sanitizeNormals(
  value: number[][] | undefined,
  vertexCount: number,
): Array<Vec3 | null> {
  const out: Array<Vec3 | null> = new Array(vertexCount).fill(null);
  if (!Array.isArray(value)) return out;
  const count = Math.min(value.length, vertexCount);
  for (let i = 0; i < count; i += 1) {
    const row = value[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    const n: Vec3 = [Number(row[0]), Number(row[1]), Number(row[2])];
    if (!n.every(Number.isFinite)) continue;
    out[i] = normalizeVec(n);
  }
  return out;
}

function normalizeVertices(vertices: Vec3[]): Vec3[] {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const largestExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = 2 / largestExtent;

  // Global centering + uniform scale only. This preserves the backend shape.
  return vertices.map(([x, y, z]) => [
    (x - cx) * scale,
    (y - cy) * scale,
    (z - cz) * scale,
  ]);
}

function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalizeVec([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]);
}

function normalizeVec(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length < 1e-7) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function sampleEvenly<T>(items: T[], maximum: number): T[] {
  if (items.length <= maximum) return items;
  const out: T[] = [];
  const step = items.length / maximum;
  for (let i = 0; i < maximum; i += 1) {
    out.push(items[Math.min(items.length - 1, Math.floor(i * step))]);
  }
  return out;
}

function compileShader(gl: any, type: number, source: string): any {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate a 3D shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "3D shader compilation failed.");
  }
  return shader;
}

function destroyGlState(state: GLState | null): void {
  if (!state) return;
  try {
    if (state.positionBuffer) state.gl.deleteBuffer(state.positionBuffer);
    if (state.normalBuffer) state.gl.deleteBuffer(state.normalBuffer);
    if (state.program) state.gl.deleteProgram(state.program);
  } catch {
    // Context may already be gone.
  }
}

function formatScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const normalized = value <= 1.000001 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function formatViews(value: ObservedShapeValidation | null | undefined): string {
  const valid = value?.valid_view_count;
  const total = value?.total_view_count;
  if (typeof valid !== "number" && typeof total !== "number") return "—";
  return `${typeof valid === "number" ? valid : "—"}/${typeof total === "number" ? total : "—"}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(
  row: PhotoEvidenceRow | null,
  key: string,
): string {
  if (!row) return "";
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function getFiniteNumber(
  row: PhotoEvidenceRow | null,
  key: string,
): number | null {
  if (!row) return null;
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function findPhotoEvidenceRow(
  rows: PhotoEvidenceRow[] | null | undefined,
  photoId: string | null | undefined,
  sequenceNumber: number | null | undefined,
  photoLabel: string | null | undefined,
): PhotoEvidenceRow | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  if (photoId) {
    const exact = rows.find((row) => {
      const id =
        getString(row, "photo_id") ||
        getString(row, "image_id");
      if (id === photoId) return true;
      const imageUrl = getString(row, "image_url");
      return Boolean(imageUrl && imageUrl.includes(photoId));
    });
    if (exact) return exact;
  }

  if (typeof sequenceNumber === "number" && Number.isFinite(sequenceNumber)) {
    const matches = rows.filter(
      (row) => getFiniteNumber(row, "sequence_number") === sequenceNumber,
    );
    if (matches.length === 1) return matches[0];
  }

  if (photoLabel) {
    const normalized = photoLabel.trim().toUpperCase();
    const matches = rows.filter((row) =>
      [
        getString(row, "side"),
        getString(row, "view_name"),
        getString(row, "photo_label"),
      ].some((value) => value.trim().toUpperCase() === normalized),
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function cameraViewMatrixFromEvidence(
  row: PhotoEvidenceRow | null,
): Mat3 | null {
  if (!row) return null;

  const pose = asRecord(row.camera_pose);
  const rotation = pose.rotation;

  if (!Array.isArray(rotation) || rotation.length !== 3) return null;

  const matrix: number[] = [];
  for (const sourceRow of rotation) {
    if (!Array.isArray(sourceRow) || sourceRow.length !== 3) return null;
    for (const value of sourceRow) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      matrix.push(numeric);
    }
  }

  const det =
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);

  if (!Number.isFinite(det) || Math.abs(det) < 0.25 || Math.abs(det) > 1.75) {
    return null;
  }

  const cameraRotation = matrix as Mat3;

  // SfM/OpenCV image coordinates use downward-positive Y. The display
  // conversion flips only the image Y axis; no hidden surface or geometry is
  // created. Translation/intrinsics are deliberately not faked here.
  const displayFrame: Mat3 = [
    1, 0, 0,
    0, -1, 0,
    0, 0, 1,
  ];

  return multiplyMat3(displayFrame, cameraRotation);
}

function manualRotationMatrix(x: number, y: number): Mat3 {
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);

  return [
    cy, sy * sx, sy * cx,
    0, cx, -sx,
    -sy, cy * sx, cy * cx,
  ];
}

function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] +
        a[row * 3 + 1] * b[3 + col] +
        a[row * 3 + 2] * b[6 + col];
    }
  }

  return out as Mat3;
}

function rowMajorMat3ToGl(matrix: Mat3): Float32Array {
  return new Float32Array([
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  photoSyncCard: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  photoSyncCardReady: {
    backgroundColor: "#ECF8F5",
    borderColor: "#C7E9DF",
  },
  photoSyncCardUnavailable: {
    backgroundColor: "#FFF8E9",
    borderColor: "#ECD9AA",
  },
  photoSyncIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  photoSyncIconReady: {
    backgroundColor: "#173B47",
  },
  photoSyncIconUnavailable: {
    backgroundColor: "#E8D29E",
  },
  photoSyncIconText: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
  },
  photoSyncCopy: {
    flex: 1,
    minWidth: 0,
  },
  photoSyncEyebrow: {
    color: "#168C92",
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  photoSyncTitle: {
    marginTop: 3,
    color: "#25434C",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  photoSyncMeta: {
    marginTop: 3,
    color: "#71858B",
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "700",
  },
  photoSyncLivePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CFE8E1",
  },
  photoSyncLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#39A77D",
  },
  photoSyncLiveText: {
    color: "#347A66",
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: "900",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#15949B",
  },
  title: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: "#14262E",
  },
  validationPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  validationPass: {
    backgroundColor: "#E9F8F1",
    borderColor: "#AFE1CA",
  },
  validationPending: {
    backgroundColor: "#FFF7E7",
    borderColor: "#F0D493",
  },
  validationPillText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.55,
  },
  validationPassText: { color: "#19724F" },
  validationPendingText: { color: "#9A6A14" },
  validationCard: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8E8",
    backgroundColor: "#F9FCFC",
    overflow: "hidden",
  },
  validationMetric: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 9,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#DDE8E8",
  },
  validationLabel: {
    fontSize: 9,
    lineHeight: 12,
    color: "#6A7D84",
    fontWeight: "700",
  },
  validationValue: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 18,
    color: "#17333D",
    fontWeight: "800",
  },
  canvasCard: {
    height: 330,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#091116",
    borderWidth: 1,
    borderColor: "#1F3C43",
  },
  glView: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  canvasTopOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  canvasModeGroup: {
    alignItems: "flex-start",
    gap: 4,
  },
  canvasPhotoMode: {
    maxWidth: 150,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    overflow: "hidden",
    backgroundColor: "rgba(76,213,187,0.14)",
    color: "#7BE0CE",
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "900",
  },
  canvasMode: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(88,210,195,0.14)",
    color: "#7BE3D6",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  canvasHint: {
    color: "rgba(224,240,239,0.67)",
    fontSize: 10,
    fontWeight: "600",
  },
  metricOverlay: {
    position: "absolute",
    left: 12,
    bottom: 12,
    borderRadius: 12,
    padding: 8,
    backgroundColor: "rgba(7,22,28,0.86)",
    borderWidth: 1,
    borderColor: "rgba(104,221,198,0.2)",
  },
  metricOverlayEyebrow: {
    color: "#70D8C5",
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  metricOverlayRow: {
    marginTop: 5,
    flexDirection: "row",
    gap: 5,
  },
  metricOverlayChip: {
    minWidth: 62,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  metricOverlayLabel: {
    color: "#74D9C7",
    fontSize: 6.5,
    fontWeight: "900",
  },
  metricOverlayValue: {
    marginTop: 2,
    color: "#F4FBFA",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
  },
  metricLockedBadge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    maxWidth: 210,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(82,60,23,0.86)",
    borderWidth: 1,
    borderColor: "rgba(234,194,104,0.27)",
  },
  metricLockedText: {
    color: "#F2D391",
    fontSize: 6.8,
    lineHeight: 9,
    fontWeight: "900",
  },
  openBoundaryBadge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(9,17,22,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,205,108,0.28)",
  },
  openBoundaryText: {
    color: "#F3CB72",
    fontSize: 9,
    fontWeight: "700",
  },
  centerState: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 8,
  },
  stateText: {
    color: "#B9CACD",
    fontSize: 12,
    textAlign: "center",
  },
  errorMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: "rgba(255,192,94,0.13)",
    color: "#FFC768",
    textAlign: "center",
    lineHeight: 34,
    fontWeight: "900",
  },
  errorTitle: {
    color: "#F2F7F7",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  errorText: {
    color: "#98ACB1",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 3,
    borderRadius: 10,
    backgroundColor: "#12383D",
    borderWidth: 1,
    borderColor: "#245B60",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: {
    color: "#7BE3D6",
    fontSize: 11,
    fontWeight: "800",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  alignButton: {
    marginRight: "auto",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFE0E0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alignButtonActive: {
    backgroundColor: "#173B47",
    borderColor: "#173B47",
  },
  alignButtonDisabled: {
    opacity: 0.42,
  },
  alignButtonText: {
    color: "#34515A",
    fontSize: 9,
    fontWeight: "800",
  },
  alignButtonTextActive: {
    color: "#78DCC9",
  },
  controlButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFE0E0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  controlText: {
    color: "#34515A",
    fontSize: 10,
    fontWeight: "800",
  },
  zoomButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFE0E0",
    backgroundColor: "#FFFFFF",
  },
  zoomText: {
    color: "#17333D",
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "700",
  },
  zoomLabel: {
    width: 46,
    textAlign: "center",
    fontSize: 10,
    color: "#63777E",
    fontWeight: "800",
  },
  evidenceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8E8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E1EAEA",
  },
  evidenceRowLast: { borderBottomWidth: 0 },
  evidenceLabel: {
    width: 116,
    color: "#6A7D84",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  evidenceValue: {
    flex: 1,
    color: "#203C45",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  recaptureCard: {
    borderRadius: 14,
    backgroundColor: "#FFF8E8",
    borderWidth: 1,
    borderColor: "#F1D89E",
    padding: 12,
  },
  recaptureTitle: {
    color: "#8E6216",
    fontSize: 11,
    fontWeight: "800",
  },
  recaptureText: {
    marginTop: 4,
    color: "#7C642E",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
  },
  truthText: {
    color: "#657A81",
    fontSize: 10,
    lineHeight: 15,
  },
});
