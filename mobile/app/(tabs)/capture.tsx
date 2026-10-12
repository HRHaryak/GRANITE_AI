import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Language = "en" | "te";

type CaptureSide =
  | "FRONT"
  | "BACK"
  | "LEFT"
  | "RIGHT"
  | "FRONT_LEFT"
  | "FRONT_RIGHT"
  | "BACK_LEFT"
  | "BACK_RIGHT"
  | "TOP"
  | "BOTTOM";

type SlotState =
  | "empty"
  | "uploading"
  | "uploaded"
  | "accepted"
  | "rejected";

type Quarry = {
  id: string;
  quarry_name?: string | null;
  name?: string | null;
  quarry_code?: string | null;
  lease_id?: string | null;
  district?: string | null;
};

type GraniteCategory = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type DemoUser = {
  id: string;
  name: string;
  role?: string | null;
  is_active?: boolean | null;
  avatar_initials?: string | null;
};

type ServerImage = {
  id?: string | null;
  capture_side?: string | null;
  sequence_number?: number | null;
  accepted?: boolean | null;
  rejected?: boolean | null;
  image_url?: string | null;
  validation?: {
    accepted?: boolean | null;
    rejected?: boolean | null;
    reason?: string | null;
    code?: string | null;
  } | null;
  validation_result?: {
    accepted?: boolean | null;
    rejected?: boolean | null;
    reason?: string | null;
    code?: string | null;
  } | null;
};

type CaptureBundle = {
  session?: {
    id?: string | null;
    status?: string | null;
  } | null;
  images?: ServerImage[] | null;
};

type LocalEvidence = {
  uri: string;
  fileName: string;
  mimeType: string;
  fingerprint: string;
};

type FieldLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
};

type Copy = {
  title: string;
  subtitle: string;
  setup: string;
  setupHint: string;
  quarry: string;
  category: string;
  operator: string;
  operatorHint: string;
  operatorRequired: string;
  blockCode: string;
  blockPlaceholder: string;
  calibration: string;
  calibrationHint: string;
  reference: string;
  referencePlaceholder: string;
  gps: string;
  gpsLocate: string;
  gpsCaptured: string;
  gpsUnavailable: string;
  sessionLocked: string;
  views: string;
  viewsHint: string;
  bottomOptional: string;
  selected: string;
  cameraPermission: string;
  allowCamera: string;
  cameraReady: string;
  cameraPreparing: string;
  torch: string;
  gallery: string;
  capture: string;
  recapture: string;
  validating: string;
  accepted: string;
  rejected: string;
  uploaded: string;
  empty: string;
  progress: string;
  minimumReached: string;
  needMore: string;
  analyze: string;
  analyzing: string;
  analysisHint: string;
  serverTruth: string;
  noQuarries: string;
  noCategories: string;
  retryConfig: string;
  gpsNote: string;
  activeSession: string;
  currentView: string;
  closeSetup: string;
  openSetup: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    title: "New Granite Scan",
    subtitle: "Capture real evidence. Build only what the photos support.",
    setup: "Block setup",
    setupHint: "Choose the quarry and granite category before your first shot.",
    quarry: "Quarry",
    category: "Granite",
    operator: "Field operator",
    operatorHint: "Select the real user responsible for this capture. The backend records this user in the audit trail.",
    operatorRequired: "Select a field operator before capturing.",
    blockCode: "Block code",
    blockPlaceholder: "Optional block code",
    calibration: "Metric calibration · required",
    calibrationHint:
      "Enter the real long-side length of a rectangular reference board that will be clearly visible in the capture. The backend detects its pixel length; this is not a guessed scale.",
    reference: "Reference board (cm)",
    referencePlaceholder: "e.g. 15",
    gps: "GPS",
    gpsLocate: "Capture GPS",
    gpsCaptured: "GPS captured",
    gpsUnavailable: "GPS unavailable",
    sessionLocked: "Setup locked after the first uploaded photo.",
    views: "Capture views",
    viewsHint: "Pick any position in any order. Five backend-accepted images unlock the first reconstruction attempt; broader unique-angle coverage is still recommended.",
    bottomOptional: "Optional",
    selected: "Selected",
    cameraPermission: "Camera permission is required for field capture.",
    allowCamera: "Allow camera",
    cameraReady: "Frame the full granite block inside the guide.",
    cameraPreparing: "Preparing camera…",
    torch: "Torch",
    gallery: "Gallery",
    capture: "Capture",
    recapture: "Recapture",
    validating: "Validating",
    accepted: "Accepted",
    rejected: "Rejected",
    uploaded: "Uploaded",
    empty: "Not captured",
    progress: "Evidence progress",
    minimumReached: "Minimum reached",
    needMore: "accepted image(s) still needed",
    analyze: "Analyze & Build 3D",
    analyzing: "Starting analysis…",
    analysisHint:
      "At 5 backend-accepted images the app can start an evidence-supported 3D attempt. Use distinct overlapping angles; repeated photos do not prove additional surfaces.",
    serverTruth: "Acceptance and reconstruction authority come from the backend validation, not from the UI.",
    noQuarries: "No quarry records are available.",
    noCategories: "No granite categories are available.",
    retryConfig: "Retry",
    gpsNote: "Location is attached to the granite block record when available.",
    activeSession: "ACTIVE SESSION",
    currentView: "CURRENT VIEW",
    closeSetup: "Collapse setup",
    openSetup: "Edit setup",
  },
  te: {
    title: "కొత్త గ్రానైట్ స్కాన్",
    subtitle: "నిజమైన ఫోటో ఆధారాలను క్యాప్చర్ చేసి, ఆధారం ఉన్న భాగాలనే నిర్మించండి.",
    setup: "బ్లాక్ సెటప్",
    setupHint: "మొదటి ఫోటోకు ముందు క్వారీ మరియు గ్రానైట్ వర్గాన్ని ఎంచుకోండి.",
    quarry: "క్వారీ",
    category: "గ్రానైట్",
    operator: "ఫీల్డ్ ఆపరేటర్",
    operatorHint: "ఈ క్యాప్చర్‌కు నిజంగా బాధ్యత వహిస్తున్న వినియోగదారుని ఎంచుకోండి. బ్యాక్‌ఎండ్ ఈ వినియోగదారుని ఆడిట్ ట్రైల్‌లో నమోదు చేస్తుంది.",
    operatorRequired: "క్యాప్చర్‌కు ముందు ఫీల్డ్ ఆపరేటర్‌ను ఎంచుకోండి.",
    blockCode: "బ్లాక్ కోడ్",
    blockPlaceholder: "ఐచ్చిక బ్లాక్ కోడ్",
    calibration: "మెట్రిక్ కాలిబ్రేషన్ · అవసరం",
    calibrationHint:
      "క్యాప్చర్‌లో స్పష్టంగా కనిపించే దీర్ఘచతురస్రాకార రిఫరెన్స్ బోర్డు యొక్క నిజమైన పొడవైన వైపు కొలతను నమోదు చేయండి. పిక్సెల్ పొడవును బ్యాక్‌ఎండ్ గుర్తిస్తుంది; స్కేలు ఊహించబడదు.",
    reference: "రిఫరెన్స్ బోర్డు (సెం.మీ)",
    referencePlaceholder: "ఉదా. 15",
    gps: "GPS",
    gpsLocate: "GPS పొందండి",
    gpsCaptured: "GPS పొందబడింది",
    gpsUnavailable: "GPS అందుబాటులో లేదు",
    sessionLocked: "మొదటి ఫోటో అప్లోడ్ అయిన తర్వాత సెటప్ లాక్ అవుతుంది.",
    views: "ఫోటో దిశలు",
    viewsHint: "ఏ దిశనైనా ఏ క్రమంలోనైనా ఎంచుకోండి. బ్యాక్‌ఎండ్ అంగీకరించిన 5 చిత్రాలతో మొదటి 3D ప్రయత్నం అన్‌లాక్ అవుతుంది; విభిన్న ఓవర్‌ల్యాప్ దిశలు ఇంకా అవసరం.",
    bottomOptional: "ఐచ్చికం",
    selected: "ఎంచుకున్నది",
    cameraPermission: "ఫీల్డ్ క్యాప్చర్ కోసం కెమెరా అనుమతి అవసరం.",
    allowCamera: "కెమెరా అనుమతించు",
    cameraReady: "పూర్తి గ్రానైట్ బ్లాక్ గైడ్ లోపల కనిపించేలా ఫ్రేమ్ చేయండి.",
    cameraPreparing: "కెమెరా సిద్ధమవుతోంది…",
    torch: "టార్చ్",
    gallery: "గ్యాలరీ",
    capture: "క్యాప్చర్",
    recapture: "మళ్లీ క్యాప్చర్",
    validating: "వాలిడేట్ అవుతోంది",
    accepted: "అంగీకరించబడింది",
    rejected: "తిరస్కరించబడింది",
    uploaded: "అప్లోడ్ అయ్యింది",
    empty: "క్యాప్చర్ కాలేదు",
    progress: "ఎవిడెన్స్ ప్రోగ్రెస్",
    minimumReached: "కనీసం పూర్తైంది",
    needMore: "అంగీకరించిన చిత్రాలు ఇంకా అవసరం",
    analyze: "విశ్లేషణ & 3D నిర్మాణం",
    analyzing: "విశ్లేషణ ప్రారంభమవుతోంది…",
    analysisHint:
      "బ్యాక్‌ఎండ్ అంగీకరించిన 5 చిత్రాల వద్ద ఆధారపూర్వక 3D ప్రయత్నం ప్రారంభించవచ్చు. ఒకే కోణాన్ని పునరావృతం చేయకుండా పరస్పరం ఓవర్‌ల్యాప్ అయ్యే విభిన్న దృశ్యాలు తీసుకోండి.",
    serverTruth: "ఫోటో అంగీకారం మరియు 3D అధికార స్థితి బ్యాక్‌ఎండ్ వాలిడేషన్ నుంచే వస్తాయి.",
    noQuarries: "క్వారీ రికార్డులు అందుబాటులో లేవు.",
    noCategories: "గ్రానైట్ వర్గాలు అందుబాటులో లేవు.",
    retryConfig: "మళ్లీ ప్రయత్నించు",
    gpsNote: "అందుబాటులో ఉంటే GPS గ్రానైట్ బ్లాక్ రికార్డుకు జతచేయబడుతుంది.",
    activeSession: "యాక్టివ్ సెషన్",
    currentView: "ప్రస్తుత దిశ",
    closeSetup: "సెటప్ మూసివేయి",
    openSetup: "సెటప్ చూడండి",
  },
};

const CAPTURE_SIDES: Array<{
  key: CaptureSide;
  label: string;
  short: string;
  te: string;
  optional?: boolean;
}> = [
  { key: "FRONT", label: "Front", short: "F", te: "ముందు" },
  { key: "BACK", label: "Back", short: "B", te: "వెనుక" },
  { key: "LEFT", label: "Left", short: "L", te: "ఎడమ" },
  { key: "RIGHT", label: "Right", short: "R", te: "కుడి" },
  { key: "FRONT_LEFT", label: "Front Left", short: "FL", te: "ముందు ఎడమ" },
  { key: "FRONT_RIGHT", label: "Front Right", short: "FR", te: "ముందు కుడి" },
  { key: "BACK_LEFT", label: "Back Left", short: "BL", te: "వెనుక ఎడమ" },
  { key: "BACK_RIGHT", label: "Back Right", short: "BR", te: "వెనుక కుడి" },
  { key: "TOP", label: "Top", short: "T", te: "పై" },
  { key: "BOTTOM", label: "Bottom", short: "BT", te: "క్రింది", optional: true },
];

const MIN_ACCEPTED_IMAGES = 5;
const LANGUAGE_KEY = "granitemeasure.mobile.language";
const SELECTED_USER_KEY = "granitemeasure.mobile.selectedUserId";

const RAW_API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8000";

const SERVER_ROOT = RAW_API_BASE
  .replace(/\/api\/v1\/?$/i, "")
  .replace(/\/+$/, "");

const API_ROOT = `${SERVER_ROOT}/api/v1`;

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 390;

  const cameraRef = useRef<CameraView | null>(null);
  const localFingerprintsRef = useRef<Set<string>>(new Set());

  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();

  const [language, setLanguage] = useState<Language>("en");
  const copy = COPY[language];

  const [quarries, setQuarries] = useState<Quarry[]>([]);
  const [categories, setCategories] = useState<GraniteCategory[]>([]);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedQuarry, setSelectedQuarry] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [blockCode, setBlockCode] = useState("");
  const [referenceCm, setReferenceCm] = useState("");

  const [gps, setGps] = useState<FieldLocation | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [selectedSide, setSelectedSide] =
    useState<CaptureSide>("FRONT");

  const [localEvidence, setLocalEvidence] = useState<
    Partial<Record<CaptureSide, LocalEvidence>>
  >({});

  const [slotStates, setSlotStates] = useState<
    Partial<Record<CaptureSide, SlotState>>
  >({});

  const [serverImages, setServerImages] = useState<ServerImage[]>([]);

  const [blockId, setBlockId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(true);

  const setupLocked = Boolean(sessionId);

  const loadLanguage = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
      if (stored === "te" || stored === "en") {
        setLanguage(stored);
      }
    } catch {
      // Language persistence is non-critical.
    }
  }, []);

  const toggleLanguage = useCallback(async () => {
    const next: Language = language === "en" ? "te" : "en";
    setLanguage(next);

    try {
      await SecureStore.setItemAsync(LANGUAGE_KEY, next);
    } catch {
      // Keep the in-memory language even if persistence is unavailable.
    }
  }, [language]);

  const loadConfiguration = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);

    const [storedUserId, quarryResult, categoryResult, userResult] =
      await Promise.all([
        SecureStore.getItemAsync(SELECTED_USER_KEY).catch(() => null),
        Promise.resolve(requestJson<Quarry[]>("/quarries")).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        ),
        Promise.resolve(
          requestJson<GraniteCategory[]>("/granite-categories"),
        ).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        ),
        Promise.resolve(requestJson<DemoUser[]>("/demo-users")).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        ),
      ]);

    if (quarryResult.status === "fulfilled") {
      const values = Array.isArray(quarryResult.value)
        ? quarryResult.value
        : [];

      setQuarries(values);
      setSelectedQuarry((current) =>
        current || values[0]?.id || "",
      );
    } else {
      setQuarries([]);
    }

    if (categoryResult.status === "fulfilled") {
      const values = Array.isArray(categoryResult.value)
        ? categoryResult.value
        : [];

      setCategories(values);
      setSelectedCategory((current) =>
        current || values[0]?.id || "",
      );
    } else {
      setCategories([]);
    }

    if (userResult.status === "fulfilled") {
      const values = Array.isArray(userResult.value)
        ? userResult.value.filter((user) => user.is_active !== false)
        : [];

      setUsers(values);

      if (storedUserId && values.some((user) => user.id === storedUserId)) {
        setSelectedUserId(storedUserId);
      } else {
        setSelectedUserId("");

        if (storedUserId) {
          void SecureStore.deleteItemAsync(SELECTED_USER_KEY).catch(() => undefined);
        }
      }
    } else {
      setUsers([]);
      setSelectedUserId("");
    }

    const failures: string[] = [];

    if (quarryResult.status === "rejected") {
      failures.push("quarries");
    }

    if (categoryResult.status === "rejected") {
      failures.push("granite categories");
    }

    if (userResult.status === "rejected") {
      failures.push("field operators");
    }

    setConfigError(
      failures.length > 0
        ? `Unable to load ${failures.join(" and ")} from ${SERVER_ROOT}.`
        : null,
    );

    setConfigLoading(false);
  }, []);

  useEffect(() => {
    void loadLanguage();
    void loadConfiguration();
  }, [loadConfiguration, loadLanguage]);

  const acceptedBySide = useMemo(() => {
    const result = new Set<CaptureSide>();

    for (const image of serverImages) {
      const side = normalizeSide(image.capture_side);

      if (side && imageAccepted(image)) {
        result.add(side);
      }
    }

    return result;
  }, [serverImages]);

  const rejectedBySide = useMemo(() => {
    const result = new Set<CaptureSide>();

    for (const image of serverImages) {
      const side = normalizeSide(image.capture_side);

      if (side && imageRejected(image)) {
        result.add(side);
      }
    }

    return result;
  }, [serverImages]);

  const acceptedCount = useMemo(
    () =>
      serverImages.filter((image) => imageAccepted(image)).length,
    [serverImages],
  );

  const uniqueAcceptedSideCount = acceptedBySide.size;

  const remainingToMinimum = Math.max(
    MIN_ACCEPTED_IMAGES - acceptedCount,
    0,
  );

  const selectedLocal = localEvidence[selectedSide];

  const selectedState = deriveSlotState(
    selectedSide,
    slotStates,
    acceptedBySide,
    rejectedBySide,
  );

  const refreshServerEvidence = useCallback(
    async (
      activeBlockId: string,
    ) => {
      const bundle =
        await requestJson<CaptureBundle>(
          `/granite-blocks/${encodeURIComponent(activeBlockId)}/capture`,
        );

      setServerImages(
        Array.isArray(bundle.images) ? bundle.images : [],
      );

      return bundle;
    },
    [],
  );

  const selectOperator = useCallback(async (userId: string) => {
    try {
      await SecureStore.setItemAsync(SELECTED_USER_KEY, userId);
      setSelectedUserId(userId);
      setMessage(null);
    } catch {
      setMessage("Unable to save the selected operator on this device.");
    }
  }, []);

  const acquireGps = useCallback(async () => {
    if (gpsLoading) {
      return;
    }

    setGpsLoading(true);
    setMessage(null);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        throw new Error("Location permission was denied.");
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const nextGps: FieldLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
      };

      setGps(nextGps);
    } catch (error) {
      setGps(null);
      setMessage(errorMessage(error));
    } finally {
      setGpsLoading(false);
    }
  }, [gpsLoading]);

  const ensureSession = useCallback(async () => {
    if (blockId && sessionId) {
      return {
        blockId,
        sessionId,
      };
    }

    if (!selectedUserId) {
      throw new Error(copy.operatorRequired);
    }

    if (!selectedQuarry) {
      throw new Error("Select a quarry before capturing.");
    }

    if (!selectedCategory) {
      throw new Error("Select a granite category before capturing.");
    }

    const parsedReference = Number(referenceCm.trim());

    if (!Number.isFinite(parsedReference) || parsedReference <= 0) {
      throw new Error(
        "A real positive reference-board length is required for metric calibration.",
      );
    }

    setMessage("Creating granite block record…");

    const createdBlock = await requestJson<{
      id: string;
      block_code?: string | null;
    }>("/granite-blocks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quarry_id: selectedQuarry,
        granite_category_id: selectedCategory,
        capture_date: new Date().toISOString(),
        block_code: blockCode.trim() || null,
        gps: gps
          ? {
              latitude: gps.latitude,
              longitude: gps.longitude,
              accuracy: gps.accuracy ?? null,
            }
          : null,
        skip_gps: !gps,
      }),
    });

    if (!createdBlock?.id) {
      throw new Error("Backend did not return a granite block id.");
    }

    setMessage("Opening flexible capture session…");

    const createdSession = await requestJson<{
      id: string;
    }>("/capture-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        block_id: createdBlock.id,
        calibration_type: "MEASUREMENT_BOARD",
        known_reference_cm: parsedReference,
        marker_size_cm: null,
        reference_pixels: null,
        session_metadata: {
          capture_mode: "FLEXIBLE_POSITIONAL",
          inaccessible_surfaces: {},
          target_observed_shape_similarity: 0.9,
          target_similarity_is_validation_goal_not_guarantee: true,
        },
      }),
    });

    if (!createdSession?.id) {
      throw new Error("Backend did not return a capture session id.");
    }

    setBlockId(createdBlock.id);
    setSessionId(createdSession.id);
    setShowSetup(false);

    return {
      blockId: createdBlock.id,
      sessionId: createdSession.id,
    };
  }, [
    blockCode,
    blockId,
    copy.operatorRequired,
    gps,
    referenceCm,
    selectedCategory,
    selectedQuarry,
    selectedUserId,
    sessionId,
  ]);

  const uploadEvidence = useCallback(
    async (
      evidence: LocalEvidence,
      side: CaptureSide,
    ) => {
      setBusy(true);
      setMessage(null);
      setSlotStates((current) => ({
        ...current,
        [side]: "uploading",
      }));

      try {
        const active = await ensureSession();

        const sequence =
          serverImages.length + 1;

        const form = new FormData();

        form.append("capture_side", side);
        form.append("sequence_number", String(sequence));
        form.append("captured_at", new Date().toISOString());

        if (gps) {
          form.append("gps_latitude", String(gps.latitude));
          form.append("gps_longitude", String(gps.longitude));

          if (typeof gps.accuracy === "number") {
            form.append("gps_accuracy", String(gps.accuracy));
          }
        }

        form.append(
          "device_metadata",
          JSON.stringify({
            platform: Platform.OS,
            experience: "EXPO_MOBILE_CAPTURE",
            capture_side: side,
          }),
        );

        form.append(
          "file",
          {
            uri: evidence.uri,
            name: evidence.fileName,
            type: evidence.mimeType,
          } as unknown as Blob,
        );

        const uploadResult = await requestJson<unknown>(
          `/capture-sessions/${encodeURIComponent(active.sessionId)}/images`,
          {
            method: "POST",
            body: form,
            timeoutMs: 60_000,
          },
        );

        setSlotStates((current) => ({
          ...current,
          [side]: inferUploadState(uploadResult),
        }));

        await refreshServerEvidence(active.blockId);

        setMessage(
          "Photo uploaded. Server validation has been refreshed.",
        );
      } catch (error) {
        setSlotStates((current) => ({
          ...current,
          [side]: "rejected",
        }));

        setMessage(errorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [
      ensureSession,
      gps,
      refreshServerEvidence,
      serverImages.length,
    ],
  );

  const captureWithCamera = useCallback(async () => {
    if (busy || analysisBusy) {
      return;
    }

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();

      if (!result.granted) {
        setMessage("Camera permission is required.");
        return;
      }
    }

    if (!cameraRef.current || !cameraReady) {
      setMessage("Camera is still preparing.");
      return;
    }

    try {
      setBusy(true);
      setMessage(null);

      const picture =
        await cameraRef.current.takePictureAsync({
          quality: 0.92,
          skipProcessing: false,
        });

      if (!picture?.uri) {
        throw new Error("Camera did not return an image.");
      }

      const evidence: LocalEvidence = {
        uri: picture.uri,
        fileName: `${selectedSide.toLowerCase()}-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        fingerprint: picture.uri,
      };

      localFingerprintsRef.current.add(evidence.fingerprint);

      setLocalEvidence((current) => ({
        ...current,
        [selectedSide]: evidence,
      }));

      setBusy(false);

      await uploadEvidence(evidence, selectedSide);
    } catch (error) {
      setBusy(false);
      setMessage(errorMessage(error));
    }
  }, [
    analysisBusy,
    busy,
    cameraPermission?.granted,
    cameraReady,
    requestCameraPermission,
    selectedSide,
    uploadEvidence,
  ]);

  const chooseFromGallery = useCallback(async () => {
    if (busy || analysisBusy) {
      return;
    }

    try {
      setMessage(null);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        throw new Error("Photo library permission was denied.");
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          quality: 1,
          exif: false,
          base64: false,
        });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const fingerprint =
        asset.assetId || asset.uri;

      if (localFingerprintsRef.current.has(fingerprint)) {
        throw new Error(
          "That photo is already selected locally. Choose another view.",
        );
      }

      const evidence: LocalEvidence = {
        uri: asset.uri,
        fileName:
          asset.fileName ||
          `${selectedSide.toLowerCase()}-${Date.now()}.jpg`,
        mimeType:
          asset.mimeType ||
          "image/jpeg",
        fingerprint,
      };

      localFingerprintsRef.current.add(fingerprint);

      setLocalEvidence((current) => ({
        ...current,
        [selectedSide]: evidence,
      }));

      await uploadEvidence(evidence, selectedSide);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [
    analysisBusy,
    busy,
    selectedSide,
    uploadEvidence,
  ]);

  const startAnalysis = useCallback(async () => {
    if (
      analysisBusy ||
      busy ||
      !blockId ||
      !sessionId
    ) {
      return;
    }

    if (acceptedCount < MIN_ACCEPTED_IMAGES) {
      setMessage(
        `${remainingToMinimum} more accepted image(s) are required before analysis.`,
      );
      return;
    }

    setAnalysisBusy(true);
    setMessage("Finalizing accepted evidence…");

    try {
      await requestJson<unknown>(
        `/capture-sessions/${encodeURIComponent(sessionId)}/complete`,
        {
          method: "POST",
        },
      );

      setMessage("Starting evidence-supported 3D analysis…");

      const job = await requestJson<{
        id?: string | null;
        job_id?: string | null;
      }>("/analysis-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          capture_session_id: sessionId,
        }),
      });

      const analysisJobId =
        typeof job.id === "string"
          ? job.id
          : typeof job.job_id === "string"
            ? job.job_id
            : null;

      if (!analysisJobId) {
        throw new Error(
          "Analysis was requested but the backend did not return a job id.",
        );
      }

      router.push(
        {
          pathname: "/blocks/[id]",
          params: {
            id: blockId,
            analysisJobId,
          },
        },
      );
    } catch (error) {
      setMessage(errorMessage(error));
      setAnalysisBusy(false);
    }
  }, [
    acceptedCount,
    analysisBusy,
    blockId,
    busy,
    remainingToMinimum,
    sessionId,
  ]);

  const selectedSideMeta =
    CAPTURE_SIDES.find((item) => item.key === selectedSide) ??
    CAPTURE_SIDES[0];

  return (
    <View style={styles.screen}>
      <AmbientBackground />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 10) + 2,
              paddingBottom: Math.max(insets.bottom, 14) + 124,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>FIELD CAPTURE / MOBILE</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.86}
                style={styles.title}
              >
                {copy.title}
              </Text>
              <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>

            <Pressable
              onPress={() => void toggleLanguage()}
              style={({ pressed }) => [
                styles.languageButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.languageText}>
                {language === "en" ? "EN / తెలుగు" : "తెలుగు / EN"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.sessionRail}>
            <View style={styles.sessionRailLeft}>
              <View
                style={[
                  styles.sessionDot,
                  sessionId && styles.sessionDotActive,
                ]}
              />
              <View>
                <Text style={styles.sessionRailLabel}>
                  {copy.activeSession}
                </Text>
                <Text
                  numberOfLines={1}
                  style={styles.sessionRailValue}
                >
                  {sessionId
                    ? `Block ${shortId(blockId)} · Session ${shortId(sessionId)}`
                    : "Ready to create on first upload"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setShowSetup((value) => !value)}
              style={({ pressed }) => [
                styles.setupToggle,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.setupToggleText}>
                {showSetup ? copy.closeSetup : copy.openSetup}
              </Text>
            </Pressable>
          </View>

          {showSetup ? (
            <View style={styles.setupCard}>
              <View style={styles.setupHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>01 / SETUP</Text>
                  <Text style={styles.cardTitle}>{copy.setup}</Text>
                  <Text style={styles.cardHint}>{copy.setupHint}</Text>
                </View>

                {setupLocked ? (
                  <View style={styles.lockBadge}>
                    <Text style={styles.lockBadgeText}>LOCKED</Text>
                  </View>
                ) : null}
              </View>

              {configError ? (
                <View style={styles.inlineError}>
                  <View style={styles.inlineErrorDot} />
                  <Text style={styles.inlineErrorText}>
                    {configError}
                  </Text>
                  <Pressable
                    onPress={() => void loadConfiguration()}
                  >
                    <Text style={styles.inlineRetry}>
                      {copy.retryConfig}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <SetupLabel label={copy.operator} />

              {configLoading ? (
                <LoadingStrip />
              ) : users.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {users.map((user) => {
                      const active = user.id === selectedUserId;

                      return (
                        <Pressable
                          key={user.id}
                          disabled={setupLocked}
                          onPress={() => void selectOperator(user.id)}
                          style={({ pressed }) => [
                            styles.choiceChip,
                            active && styles.choiceChipActive,
                            setupLocked && styles.choiceChipLocked,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            style={[
                              styles.choiceDot,
                              active && styles.choiceDotActive,
                            ]}
                          />
                          <View style={styles.choiceTextWrap}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.choiceText,
                                active && styles.choiceTextActive,
                              ]}
                            >
                              {user.name}
                            </Text>
                            <Text numberOfLines={1} style={styles.choiceSub}>
                              {user.role || "USER"}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.operatorHint}>{copy.operatorHint}</Text>
                </>
              ) : (
                <Text style={styles.emptyConfig}>
                  No active field users are available.
                </Text>
              )}

              <SetupLabel label={copy.quarry} />

              {configLoading ? (
                <LoadingStrip />
              ) : quarries.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {quarries.map((quarry) => {
                    const active = quarry.id === selectedQuarry;

                    return (
                      <Pressable
                        key={quarry.id}
                        disabled={setupLocked}
                        onPress={() => setSelectedQuarry(quarry.id)}
                        style={({ pressed }) => [
                          styles.choiceChip,
                          active && styles.choiceChipActive,
                          setupLocked && styles.choiceChipLocked,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.choiceDot,
                            active && styles.choiceDotActive,
                          ]}
                        />
                        <View style={styles.choiceTextWrap}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.choiceText,
                              active && styles.choiceTextActive,
                            ]}
                          >
                            {quarryName(quarry)}
                          </Text>

                          {quarry.lease_id ? (
                            <Text
                              numberOfLines={1}
                              style={styles.choiceSub}
                            >
                              Lease {quarry.lease_id}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.emptyConfig}>{copy.noQuarries}</Text>
              )}

              <SetupLabel label={copy.category} />

              {configLoading ? (
                <LoadingStrip />
              ) : categories.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {categories.map((category) => {
                    const active = category.id === selectedCategory;

                    return (
                      <Pressable
                        key={category.id}
                        disabled={setupLocked}
                        onPress={() => setSelectedCategory(category.id)}
                        style={({ pressed }) => [
                          styles.choiceChip,
                          styles.categoryChip,
                          active && styles.choiceChipActive,
                          setupLocked && styles.choiceChipLocked,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.choiceText,
                            active && styles.choiceTextActive,
                          ]}
                        >
                          {category.code || category.name || "Granite"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.emptyConfig}>{copy.noCategories}</Text>
              )}

              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <SetupLabel label={copy.blockCode} />
                  <TextInput
                    value={blockCode}
                    onChangeText={setBlockCode}
                    editable={!setupLocked}
                    placeholder={copy.blockPlaceholder}
                    placeholderTextColor="#91A2AE"
                    autoCapitalize="characters"
                    style={[
                      styles.input,
                      setupLocked && styles.inputLocked,
                    ]}
                  />
                </View>

                <View style={styles.formColumn}>
                  <SetupLabel label={copy.reference} />
                  <TextInput
                    value={referenceCm}
                    onChangeText={setReferenceCm}
                    editable={!setupLocked}
                    placeholder={copy.referencePlaceholder}
                    placeholderTextColor="#91A2AE"
                    keyboardType="decimal-pad"
                    style={[
                      styles.input,
                      setupLocked && styles.inputLocked,
                    ]}
                  />
                </View>
              </View>

              <View style={styles.referenceNote}>
                <View style={styles.referenceIcon}>
                  <Text style={styles.referenceIconText}>cm</Text>
                </View>
                <View style={styles.referenceCopy}>
                  <Text style={styles.referenceTitle}>{copy.calibration}</Text>
                  <Text style={styles.referenceText}>
                    {copy.calibrationHint}
                  </Text>
                </View>
              </View>

              <Pressable
                disabled={setupLocked || gpsLoading}
                onPress={() => void acquireGps()}
                style={({ pressed }) => [
                  styles.gpsButton,
                  gps && styles.gpsButtonReady,
                  (setupLocked || gpsLoading) && styles.controlDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.gpsIcon,
                    gps && styles.gpsIconReady,
                  ]}
                >
                  <View style={styles.pinOuter}>
                    <View style={styles.pinInner} />
                  </View>
                </View>

                <View style={styles.gpsCopy}>
                  <Text style={styles.gpsTitle}>
                    {copy.gps} ·{" "}
                    {gpsLoading
                      ? "LOCATING"
                      : gps
                        ? copy.gpsCaptured
                        : copy.gpsLocate}
                  </Text>

                  <Text numberOfLines={1} style={styles.gpsText}>
                    {gps
                      ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(
                          5,
                        )}${
                          typeof gps.accuracy === "number"
                            ? ` · ±${Math.round(gps.accuracy)}m`
                            : ""
                        }`
                      : copy.gpsNote}
                  </Text>
                </View>

                {gpsLoading ? (
                  <ActivityIndicator
                    size="small"
                    color="#168C93"
                  />
                ) : (
                  <Text style={styles.gpsArrow}>›</Text>
                )}
              </Pressable>

              {setupLocked ? (
                <Text style={styles.lockedNote}>
                  {copy.sessionLocked}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.viewsHeader}>
            <View style={styles.viewsHeaderCopy}>
              <Text style={styles.cardEyebrow}>02 / EVIDENCE</Text>
              <Text style={styles.cardTitle}>{copy.views}</Text>
              <Text style={styles.cardHint}>{copy.viewsHint}</Text>
            </View>

            <View style={styles.acceptedBadge}>
              <Text style={styles.acceptedBadgeValue}>
                {acceptedCount}
              </Text>
              <Text style={styles.acceptedBadgeText}>/ 5+</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sideRail}
          >
            {CAPTURE_SIDES.map((side) => {
              const state = deriveSlotState(
                side.key,
                slotStates,
                acceptedBySide,
                rejectedBySide,
              );

              const active = selectedSide === side.key;
              const local = localEvidence[side.key];

              return (
                <Pressable
                  key={side.key}
                  onPress={() => setSelectedSide(side.key)}
                  style={({ pressed }) => [
                    styles.sideCard,
                    active && styles.sideCardActive,
                    state === "accepted" && styles.sideCardAccepted,
                    state === "rejected" && styles.sideCardRejected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.sideCardTop}>
                    <View
                      style={[
                        styles.sideShortBadge,
                        active && styles.sideShortBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sideShort,
                          active && styles.sideShortActive,
                        ]}
                      >
                        {side.short}
                      </Text>
                    </View>

                    <EvidenceStateDot state={state} />
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sideLabel,
                      active && styles.sideLabelActive,
                    ]}
                  >
                    {language === "te" ? side.te : side.label}
                  </Text>

                  <Text style={styles.sideStateText}>
                    {stateLabel(state, copy)}
                  </Text>

                  {side.optional ? (
                    <Text style={styles.optionalText}>
                      {copy.bottomOptional}
                    </Text>
                  ) : local ? (
                    <View style={styles.localEvidenceTick}>
                      <Text style={styles.localEvidenceTickText}>PHOTO</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.cameraShell}>
            <View style={styles.cameraTopBar}>
              <View>
                <Text style={styles.cameraTopEyebrow}>
                  {copy.currentView}
                </Text>
                <Text style={styles.cameraTopTitle}>
                  {language === "te"
                    ? selectedSideMeta.te
                    : selectedSideMeta.label}
                </Text>
              </View>

              <View style={styles.cameraTopActions}>
                <Pressable
                  onPress={() => setTorch((value) => !value)}
                  style={({ pressed }) => [
                    styles.cameraUtility,
                    torch && styles.cameraUtilityActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.cameraUtilityText,
                      torch && styles.cameraUtilityTextActive,
                    ]}
                  >
                    {torch ? "LIGHT ON" : copy.torch.toUpperCase()}
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.cameraStateBadge,
                    selectedState === "accepted" &&
                      styles.cameraStateBadgeAccepted,
                    selectedState === "rejected" &&
                      styles.cameraStateBadgeRejected,
                  ]}
                >
                  <EvidenceStateDot state={selectedState} />
                  <Text style={styles.cameraStateText}>
                    {stateLabel(selectedState, copy)}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.cameraFrame,
                compact && styles.cameraFrameCompact,
              ]}
            >
              {cameraPermission?.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torch}
                  onCameraReady={() => setCameraReady(true)}
                />
              ) : (
                <View style={styles.permissionPanel}>
                  <View style={styles.permissionIcon}>
                    <ScanFrameIcon />
                  </View>

                  <Text style={styles.permissionTitle}>
                    {copy.cameraPermission}
                  </Text>

                  <Pressable
                    onPress={() => void requestCameraPermission()}
                    style={({ pressed }) => [
                      styles.permissionButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.permissionButtonText}>
                      {copy.allowCamera}
                    </Text>
                  </Pressable>
                </View>
              )}

              {cameraPermission?.granted ? (
                <>
                  <View pointerEvents="none" style={styles.cameraShadeTop} />
                  <View pointerEvents="none" style={styles.cameraShadeBottom} />

                  <View pointerEvents="none" style={styles.guideFrame}>
                    <View
                      style={[
                        styles.guideCorner,
                        styles.guideTL,
                      ]}
                    />
                    <View
                      style={[
                        styles.guideCorner,
                        styles.guideTR,
                      ]}
                    />
                    <View
                      style={[
                        styles.guideCorner,
                        styles.guideBL,
                      ]}
                    />
                    <View
                      style={[
                        styles.guideCorner,
                        styles.guideBR,
                      ]}
                    />

                    <View style={styles.centerCross}>
                      <View style={styles.centerCrossH} />
                      <View style={styles.centerCrossV} />
                    </View>
                  </View>

                  <View style={styles.cameraInstruction}>
                    <View
                      style={[
                        styles.cameraReadyDot,
                        cameraReady && styles.cameraReadyDotOn,
                      ]}
                    />
                    <Text
                      numberOfLines={2}
                      style={styles.cameraInstructionText}
                    >
                      {cameraReady
                        ? copy.cameraReady
                        : copy.cameraPreparing}
                    </Text>
                  </View>
                </>
              ) : null}

              {selectedLocal ? (
                <View style={styles.lastShotPreview}>
                  <Image
                    source={{ uri: selectedLocal.uri }}
                    style={styles.lastShotImage}
                  />
                  <Text style={styles.lastShotText}>LAST</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.captureControls}>
              <Pressable
                disabled={busy || analysisBusy}
                onPress={() => void chooseFromGallery()}
                style={({ pressed }) => [
                  styles.secondaryCaptureButton,
                  (busy || analysisBusy) && styles.controlDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.galleryIcon}>
                  <View style={styles.galleryMountainOne} />
                  <View style={styles.galleryMountainTwo} />
                </View>
                <Text style={styles.secondaryCaptureText}>
                  {copy.gallery}
                </Text>
              </Pressable>

              <Pressable
                disabled={busy || analysisBusy}
                onPress={() => void captureWithCamera()}
                style={({ pressed }) => [
                  styles.shutterWrap,
                  (busy || analysisBusy) && styles.controlDisabled,
                  pressed && styles.shutterPressed,
                ]}
              >
                <ShutterPulse active={busy} />

                <View style={styles.shutterOuter}>
                  <View style={styles.shutterInner}>
                    {busy ? (
                      <ActivityIndicator
                        size="small"
                        color="#EFFFFD"
                      />
                    ) : (
                      <ScanFrameIcon small />
                    )}
                  </View>
                </View>
              </Pressable>

              <View style={styles.controlMeta}>
                <Text style={styles.controlMetaTop}>
                  {selectedLocal ? copy.recapture : copy.capture}
                </Text>
                <Text style={styles.controlMetaBottom}>
                  {selectedSideMeta.short}
                </Text>
              </View>
            </View>
          </View>

          {message ? (
            <View style={styles.messageBar}>
              <View style={styles.messageAccent} />
              <Text style={styles.messageText}>{message}</Text>
              <Pressable onPress={() => setMessage(null)}>
                <Text style={styles.messageClose}>×</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.cardEyebrow}>03 / VALIDATION GATE</Text>
                <Text style={styles.cardTitle}>{copy.progress}</Text>
              </View>

              <View
                style={[
                  styles.minimumPill,
                  acceptedCount >= MIN_ACCEPTED_IMAGES &&
                    styles.minimumPillReady,
                ]}
              >
                <Text
                  style={[
                    styles.minimumPillText,
                    acceptedCount >= MIN_ACCEPTED_IMAGES &&
                      styles.minimumPillTextReady,
                  ]}
                >
                  {acceptedCount >= MIN_ACCEPTED_IMAGES
                    ? copy.minimumReached
                    : `${remainingToMinimum} ${copy.needMore}`}
                </Text>
              </View>
            </View>

            <EvidenceProgress
              accepted={Math.min(acceptedCount, 10)}
              total={10}
              minimum={MIN_ACCEPTED_IMAGES}
            />

            <View style={styles.progressStats}>
              <ProgressStat
                label={copy.accepted}
                value={String(acceptedCount)}
                tone="good"
              />
              <ProgressStat
                label="Unique sides"
                value={String(uniqueAcceptedSideCount)}
                tone="neutral"
              />
              <ProgressStat
                label={copy.rejected}
                value={String(
                  serverImages.filter((image) => imageRejected(image)).length,
                )}
                tone="bad"
              />
            </View>

            <Text style={styles.analysisHint}>
              {copy.analysisHint}
            </Text>

            <View style={styles.truthNote}>
              <View style={styles.truthMark}>
                <Text style={styles.truthMarkText}>i</Text>
              </View>
              <Text style={styles.truthText}>{copy.serverTruth}</Text>
            </View>

            <Pressable
              disabled={
                acceptedCount < MIN_ACCEPTED_IMAGES ||
                analysisBusy ||
                busy ||
                !sessionId ||
                !blockId
              }
              onPress={() => void startAnalysis()}
              style={({ pressed }) => [
                styles.analyzeButton,
                acceptedCount >= MIN_ACCEPTED_IMAGES &&
                  sessionId &&
                  blockId &&
                  styles.analyzeButtonReady,
                (acceptedCount < MIN_ACCEPTED_IMAGES ||
                  analysisBusy ||
                  busy ||
                  !sessionId ||
                  !blockId) &&
                  styles.analyzeButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.analyzeIcon}>
                {analysisBusy ? (
                  <ActivityIndicator
                    size="small"
                    color="#EFFFFD"
                  />
                ) : (
                  <ScanFrameIcon small />
                )}
              </View>

              <View style={styles.analyzeCopy}>
                <Text style={styles.analyzeTitle}>
                  {analysisBusy ? copy.analyzing : copy.analyze}
                </Text>

                <Text style={styles.analyzeSub}>
                  {acceptedCount >= MIN_ACCEPTED_IMAGES
                    ? `${acceptedCount} accepted image(s) ready`
                    : `${remainingToMinimum} more accepted image(s) needed`}
                </Text>
              </View>

              <Text style={styles.analyzeArrow}>›</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SetupLabel({ label }: { label: string }) {
  return <Text style={styles.setupLabel}>{label.toUpperCase()}</Text>;
}

function LoadingStrip() {
  return (
    <View style={styles.loadingStrip}>
      <ActivityIndicator size="small" color="#168C93" />
      <View style={styles.loadingLine} />
    </View>
  );
}

function EvidenceStateDot({ state }: { state: SlotState }) {
  return (
    <View
      style={[
        styles.stateDot,
        state === "accepted" && styles.stateDotAccepted,
        state === "uploading" && styles.stateDotUploading,
        state === "uploaded" && styles.stateDotUploaded,
        state === "rejected" && styles.stateDotRejected,
      ]}
    />
  );
}

function ShutterPulse({ active }: { active: boolean }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: active ? 700 : 1700,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [active, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      pulse.value,
      [0, 1],
      active ? [0.24, 0.52] : [0.14, 0.28],
    ),
    transform: [
      {
        scale: interpolate(
          pulse.value,
          [0, 1],
          [0.94, 1.16],
        ),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.shutterPulse, animatedStyle]}
    />
  );
}

function ScanFrameIcon({ small = false }: { small?: boolean }) {
  return (
    <View
      style={[
        styles.scanIcon,
        small && styles.scanIconSmall,
      ]}
    >
      <View style={[styles.scanCorner, styles.scanTL]} />
      <View style={[styles.scanCorner, styles.scanTR]} />
      <View style={[styles.scanCorner, styles.scanBL]} />
      <View style={[styles.scanCorner, styles.scanBR]} />
      <View style={styles.scanCenter} />
    </View>
  );
}

function EvidenceProgress({
  accepted,
  total,
  minimum,
}: {
  accepted: number;
  total: number;
  minimum: number;
}) {
  return (
    <View style={styles.evidenceTrackWrap}>
      <View style={styles.evidenceTrack}>
        {Array.from({ length: total }).map((_, index) => {
          const filled = index < accepted;
          const minimumMarker = index === minimum - 1;

          return (
            <View
              key={index}
              style={[
                styles.evidenceSegment,
                filled && styles.evidenceSegmentFilled,
                minimumMarker && styles.evidenceMinimumSegment,
              ]}
            />
          );
        })}
      </View>

      <View style={styles.minimumLegend}>
        <View style={styles.minimumLegendLine} />
        <Text style={styles.minimumLegendText}>
          5-image attempt gate
        </Text>
      </View>
    </View>
  );
}

function ProgressStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <View style={styles.progressStat}>
      <Text
        style={[
          styles.progressStatValue,
          tone === "good" && styles.progressStatValueGood,
          tone === "bad" && styles.progressStatValueBad,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.progressStatLabel}>{label}</Text>
    </View>
  );
}

function AmbientBackground() {
  const motion = useSharedValue(0);

  useEffect(() => {
    motion.value = withRepeat(
      withTiming(1, {
        duration: 9000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [motion]);

  const firstStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          motion.value,
          [0, 1],
          [-12, 28],
        ),
      },
      {
        translateY: interpolate(
          motion.value,
          [0, 1],
          [-8, 30],
        ),
      },
    ],
  }));

  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          motion.value,
          [0, 1],
          [18, -24],
        ),
      },
      {
        translateY: interpolate(
          motion.value,
          [0, 1],
          [24, -10],
        ),
      },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.ambientOne, firstStyle]} />
      <Animated.View style={[styles.ambientTwo, secondStyle]} />
    </View>
  );
}

function deriveSlotState(
  side: CaptureSide,
  localStates: Partial<Record<CaptureSide, SlotState>>,
  accepted: Set<CaptureSide>,
  rejected: Set<CaptureSide>,
): SlotState {
  if (accepted.has(side)) {
    return "accepted";
  }

  if (localStates[side] === "uploading") {
    return "uploading";
  }

  if (rejected.has(side) || localStates[side] === "rejected") {
    return "rejected";
  }

  if (localStates[side] === "uploaded") {
    return "uploaded";
  }

  return localStates[side] ?? "empty";
}

function inferUploadState(payload: unknown): SlotState {
  if (!payload || typeof payload !== "object") {
    return "uploaded";
  }

  const record = payload as Record<string, unknown>;

  if (record.accepted === true) {
    return "accepted";
  }

  if (record.rejected === true || record.accepted === false) {
    return "rejected";
  }

  const validation = record.validation;

  if (validation && typeof validation === "object") {
    const v = validation as Record<string, unknown>;

    if (v.accepted === true) {
      return "accepted";
    }

    if (v.rejected === true || v.accepted === false) {
      return "rejected";
    }
  }

  return "uploaded";
}

function imageAccepted(image: ServerImage): boolean {
  return (
    image.accepted === true ||
    image.validation?.accepted === true ||
    image.validation_result?.accepted === true
  );
}

function imageRejected(image: ServerImage): boolean {
  return (
    image.rejected === true ||
    image.accepted === false ||
    image.validation?.rejected === true ||
    image.validation?.accepted === false ||
    image.validation_result?.rejected === true ||
    image.validation_result?.accepted === false
  );
}

function normalizeSide(value: unknown): CaptureSide | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  return CAPTURE_SIDES.some((item) => item.key === normalized)
    ? (normalized as CaptureSide)
    : null;
}

function stateLabel(state: SlotState, copy: Copy): string {
  if (state === "accepted") {
    return copy.accepted;
  }

  if (state === "rejected") {
    return copy.rejected;
  }

  if (state === "uploading") {
    return copy.validating;
  }

  if (state === "uploaded") {
    return copy.uploaded;
  }

  return copy.empty;
}

function quarryName(quarry: Quarry): string {
  return (
    quarry.quarry_name ||
    quarry.name ||
    quarry.quarry_code ||
    `Quarry ${shortId(quarry.id)}`
  );
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value.length <= 8 ? value : value.slice(0, 8);
}

async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const { timeoutMs = 20_000, ...requestInit } = options;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(requestInit.headers);

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    const selectedUserId = await SecureStore.getItemAsync(SELECTED_USER_KEY).catch(
      () => null,
    );

    if (selectedUserId && !headers.has("x-selected-user-id")) {
      headers.set("x-selected-user-id", selectedUserId);
    }

    const response = await fetch(`${API_ROOT}${path}`, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });

    const raw = await response.text();

    if (!response.ok) {
      let detail = raw;

      try {
        const parsed = JSON.parse(raw) as {
          detail?: unknown;
          message?: unknown;
        };

        if (typeof parsed.detail === "string") {
          detail = parsed.detail;
        } else if (typeof parsed.message === "string") {
          detail = parsed.message;
        } else if (parsed.detail) {
          detail = JSON.stringify(parsed.detail);
        }
      } catch {
        // Use raw body.
      }

      throw new Error(
        detail || `Request failed with HTTP ${response.status}.`,
      );
    }

    if (!raw) {
      return undefined as T;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `Request timed out while connecting to ${SERVER_ROOT}.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while processing the capture.";
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  screen: {
    flex: 1,
    backgroundColor: "#EDF3F6",
  },

  content: {
    paddingHorizontal: 12,
  },

  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  eyebrow: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 1.45,
    color: "#148A90",
  },

  title: {
    marginTop: 4,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -1.1,
    color: "#172A3B",
  },

  subtitle: {
    marginTop: 5,
    maxWidth: 292,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#697F8F",
  },

  languageButton: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C9DDDF",
    backgroundColor: "#F7FBFB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  languageText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    color: "#32656D",
  },

  sessionRail: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#1A3142",
    borderWidth: 1,
    borderColor: "#314C5E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 9,
  },

  sessionRailLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },

  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#708391",
    marginRight: 9,
  },

  sessionDotActive: {
    backgroundColor: "#61D6B2",
  },

  sessionRailLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
    color: "#70D9D2",
  },

  sessionRailValue: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: "#C3D5DD",
    maxWidth: 230,
  },

  setupToggle: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "#405A6B",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  setupToggleText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    color: "#D5E6EB",
  },

  setupCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D5E2E7",
    backgroundColor: "#F9FCFD",
    padding: 13,
    marginBottom: 13,
    shadowColor: "#1C3443",
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },

  setupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  cardEyebrow: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#4D9699",
  },

  cardTitle: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: -0.45,
    color: "#1C3040",
  },

  cardHint: {
    marginTop: 4,
    maxWidth: 315,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#778B98",
  },

  lockBadge: {
    minHeight: 27,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#C5DBD5",
    backgroundColor: "#EAF5F0",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  lockBadgeText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#39725E",
  },

  inlineError: {
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: "#FFF0ED",
    borderWidth: 1,
    borderColor: "#F1C9C1",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  },

  inlineErrorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D66654",
    marginRight: 8,
  },

  inlineErrorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: "#875247",
  },

  inlineRetry: {
    marginLeft: 8,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    color: "#A54939",
  },

  setupLabel: {
    marginTop: 9,
    marginBottom: 6,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
    color: "#738997",
  },

  chipRow: {
    paddingRight: 8,
    gap: 7,
  },

  choiceChip: {
    minWidth: 132,
    maxWidth: 190,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D6E2E7",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  categoryChip: {
    minWidth: 96,
    minHeight: 40,
  },

  choiceChipActive: {
    borderColor: "#65C5C1",
    backgroundColor: "#EAF8F5",
  },

  choiceChipLocked: {
    opacity: 0.72,
  },

  choiceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#93A6B1",
    marginRight: 8,
  },

  choiceDotActive: {
    backgroundColor: "#168C93",
    borderColor: "#168C93",
  },

  choiceTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  choiceText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#425A69",
  },

  choiceTextActive: {
    color: "#1E5259",
  },

  choiceSub: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: "#8A9AA4",
  },

  emptyConfig: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#9B6A58",
    paddingVertical: 7,
  },

  operatorHint: {
    marginTop: -1,
    marginBottom: 8,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
    color: "#718694",
  },

  loadingStrip: {
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EDF4F6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
  },

  loadingLine: {
    marginLeft: 9,
    width: 110,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D8E5E8",
  },

  formRow: {
    flexDirection: "row",
    gap: 8,
  },

  formColumn: {
    flex: 1,
    minWidth: 0,
  },

  input: {
    minHeight: 43,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D4E1E6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    fontSize: 12,
    fontWeight: "700",
    color: "#233C4B",
  },

  inputLocked: {
    backgroundColor: "#EEF3F5",
    color: "#697D8A",
  },

  referenceNote: {
    marginTop: 10,
    minHeight: 60,
    borderRadius: 15,
    backgroundColor: "#E8F3F5",
    borderWidth: 1,
    borderColor: "#CDE1E5",
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },

  referenceIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#264B5D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  referenceIconText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: "#D9F5F1",
  },

  referenceCopy: {
    flex: 1,
  },

  referenceTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: "#294655",
  },

  referenceText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "600",
    color: "#6E8792",
  },

  gpsButton: {
    marginTop: 9,
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D4E1E6",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
  },

  gpsButtonReady: {
    backgroundColor: "#ECF8F3",
    borderColor: "#BFE3D3",
  },

  gpsIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: "#EDF3F5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  gpsIconReady: {
    backgroundColor: "#D8EFE5",
  },

  pinOuter: {
    width: 15,
    height: 19,
    borderWidth: 2,
    borderColor: "#397B79",
    borderRadius: 9,
    alignItems: "center",
    paddingTop: 4,
  },

  pinInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#397B79",
  },

  gpsCopy: {
    flex: 1,
    minWidth: 0,
  },

  gpsTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: "#345666",
  },

  gpsText: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "600",
    color: "#82939E",
  },

  gpsArrow: {
    marginLeft: 8,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "300",
    color: "#4E8290",
  },

  lockedNote: {
    marginTop: 8,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    color: "#6C827E",
  },

  viewsHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 1,
  },

  viewsHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  acceptedBadge: {
    minWidth: 58,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#B9DED5",
    backgroundColor: "#E8F6F1",
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    paddingTop: 9,
  },

  acceptedBadgeValue: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
    color: "#23795F",
  },

  acceptedBadgeText: {
    marginLeft: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: "#689382",
  },

  sideRail: {
    paddingRight: 12,
    paddingBottom: 10,
    gap: 7,
  },

  sideCard: {
    width: 92,
    height: 94,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D7E3E7",
    backgroundColor: "#FFFFFF",
    padding: 9,
  },

  sideCardActive: {
    borderColor: "#4DBBB8",
    backgroundColor: "#E9F7F4",
    transform: [{ translateY: -2 }],
  },

  sideCardAccepted: {
    borderColor: "#A8DDC4",
  },

  sideCardRejected: {
    borderColor: "#E8B9AE",
    backgroundColor: "#FFF5F2",
  },

  sideCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sideShortBadge: {
    minWidth: 28,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#EDF3F5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  sideShortBadgeActive: {
    backgroundColor: "#1B7E84",
  },

  sideShort: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    color: "#607683",
  },

  sideShortActive: {
    color: "#EFFFFD",
  },

  sideLabel: {
    marginTop: 9,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    color: "#314A59",
  },

  sideLabelActive: {
    color: "#185E64",
  },

  sideStateText: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    color: "#8798A2",
  },

  optionalText: {
    marginTop: "auto",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: "#9C7A47",
  },

  localEvidenceTick: {
    marginTop: "auto",
    alignSelf: "flex-start",
    minHeight: 16,
    borderRadius: 5,
    backgroundColor: "#E5F2F2",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  localEvidenceTickText: {
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    color: "#4D7C7E",
  },

  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C8D2D8",
  },

  stateDotAccepted: {
    backgroundColor: "#43B981",
  },

  stateDotUploading: {
    backgroundColor: "#E9A84E",
  },

  stateDotUploaded: {
    backgroundColor: "#65AFC7",
  },

  stateDotRejected: {
    backgroundColor: "#D96B59",
  },

  cameraShell: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D4859",
    backgroundColor: "#182C3C",
    padding: 8,
    shadowColor: "#0D1E29",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 10,
  },

  cameraTopBar: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
  },

  cameraTopEyebrow: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    color: "#6BD3CC",
  },

  cameraTopTitle: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    color: "#F0F8FA",
  },

  cameraTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  cameraUtility: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#40596A",
    backgroundColor: "#203848",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  cameraUtilityActive: {
    backgroundColor: "#EAF6D7",
    borderColor: "#D9E9A9",
  },

  cameraUtilityText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#B5C9D2",
  },

  cameraUtilityTextActive: {
    color: "#55722B",
  },

  cameraStateBadge: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#40596A",
    backgroundColor: "#203848",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  cameraStateBadgeAccepted: {
    borderColor: "#376958",
    backgroundColor: "#21483E",
  },

  cameraStateBadgeRejected: {
    borderColor: "#704C49",
    backgroundColor: "#4B302F",
  },

  cameraStateText: {
    marginLeft: 5,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "800",
    color: "#C0D1D8",
  },

  cameraFrame: {
    height: 382,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "#0E1D27",
    borderWidth: 1,
    borderColor: "#3A5262",
    position: "relative",
  },

  cameraFrameCompact: {
    height: 350,
  },

  permissionPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#EAF1F3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  permissionIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#1C4051",
    alignItems: "center",
    justifyContent: "center",
  },

  permissionTitle: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: "#334D5C",
  },

  permissionButton: {
    marginTop: 13,
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  permissionButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: "#F0FFFF",
  },

  cameraShadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 42,
    backgroundColor: "rgba(8,19,27,0.34)",
  },

  cameraShadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 68,
    backgroundColor: "rgba(8,19,27,0.46)",
  },

  guideFrame: {
    position: "absolute",
    left: 34,
    right: 34,
    top: 62,
    bottom: 80,
  },

  guideCorner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "#A9FFF2",
  },

  guideTL: {
    left: 0,
    top: 0,
    borderLeftWidth: 2.5,
    borderTopWidth: 2.5,
    borderTopLeftRadius: 8,
  },

  guideTR: {
    right: 0,
    top: 0,
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    borderTopRightRadius: 8,
  },

  guideBL: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderBottomLeftRadius: 8,
  },

  guideBR: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderBottomRightRadius: 8,
  },

  centerCross: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    alignItems: "center",
    justifyContent: "center",
  },

  centerCrossH: {
    position: "absolute",
    width: 22,
    height: 1,
    backgroundColor: "rgba(219,255,250,0.55)",
  },

  centerCrossV: {
    position: "absolute",
    width: 1,
    height: 22,
    backgroundColor: "rgba(219,255,250,0.55)",
  },

  cameraInstruction: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "rgba(15,38,50,0.72)",
    borderWidth: 1,
    borderColor: "rgba(161,230,222,0.24)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  cameraReadyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A77A54",
    marginRight: 8,
  },

  cameraReadyDotOn: {
    backgroundColor: "#60D5AF",
  },

  cameraInstructionText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    color: "#E5F0F2",
  },

  lastShotPreview: {
    position: "absolute",
    left: 11,
    top: 11,
    width: 55,
    height: 67,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#E8FFFA",
    backgroundColor: "#172A3B",
  },

  lastShotImage: {
    width: "100%",
    height: "100%",
  },

  lastShotText: {
    position: "absolute",
    left: 4,
    bottom: 4,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 2,
  },

  captureControls: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },

  secondaryCaptureButton: {
    width: 80,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#41596A",
    backgroundColor: "#213949",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryCaptureText: {
    marginTop: 4,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    color: "#C2D4DB",
  },

  galleryIcon: {
    width: 22,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#85D8D1",
    overflow: "hidden",
    position: "relative",
  },

  galleryMountainOne: {
    position: "absolute",
    left: 1,
    bottom: -2,
    width: 11,
    height: 11,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#6FC6C1",
  },

  galleryMountainTwo: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 9,
    height: 9,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#A5E5D9",
  },

  shutterWrap: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
  },

  shutterPressed: {
    transform: [{ scale: 0.95 }],
  },

  shutterPulse: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: "#58D1CB",
  },

  shutterOuter: {
    width: 66,
    height: 66,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#D8F7F1",
    backgroundColor: "#286270",
    alignItems: "center",
    justifyContent: "center",
  },

  shutterInner: {
    width: 51,
    height: 51,
    borderRadius: 18,
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
  },

  controlMeta: {
    width: 80,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#41596A",
    backgroundColor: "#213949",
    alignItems: "center",
    justifyContent: "center",
  },

  controlMetaTop: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    color: "#C2D4DB",
  },

  controlMetaBottom: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: "900",
    color: "#71DBD3",
  },

  controlDisabled: {
    opacity: 0.48,
  },

  scanIcon: {
    width: 31,
    height: 31,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  scanIconSmall: {
    transform: [{ scale: 0.74 }],
  },

  scanCorner: {
    position: "absolute",
    width: 10,
    height: 10,
    borderColor: "#ECFFFF",
  },

  scanTL: {
    left: 0,
    top: 0,
    borderLeftWidth: 2,
    borderTopWidth: 2,
  },

  scanTR: {
    right: 0,
    top: 0,
    borderRightWidth: 2,
    borderTopWidth: 2,
  },

  scanBL: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
  },

  scanBR: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },

  scanCenter: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EFFFFD",
  },

  messageBar: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: "#F9FCFD",
    borderWidth: 1,
    borderColor: "#CFDEE4",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    overflow: "hidden",
  },

  messageAccent: {
    alignSelf: "stretch",
    width: 4,
    backgroundColor: "#42AAA9",
    marginRight: 10,
  },

  messageText: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    color: "#516A78",
  },

  messageClose: {
    marginLeft: 8,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "300",
    color: "#7C909B",
  },

  progressCard: {
    marginTop: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D5E2E7",
    backgroundColor: "#F9FCFD",
    padding: 13,
  },

  progressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  minimumPill: {
    maxWidth: 130,
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: "#FFF1DC",
    borderWidth: 1,
    borderColor: "#F2D5A8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  minimumPillReady: {
    backgroundColor: "#E7F6EE",
    borderColor: "#BCE4CE",
  },

  minimumPillText: {
    textAlign: "center",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    color: "#95682A",
  },

  minimumPillTextReady: {
    color: "#2C7654",
  },

  evidenceTrackWrap: {
    marginTop: 15,
  },

  evidenceTrack: {
    flexDirection: "row",
    gap: 4,
  },

  evidenceSegment: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DFE8EB",
  },

  evidenceSegmentFilled: {
    backgroundColor: "#4ABBA8",
  },

  evidenceMinimumSegment: {
    borderWidth: 1,
    borderColor: "#356D70",
  },

  minimumLegend: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  minimumLegendLine: {
    width: 24,
    height: 1,
    backgroundColor: "#55777E",
    marginRight: 6,
  },

  minimumLegendText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    color: "#798E99",
  },

  progressStats: {
    marginTop: 14,
    flexDirection: "row",
    gap: 7,
  },

  progressStat: {
    flex: 1,
    minHeight: 67,
    borderRadius: 14,
    backgroundColor: "#EEF4F6",
    borderWidth: 1,
    borderColor: "#DCE7EA",
    alignItems: "center",
    justifyContent: "center",
  },

  progressStatValue: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "900",
    color: "#48606E",
  },

  progressStatValueGood: {
    color: "#277A58",
  },

  progressStatValueBad: {
    color: "#A75B4D",
  },

  progressStatLabel: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    color: "#81939D",
  },

  analysisHint: {
    marginTop: 12,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
    color: "#687E8B",
  },

  truthNote: {
    marginTop: 9,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#E7F1F4",
    borderWidth: 1,
    borderColor: "#CFE0E5",
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
  },

  truthMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#294C5D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  truthMarkText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
    color: "#DDF7F3",
  },

  truthText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    color: "#617984",
  },

  analyzeButton: {
    marginTop: 12,
    minHeight: 66,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#CAD8DD",
    backgroundColor: "#DEE6E9",
  },

  analyzeButtonReady: {
    borderColor: "#236E72",
    backgroundColor: "#173A4A",
  },

  analyzeButtonDisabled: {
    opacity: 0.62,
  },

  analyzeIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  analyzeCopy: {
    flex: 1,
    minWidth: 0,
  },

  analyzeTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: "#F0FAFB",
  },

  analyzeSub: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: "#9FB8C2",
  },

  analyzeArrow: {
    marginLeft: 8,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "300",
    color: "#75DDD5",
  },

  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.988 }],
  },

  ambientOne: {
    position: "absolute",
    top: 55,
    right: -130,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#D2F0E8",
    opacity: 0.42,
  },

  ambientTwo: {
    position: "absolute",
    top: 560,
    left: -120,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#D6E9F3",
    opacity: 0.44,
  },
});
