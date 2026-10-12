import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Language = "en" | "te";
type Filter = "ALL" | "IN_PROGRESS" | "ANALYZED" | "FAILED";

type BlockStatus =
  | "REGISTERED"
  | "CAPTURE_IN_PROGRESS"
  | "READY_FOR_ANALYSIS"
  | "ANALYZING"
  | "ANALYZED"
  | "ANALYSIS_FAILED"
  | "VERIFIED"
  | "FLAGGED"
  | string;

type BlockOut = {
  id: string;
  block_code: string;
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  operator_id: string;
  notes?: string | null;
  status: BlockStatus;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  gps_captured_at?: string | null;
};

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
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
};

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  newScan: string;
  search: string;
  searchPlaceholder: string;
  all: string;
  progress: string;
  analyzed: string;
  failed: string;
  total: string;
  active: string;
  verified: string;
  register: string;
  quarry: string;
  granite: string;
  captured: string;
  gps: string;
  gpsRecorded: string;
  gpsMissing: string;
  operator: string;
  open: string;
  retry: string;
  emptyTitle: string;
  emptyText: string;
  noMatchTitle: string;
  noMatchText: string;
  backendTruth: string;
  selectedOperator: string;
  noOperator: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "FIELD REGISTER / MOBILE",
    title: "Granite Blocks",
    subtitle: "Real block records, capture state and analysis status from the backend.",
    newScan: "New scan",
    search: "Search",
    searchPlaceholder: "Block, quarry, category or status",
    all: "All",
    progress: "In progress",
    analyzed: "Analyzed",
    failed: "Failed",
    total: "Total",
    active: "Active",
    verified: "Verified",
    register: "Register",
    quarry: "Quarry",
    granite: "Granite",
    captured: "Captured",
    gps: "GPS",
    gpsRecorded: "Recorded",
    gpsMissing: "Not recorded",
    operator: "Operator",
    open: "Open block",
    retry: "Retry",
    emptyTitle: "No granite blocks yet",
    emptyText: "Create the first field capture from the Scan tab. No sample blocks are generated here.",
    noMatchTitle: "No matching blocks",
    noMatchText: "Change the search text or status filter.",
    backendTruth: "Statuses shown here are backend record states. ANALYZED is not the same as physically VERIFIED.",
    selectedOperator: "Device operator",
    noOperator: "No operator selected",
  },
  te: {
    eyebrow: "ఫీల్డ్ రిజిస్టర్ / మొబైల్",
    title: "గ్రానైట్ బ్లాక్స్",
    subtitle: "బ్యాక్‌ఎండ్‌లో ఉన్న నిజమైన బ్లాక్ రికార్డులు, క్యాప్చర్ స్థితి మరియు విశ్లేషణ స్థితి.",
    newScan: "కొత్త స్కాన్",
    search: "శోధన",
    searchPlaceholder: "బ్లాక్, క్వారీ, వర్గం లేదా స్థితి",
    all: "అన్నీ",
    progress: "ప్రక్రియలో",
    analyzed: "విశ్లేషించబడింది",
    failed: "విఫలమైంది",
    total: "మొత్తం",
    active: "యాక్టివ్",
    verified: "ధృవీకరించబడింది",
    register: "రిజిస్టర్",
    quarry: "క్వారీ",
    granite: "గ్రానైట్",
    captured: "క్యాప్చర్",
    gps: "GPS",
    gpsRecorded: "నమోదైంది",
    gpsMissing: "నమోదు కాలేదు",
    operator: "ఆపరేటర్",
    open: "బ్లాక్ తెరవండి",
    retry: "మళ్లీ ప్రయత్నించు",
    emptyTitle: "ఇంకా గ్రానైట్ బ్లాక్స్ లేవు",
    emptyText: "Scan ట్యాబ్ నుండి మొదటి ఫీల్డ్ క్యాప్చర్ సృష్టించండి. ఇక్కడ డమ్మీ బ్లాక్స్ సృష్టించబడవు.",
    noMatchTitle: "సరిపోలే బ్లాక్స్ లేవు",
    noMatchText: "శోధన పదం లేదా స్థితి ఫిల్టర్ మార్చండి.",
    backendTruth: "ఇక్కడ చూపే స్థితులు బ్యాక్‌ఎండ్ రికార్డ్ స్థితులు. ANALYZED అంటే భౌతికంగా VERIFIED అని కాదు.",
    selectedOperator: "డివైస్ ఆపరేటర్",
    noOperator: "ఆపరేటర్ ఎంచుకోలేదు",
  },
};

const FILTERS: Array<{ key: Filter; en: string; te: string }> = [
  { key: "ALL", en: "All", te: "అన్నీ" },
  { key: "IN_PROGRESS", en: "In progress", te: "ప్రక్రియలో" },
  { key: "ANALYZED", en: "Analyzed", te: "విశ్లేషణ" },
  { key: "FAILED", en: "Failed", te: "విఫలం" },
];

const LANGUAGE_KEY = "granitemeasure.mobile.language";
const SELECTED_USER_KEY = "granitemeasure.mobile.selectedUserId";

const RAW_API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8000";

const SERVER_ROOT = RAW_API_BASE
  .replace(/\/api\/v1\/?$/i, "")
  .replace(/\/+$/, "");

const API_ROOT = `${SERVER_ROOT}/api/v1`;

export default function BlocksScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 390;

  const [language, setLanguage] = useState<Language>("en");
  const copy = COPY[language];

  const [blocks, setBlocks] = useState<BlockOut[]>([]);
  const [quarries, setQuarries] = useState<Quarry[]>([]);
  const [categories, setCategories] = useState<GraniteCategory[]>([]);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLanguage = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
      if (stored === "en" || stored === "te") {
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
      // Keep the in-memory selection.
    }
  }, [language]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [storedUserId, blockResult, quarryResult, categoryResult, userResult] =
        await Promise.all([
          SecureStore.getItemAsync(SELECTED_USER_KEY).catch(() => null),
          requestJson<BlockOut[]>("/granite-blocks"),
          requestJson<Quarry[]>("/quarries"),
          requestJson<GraniteCategory[]>("/granite-categories"),
          requestJson<DemoUser[]>("/demo-users"),
        ]);

      const blockValues = Array.isArray(blockResult) ? blockResult : [];
      const quarryValues = Array.isArray(quarryResult) ? quarryResult : [];
      const categoryValues = Array.isArray(categoryResult) ? categoryResult : [];
      const userValues = Array.isArray(userResult) ? userResult : [];

      setBlocks(blockValues);
      setQuarries(quarryValues);
      setCategories(categoryValues);
      setUsers(userValues);

      setSelectedUserId(
        storedUserId && userValues.some((user) => user.id === storedUserId)
          ? storedUserId
          : "",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLanguage();
    void loadData();
  }, [loadData, loadLanguage]);

  const quarryMap = useMemo(
    () => new Map(quarries.map((quarry) => [quarry.id, quarry])),
    [quarries],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const selectedOperator = selectedUserId
    ? userMap.get(selectedUserId) ?? null
    : null;

  const counts = useMemo(() => {
    return {
      total: blocks.length,
      active: blocks.filter((block) => isInProgress(block.status)).length,
      analyzed: blocks.filter((block) => isAnalyzed(block.status)).length,
      verified: blocks.filter(
        (block) => normalize(block.status) === "VERIFIED",
      ).length,
    };
  }, [blocks]);

  const visibleBlocks = useMemo(() => {
    const needle = normalize(query);

    return [...blocks]
      .filter((block) => {
        if (!matchesFilter(block.status, filter)) {
          return false;
        }

        if (!needle) {
          return true;
        }

        const quarry = quarryMap.get(block.quarry_id);
        const category = categoryMap.get(block.granite_category_id);
        const operator = userMap.get(block.operator_id);

        const haystack = [
          block.block_code,
          block.status,
          block.id,
          quarryName(quarry),
          quarry?.quarry_code,
          quarry?.lease_id,
          quarry?.district,
          category?.code,
          category?.name,
          operator?.name,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toUpperCase();

        return haystack.includes(needle);
      })
      .sort((a, b) => dateValue(b.capture_date) - dateValue(a.capture_date));
  }, [blocks, categoryMap, filter, quarryMap, query, userMap]);

  const openBlock = useCallback(
    (block: BlockOut) => {
      router.push(
        {
          pathname: "/blocks/[id]",
          params: { id: block.id },
        },
      );
    },
    [],
  );

  const newScan = useCallback(() => {
    router.push("/capture");
  }, []);

  return (
    <View style={styles.screen}>
      <AmbientBackground />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadData(true)}
            tintColor="#168C93"
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 10) + 2,
            paddingBottom: Math.max(insets.bottom, 14) + 120,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
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

        <View style={styles.operatorRail}>
          <View style={styles.operatorRailLeft}>
            <View
              style={[
                styles.operatorDot,
                selectedOperator && styles.operatorDotReady,
              ]}
            />
            <View style={styles.operatorTextWrap}>
              <Text style={styles.operatorLabel}>{copy.selectedOperator}</Text>
              <Text numberOfLines={1} style={styles.operatorValue}>
                {selectedOperator
                  ? `${selectedOperator.name} · ${selectedOperator.role || "USER"}`
                  : copy.noOperator}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={newScan}
            style={({ pressed }) => [
              styles.newScanButton,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.scanMiniIcon}>
              <View style={styles.scanMiniInner} />
            </View>
            <Text style={styles.newScanText}>{copy.newScan}</Text>
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard label={copy.total} value={counts.total} tone="neutral" />
          <MetricCard label={copy.active} value={counts.active} tone="active" />
          <MetricCard label={copy.analyzed} value={counts.analyzed} tone="good" />
          <MetricCard label={copy.verified} value={counts.verified} tone="verified" />
        </View>

        <View style={styles.truthNote}>
          <View style={styles.truthIcon}>
            <Text style={styles.truthIconText}>i</Text>
          </View>
          <Text style={styles.truthText}>{copy.backendTruth}</Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.sectionEyebrow}>01 / REGISTER</Text>

          <View style={styles.searchBox}>
            <SearchGlyph />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.searchPlaceholder}
              placeholderTextColor="#8EA0AD"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} style={styles.clearButton}>
                <Text style={styles.clearText}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRail}
          >
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setFilter(item.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && styles.filterChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {language === "te" ? item.te : item.en}
                  </Text>
                  <View
                    style={[
                      styles.filterCount,
                      active && styles.filterCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        active && styles.filterCountTextActive,
                      ]}
                    >
                      {filterCount(item.key, blocks)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorMark}>
              <Text style={styles.errorMarkText}>!</Text>
            </View>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Backend connection error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              onPress={() => void loadData()}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryText}>{copy.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#168C93" />
            <View style={styles.loadingCopy}>
              <View style={styles.skeletonWide} />
              <View style={styles.skeletonShort} />
            </View>
          </View>
        ) : visibleBlocks.length === 0 ? (
          <EmptyState
            filtered={blocks.length > 0}
            title={blocks.length > 0 ? copy.noMatchTitle : copy.emptyTitle}
            text={blocks.length > 0 ? copy.noMatchText : copy.emptyText}
            onNewScan={newScan}
            newScanLabel={copy.newScan}
          />
        ) : (
          <View style={styles.list}>
            {visibleBlocks.map((block, index) => (
              <Animated.View
                key={block.id}
                entering={FadeInDown.delay(Math.min(index, 8) * 55).duration(360)}
              >
                <BlockCard
                  block={block}
                  quarry={quarryMap.get(block.quarry_id)}
                  category={categoryMap.get(block.granite_category_id)}
                  operator={userMap.get(block.operator_id)}
                  language={language}
                  copy={copy}
                  compact={compact}
                  onPress={() => openBlock(block)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BlockCard({
  block,
  quarry,
  category,
  operator,
  language,
  copy,
  compact,
  onPress,
}: {
  block: BlockOut;
  quarry?: Quarry;
  category?: GraniteCategory;
  operator?: DemoUser;
  language: Language;
  copy: Copy;
  compact: boolean;
  onPress: () => void;
}) {
  const status = statusMeta(block.status, language);
  const hasGps =
    typeof block.latitude === "number" &&
    typeof block.longitude === "number";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.blockCard,
        pressed && styles.blockCardPressed,
      ]}
    >
      <View style={styles.blockCardTop}>
        <View style={styles.blockIdentity}>
          <View style={styles.blockGlyph}>
            <View style={styles.blockGlyphTop} />
            <View style={styles.blockGlyphFace} />
          </View>

          <View style={styles.blockIdentityText}>
            <Text style={styles.blockCode} numberOfLines={1}>
              {block.block_code || shortId(block.id)}
            </Text>
            <Text style={styles.blockId} numberOfLines={1}>
              ID · {shortId(block.id)}
            </Text>
          </View>
        </View>

        <View style={[styles.statusPill, status.pillStyle]}>
          <View style={[styles.statusDot, status.dotStyle]} />
          <Text style={[styles.statusText, status.textStyle]}>
            {status.label}
          </Text>
        </View>
      </View>

      <View style={styles.blockMainInfo}>
        <Text style={styles.quarryName} numberOfLines={1}>
          {quarryName(quarry)}
        </Text>
        <Text style={styles.categoryName} numberOfLines={1}>
          {categoryLabel(category)}
        </Text>
      </View>

      <View style={styles.blockDivider} />

      <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
        <DetailCell
          label={copy.captured}
          value={formatDate(block.capture_date, language)}
        />
        <DetailCell
          label={copy.gps}
          value={hasGps ? copy.gpsRecorded : copy.gpsMissing}
          valueTone={hasGps ? "good" : "muted"}
        />
        <DetailCell
          label={copy.operator}
          value={operator?.name || shortId(block.operator_id)}
        />
      </View>

      {block.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {block.notes}
        </Text>
      ) : null}

      <View style={styles.openRow}>
        <View style={styles.openLine} />
        <Text style={styles.openText}>{copy.open}</Text>
        <Text style={styles.openArrow}>›</Text>
      </View>
    </Pressable>
  );
}

function DetailCell({
  label,
  value,
  valueTone = "normal",
}: {
  label: string;
  value: string;
  valueTone?: "normal" | "good" | "muted";
}) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label.toUpperCase()}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.detailValue,
          valueTone === "good" && styles.detailValueGood,
          valueTone === "muted" && styles.detailValueMuted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "active" | "good" | "verified";
}) {
  return (
    <View
      style={[
        styles.metricCard,
        tone === "active" && styles.metricCardActive,
        tone === "good" && styles.metricCardGood,
        tone === "verified" && styles.metricCardVerified,
      ]}
    >
      <Text
        style={[
          styles.metricValue,
          tone === "active" && styles.metricValueActive,
          tone === "good" && styles.metricValueGood,
          tone === "verified" && styles.metricValueVerified,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EmptyState({
  filtered,
  title,
  text,
  onNewScan,
  newScanLabel,
}: {
  filtered: boolean;
  title: string;
  text: string;
  onNewScan: () => void;
  newScanLabel: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyGraphic}>
        <View style={styles.emptyStoneOne} />
        <View style={styles.emptyStoneTwo} />
        <View style={styles.emptyScanCornerTL} />
        <View style={styles.emptyScanCornerBR} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {!filtered ? (
        <Pressable
          onPress={onNewScan}
          style={({ pressed }) => [
            styles.emptyAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emptyActionText}>{newScanLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SearchGlyph() {
  return (
    <View style={styles.searchGlyph}>
      <View style={styles.searchCircle} />
      <View style={styles.searchHandle} />
    </View>
  );
}

function AmbientBackground() {
  const motion = useSharedValue(0);

  useEffect(() => {
    motion.value = withRepeat(
      withTiming(1, {
        duration: 10_000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [motion]);

  const first = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(motion.value, [0, 1], [-14, 30]),
      },
      {
        translateY: interpolate(motion.value, [0, 1], [-8, 24]),
      },
    ],
  }));

  const second = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(motion.value, [0, 1], [22, -18]),
      },
      {
        translateY: interpolate(motion.value, [0, 1], [20, -12]),
      },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.ambientOne, first]} />
      <Animated.View style={[styles.ambientTwo, second]} />
    </View>
  );
}

function matchesFilter(status: BlockStatus, filter: Filter): boolean {
  if (filter === "ALL") {
    return true;
  }
  if (filter === "IN_PROGRESS") {
    return isInProgress(status);
  }
  if (filter === "ANALYZED") {
    return isAnalyzed(status);
  }
  return isFailed(status);
}

function filterCount(filter: Filter, blocks: BlockOut[]): number {
  return blocks.filter((block) => matchesFilter(block.status, filter)).length;
}

function isInProgress(status: BlockStatus): boolean {
  return [
    "REGISTERED",
    "CAPTURE_IN_PROGRESS",
    "READY_FOR_ANALYSIS",
    "ANALYZING",
  ].includes(normalize(status));
}

function isAnalyzed(status: BlockStatus): boolean {
  return ["ANALYZED", "VERIFIED"].includes(normalize(status));
}

function isFailed(status: BlockStatus): boolean {
  return ["ANALYSIS_FAILED", "FLAGGED"].includes(normalize(status));
}

function statusMeta(status: BlockStatus, language: Language) {
  const normalized = normalize(status);

  if (normalized === "VERIFIED") {
    return {
      label: language === "te" ? "ధృవీకరించబడింది" : "VERIFIED",
      pillStyle: styles.statusPillVerified,
      dotStyle: styles.statusDotVerified,
      textStyle: styles.statusTextVerified,
    };
  }

  if (normalized === "ANALYZED") {
    return {
      label: language === "te" ? "విశ్లేషించబడింది" : "ANALYZED",
      pillStyle: styles.statusPillAnalyzed,
      dotStyle: styles.statusDotAnalyzed,
      textStyle: styles.statusTextAnalyzed,
    };
  }

  if (normalized === "ANALYZING") {
    return {
      label: language === "te" ? "విశ్లేషణలో" : "ANALYZING",
      pillStyle: styles.statusPillActive,
      dotStyle: styles.statusDotActive,
      textStyle: styles.statusTextActive,
    };
  }

  if (normalized === "ANALYSIS_FAILED" || normalized === "FLAGGED") {
    return {
      label:
        normalized === "FLAGGED"
          ? language === "te"
            ? "ఫ్లాగ్ చేయబడింది"
            : "FLAGGED"
          : language === "te"
            ? "విశ్లేషణ విఫలం"
            : "FAILED",
      pillStyle: styles.statusPillFailed,
      dotStyle: styles.statusDotFailed,
      textStyle: styles.statusTextFailed,
    };
  }

  if (normalized === "READY_FOR_ANALYSIS") {
    return {
      label: language === "te" ? "విశ్లేషణకు సిద్ధం" : "READY",
      pillStyle: styles.statusPillReady,
      dotStyle: styles.statusDotReady,
      textStyle: styles.statusTextReady,
    };
  }

  if (normalized === "CAPTURE_IN_PROGRESS") {
    return {
      label: language === "te" ? "క్యాప్చర్‌లో" : "CAPTURING",
      pillStyle: styles.statusPillActive,
      dotStyle: styles.statusDotActive,
      textStyle: styles.statusTextActive,
    };
  }

  return {
    label: language === "te" ? "రిజిస్టర్" : normalized || "REGISTERED",
    pillStyle: styles.statusPillNeutral,
    dotStyle: styles.statusDotNeutral,
    textStyle: styles.statusTextNeutral,
  };
}

function quarryName(quarry: Quarry | undefined): string {
  if (!quarry) {
    return "Quarry unavailable";
  }

  return (
    quarry.quarry_name ||
    quarry.name ||
    quarry.quarry_code ||
    `Quarry ${shortId(quarry.id)}`
  );
}

function categoryLabel(category: GraniteCategory | undefined): string {
  if (!category) {
    return "Granite category unavailable";
  }
  if (category.code && category.name) {
    return `${category.code} · ${category.name}`;
  }
  return category.code || category.name || `Category ${shortId(category.id)}`;
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return value.length <= 8 ? value : value.slice(0, 8);
}

function dateValue(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string, language: Language): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    }).format(parsed);
  } catch {
    return parsed.toLocaleDateString();
  }
}

async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const { timeoutMs = 20_000, ...requestInit } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        // Keep the server body.
      }
      throw new Error(detail || `Request failed with HTTP ${response.status}.`);
    }

    if (!raw) {
      return undefined as T;
    }
    return JSON.parse(raw) as T;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error(`Request timed out while connecting to ${SERVER_ROOT}.`);
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load granite block records.";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EDF3F6",
  },
  content: {
    paddingHorizontal: 12,
  },
  header: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
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
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -1.05,
    color: "#172A3B",
  },
  subtitle: {
    marginTop: 5,
    maxWidth: 300,
    fontSize: 11.5,
    lineHeight: 16.5,
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
  operatorRail: {
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: "#1A3142",
    borderWidth: 1,
    borderColor: "#314C5E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  operatorRailLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  operatorDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#7890A0",
    marginRight: 9,
  },
  operatorDotReady: {
    backgroundColor: "#6FD8C5",
  },
  operatorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  operatorLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
    color: "#8FA7B7",
  },
  operatorValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#EFF8FB",
  },
  newScanButton: {
    height: 38,
    borderRadius: 12,
    backgroundColor: "#E8FFFA",
    borderWidth: 1,
    borderColor: "#8FDED0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  scanMiniIcon: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  scanMiniInner: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: "#168C93",
  },
  newScanText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: "#176E74",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 9,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D8E3E8",
    backgroundColor: "#F9FCFD",
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "space-between",
  },
  metricCardActive: {
    borderColor: "#C7D8E3",
    backgroundColor: "#F0F6F9",
  },
  metricCardGood: {
    borderColor: "#BBDDD8",
    backgroundColor: "#F0FAF8",
  },
  metricCardVerified: {
    borderColor: "#D6D2B1",
    backgroundColor: "#FBFAF0",
  },
  metricValue: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.6,
    color: "#20384A",
  },
  metricValueActive: {
    color: "#456A82",
  },
  metricValueGood: {
    color: "#168C7C",
  },
  metricValueVerified: {
    color: "#857D3F",
  },
  metricLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: "#7A8E9B",
  },
  truthNote: {
    borderRadius: 14,
    backgroundColor: "#E5F3F2",
    borderWidth: 1,
    borderColor: "#C8E5E1",
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 9,
  },
  truthIcon: {
    width: 18,
    height: 18,
    borderRadius: 99,
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  truthIconText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: "#F3FFFF",
  },
  truthText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14.5,
    fontWeight: "600",
    color: "#416A6E",
  },
  searchCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D6E1E7",
    backgroundColor: "rgba(250,253,254,0.96)",
    padding: 11,
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
    color: "#6F8795",
    marginBottom: 7,
  },
  searchBox: {
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D3E0E6",
    backgroundColor: "#F2F7F9",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  searchGlyph: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  searchCircle: {
    position: "absolute",
    left: 1,
    top: 1,
    width: 11,
    height: 11,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: "#64808F",
  },
  searchHandle: {
    position: "absolute",
    width: 7,
    height: 1.5,
    backgroundColor: "#64808F",
    left: 10,
    top: 12,
    transform: [{ rotate: "45deg" }],
    borderRadius: 2,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingVertical: 0,
    fontSize: 11,
    fontWeight: "700",
    color: "#203747",
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#E4ECEF",
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    marginTop: -2,
    fontSize: 19,
    lineHeight: 21,
    color: "#65808F",
  },
  filterRail: {
    gap: 6,
    paddingTop: 8,
  },
  filterChip: {
    minHeight: 31,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5E0E5",
    backgroundColor: "#F7FAFB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  filterChipActive: {
    borderColor: "#75CBC2",
    backgroundColor: "#E7F8F5",
  },
  filterText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    color: "#667D8B",
  },
  filterTextActive: {
    color: "#176E74",
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 99,
    backgroundColor: "#E5ECEF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 6,
  },
  filterCountActive: {
    backgroundColor: "#BFE8E1",
  },
  filterCountText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    color: "#6C7E89",
  },
  filterCountTextActive: {
    color: "#176E74",
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E7C4BE",
    backgroundColor: "#FFF5F2",
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginBottom: 10,
  },
  errorMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#C86758",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  errorMarkText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  errorTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: "#8E4D43",
  },
  errorText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "600",
    color: "#99685F",
  },
  retryButton: {
    height: 31,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D99D93",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  retryText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#A05044",
  },
  loadingCard: {
    minHeight: 90,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#D8E2E7",
    backgroundColor: "#FAFCFD",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  loadingCopy: {
    flex: 1,
    marginLeft: 12,
  },
  skeletonWide: {
    width: "72%",
    height: 10,
    borderRadius: 99,
    backgroundColor: "#DDE8EC",
  },
  skeletonShort: {
    width: "48%",
    height: 8,
    borderRadius: 99,
    backgroundColor: "#E7EEF1",
    marginTop: 8,
  },
  list: {
    gap: 9,
  },
  blockCard: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#D2DEE4",
    backgroundColor: "rgba(250,253,254,0.97)",
    padding: 12,
  },
  blockCardPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.93,
  },
  blockCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  blockGlyph: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#1A3142",
    overflow: "hidden",
    marginRight: 9,
  },
  blockGlyphTop: {
    position: "absolute",
    width: 24,
    height: 9,
    left: 6,
    top: 7,
    backgroundColor: "#77909A",
    transform: [{ skewX: "-16deg" }],
    borderRadius: 3,
  },
  blockGlyphFace: {
    position: "absolute",
    width: 24,
    height: 14,
    left: 6,
    top: 16,
    backgroundColor: "#A7BCC3",
    borderRadius: 3,
  },
  blockIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  blockCode: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: -0.35,
    color: "#203647",
  },
  blockId: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#8A9BA6",
  },
  statusPill: {
    minHeight: 26,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    marginRight: 5,
  },
  statusText: {
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.45,
  },
  statusPillNeutral: { backgroundColor: "#F0F4F6", borderColor: "#D5E0E5" },
  statusDotNeutral: { backgroundColor: "#8397A3" },
  statusTextNeutral: { color: "#627784" },
  statusPillActive: { backgroundColor: "#EFF6FA", borderColor: "#C5D9E4" },
  statusDotActive: { backgroundColor: "#4E819E" },
  statusTextActive: { color: "#456E85" },
  statusPillReady: { backgroundColor: "#FFF8E9", borderColor: "#E8D8A9" },
  statusDotReady: { backgroundColor: "#C99738" },
  statusTextReady: { color: "#8D6C2B" },
  statusPillAnalyzed: { backgroundColor: "#EDFAF7", borderColor: "#B7DED6" },
  statusDotAnalyzed: { backgroundColor: "#168C7C" },
  statusTextAnalyzed: { color: "#187468" },
  statusPillVerified: { backgroundColor: "#F7F7EA", borderColor: "#DCD7AD" },
  statusDotVerified: { backgroundColor: "#8A8242" },
  statusTextVerified: { color: "#746D36" },
  statusPillFailed: { backgroundColor: "#FFF2EF", borderColor: "#E8C0B9" },
  statusDotFailed: { backgroundColor: "#C65F51" },
  statusTextFailed: { color: "#9B4E43" },
  blockMainInfo: {
    marginTop: 11,
  },
  quarryName: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "900",
    color: "#294556",
  },
  categoryName: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#718592",
  },
  blockDivider: {
    height: 1,
    backgroundColor: "#E4ECEF",
    marginVertical: 9,
  },
  detailGrid: {
    flexDirection: "row",
    gap: 6,
  },
  detailGridCompact: {
    gap: 4,
  },
  detailCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#F1F6F8",
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#8A9BA5",
  },
  detailValue: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: "#465F6E",
  },
  detailValueGood: {
    color: "#168779",
  },
  detailValueMuted: {
    color: "#8799A4",
  },
  notes: {
    marginTop: 8,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "600",
    color: "#748895",
  },
  openRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  openLine: {
    width: 24,
    height: 1.5,
    borderRadius: 99,
    backgroundColor: "#6DC8BF",
    marginRight: 7,
  },
  openText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.45,
    color: "#27787C",
    textTransform: "uppercase",
  },
  openArrow: {
    marginTop: -2,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "500",
    color: "#4B8E91",
  },
  emptyCard: {
    minHeight: 250,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D5E0E5",
    backgroundColor: "rgba(249,252,253,0.96)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  emptyGraphic: {
    width: 82,
    height: 68,
    marginBottom: 12,
  },
  emptyStoneOne: {
    position: "absolute",
    left: 15,
    top: 18,
    width: 48,
    height: 35,
    borderRadius: 10,
    backgroundColor: "#B6C5CB",
    transform: [{ rotate: "-5deg" }],
  },
  emptyStoneTwo: {
    position: "absolute",
    left: 26,
    top: 8,
    width: 38,
    height: 20,
    borderRadius: 8,
    backgroundColor: "#8FA4AC",
    transform: [{ rotate: "7deg" }],
  },
  emptyScanCornerTL: {
    position: "absolute",
    left: 3,
    top: 2,
    width: 18,
    height: 18,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: "#168C93",
    borderTopLeftRadius: 7,
  },
  emptyScanCornerBR: {
    position: "absolute",
    right: 3,
    bottom: 2,
    width: 18,
    height: 18,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#168C93",
    borderBottomRightRadius: 7,
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: -0.35,
    color: "#2A4353",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 6,
    maxWidth: 290,
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#758A96",
    textAlign: "center",
  },
  emptyAction: {
    marginTop: 14,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyActionText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#F3FFFF",
  },
  ambientOne: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(107, 204, 194, 0.11)",
    right: -70,
    top: 70,
  },
  ambientTwo: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: "rgba(122, 151, 173, 0.08)",
    left: -100,
    top: 380,
  },
  pressed: {
    opacity: 0.75,
  },
});
