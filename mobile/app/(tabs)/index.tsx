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
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Language = "te" | "en";

type BlockItem = {
  id: string;
  block_code?: string | null;
  status?: string | null;
  capture_date?: string | null;
  quarry_id?: string | null;
  granite_category_id?: string | null;
};

type QuarryItem = {
  id: string;
  quarry_name?: string | null;
  name?: string | null;
  district?: string | null;
  mandal?: string | null;
  village?: string | null;
};

type CapabilityPayload = Record<string, unknown>;

const LANGUAGE_KEY =
  "granitemeasure.mobile.language";

const SELECTED_USER_KEY =
  "granitemeasure.mobile.selectedUserId";

const RAW_API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8000";

const SERVER_ROOT = RAW_API_BASE
  .replace(/\/api\/v1\/?$/i, "")
  .replace(/\/+$/, "");

const API_ROOT =
  `${SERVER_ROOT}/api/v1`;

// GRANITEMEASURE_DASHBOARD_STUNNING_MOTION_V7

const ANALYZED = new Set([
  "ANALYZED",
  "VERIFIED",
  "COMPLETED",
]);

const ACTIVE = new Set([
  "REGISTERED",
  "CAPTURE_IN_PROGRESS",
  "READY_FOR_ANALYSIS",
  "ANALYZING",
  "QUEUED",
  "PROCESSING",
  "RUNNING",
]);

const ATTENTION = new Set([
  "FAILED",
  "ERROR",
  "REJECTED",
  "ANALYSIS_FAILED",
]);

const COPY = {
  te: {
    brand: "GraniteMeasure AI",
    brandSub: "స్మార్ట్ గ్రానైట్ ఫీల్డ్ సిస్టమ్",
    heroKicker: "LIVE FIELD INTELLIGENCE",
    title: "ఫీల్డ్ నుంచి నిర్ణయం వరకు",
    subtitle:
      "క్యాప్చర్, AI విశ్లేషణ, 3D ఆధారం, కొలతలు — అన్నీ ఒకే ప్రవాహంలో.",
    newScan: "కొత్త స్కాన్",
    viewBlocks: "బ్లాక్స్ చూడండి",
    total: "మొత్తం బ్లాక్స్",
    analyzed: "విశ్లేషితం",
    active: "ప్రక్రియలో",
    quarries: "క్వారీలు",
    system: "సిస్టమ్",
    live: "లైవ్",
    pipeline: "ప్రస్తుత ప్రవాహం",
    pipelineSub: "తాజా బ్లాక్ ఏ దశలో ఉందో",
    stageRegistered: "రిజిస్టర్",
    stageCapture: "క్యాప్చర్",
    stageAnalyze: "AI విశ్లేషణ",
    stageResult: "ఫలితం",
    latest: "తాజా బ్లాక్",
    latestSub: "బ్యాక్‌ఎండ్‌లో ఉన్న నిజమైన తాజా రికార్డు",
    open: "తెరవండి",
    noBlock: "ఇంకా బ్లాక్ లేదు",
    quarryUnknown: "క్వారీ సమాచారం లేదు",
    aiTitle: "AI ఇంజిన్",
    aiSubReady: "వాయిస్ + విశ్లేషణ సేవలు సిద్ధంగా ఉన్నాయి",
    aiSubPartial: "అందుబాటులో ఉన్న సేవల ఆధారంగా స్థితి",
    aiCapabilities: "సామర్థ్యాలు",
    voiceReady: "వాయిస్ సిద్ధం",
    voiceOff: "వాయిస్ అందుబాటులో లేదు",
    attention: "దృష్టి అవసరం",
    attentionSub:
      "విఫలమైన లేదా తిరస్కరించిన బ్లాక్స్‌ను పరిశీలించండి.",
    retry: "మళ్లీ ప్రయత్నించండి",
    floatingAI: "తెలుగు AI",
    analyzedHint: "AI కోసం తాజా విశ్లేషిత బ్లాక్",
    statusAnalyzed: "విశ్లేషితం",
    statusAttention: "దృష్టి",
    statusProgress: "ప్రక్రియలో",
    statusRegistered: "రిజిస్టర్",
    synced: "సింక్",
    notSynced: "పాక్షికం",
  },
  en: {
    brand: "GraniteMeasure AI",
    brandSub: "SMART GRANITE FIELD SYSTEM",
    heroKicker: "LIVE FIELD INTELLIGENCE",
    title: "From field to decision",
    subtitle:
      "Capture, AI analysis, 3D evidence and measurements in one connected flow.",
    newScan: "New Scan",
    viewBlocks: "View Blocks",
    total: "Total Blocks",
    analyzed: "Analyzed",
    active: "In Progress",
    quarries: "Quarries",
    system: "System",
    live: "Live",
    pipeline: "Current Flow",
    pipelineSub: "Where the latest block is right now",
    stageRegistered: "Register",
    stageCapture: "Capture",
    stageAnalyze: "AI Analysis",
    stageResult: "Result",
    latest: "Latest Block",
    latestSub: "Latest real backend record",
    open: "Open",
    noBlock: "No block yet",
    quarryUnknown: "Quarry unavailable",
    aiTitle: "AI Engine",
    aiSubReady: "Voice + analysis services are ready",
    aiSubPartial: "Status based on available backend services",
    aiCapabilities: "capabilities",
    voiceReady: "Voice ready",
    voiceOff: "Voice unavailable",
    attention: "Needs attention",
    attentionSub:
      "Review failed or rejected blocks.",
    retry: "Retry",
    floatingAI: "Granite AI",
    analyzedHint: "Latest analyzed block for AI",
    statusAnalyzed: "ANALYZED",
    statusAttention: "ATTENTION",
    statusProgress: "IN PROGRESS",
    statusRegistered: "REGISTERED",
    synced: "SYNCED",
    notSynced: "PARTIAL",
  },
} as const;

async function requestJson<T>(
  path: string,
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
  });

  const selected =
    await SecureStore.getItemAsync(
      SELECTED_USER_KEY,
    ).catch(() => null);

  if (selected) {
    headers.set(
      "x-selected-user-id",
      selected,
    );
  }

  const response = await fetch(
    `${API_ROOT}${path}`,
    { headers },
  );

  if (!response.ok) {
    const body =
      await response.text().catch(
        () => "",
      );

    throw new Error(
      body ||
        `HTTP ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function normalize(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim().toUpperCase()
    : "";
}

function dateValue(
  value: unknown,
): number {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return 0;
  }

  const parsed = new Date(value);

  return Number.isNaN(
    parsed.getTime(),
  )
    ? 0
    : parsed.getTime();
}

function formatDate(
  value: unknown,
  language: Language,
): string {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return "—";
  }

  const parsed = new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return "—";
  }

  return parsed.toLocaleDateString(
    language === "te"
      ? "te-IN"
      : "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  );
}

function countOperational(
  value: unknown,
): number {
  if (!value) return 0;

  if (Array.isArray(value)) {
    return value.reduce(
      (count, item) =>
        count +
        countOperational(item),
      0,
    );
  }

  if (
    typeof value !== "object"
  ) {
    return 0;
  }

  let count = 0;

  Object.values(
    value as Record<
      string,
      unknown
    >,
  ).forEach((entry) => {
    if (
      entry &&
      typeof entry === "object"
    ) {
      const status =
        normalize(
          (
            entry as Record<
              string,
              unknown
            >
          ).status,
        );

      if (
        status === "OPERATIONAL" ||
        status === "AVAILABLE" ||
        status === "READY"
      ) {
        count += 1;
      }

      count +=
        countOperational(entry);
    }
  });

  return count;
}

function stageIndex(
  status: unknown,
): number {
  const value =
    normalize(status);

  if (
    ANALYZED.has(value)
  ) {
    return 3;
  }

  if (
    value === "ANALYZING" ||
    value === "QUEUED" ||
    value === "PROCESSING" ||
    value === "RUNNING" ||
    value === "READY_FOR_ANALYSIS"
  ) {
    return 2;
  }

  if (
    value === "CAPTURE_IN_PROGRESS"
  ) {
    return 1;
  }

  return 0;
}

function quarryLabel(
  quarry: QuarryItem | null,
): string {
  if (!quarry) return "";

  return (
    quarry.quarry_name ||
    quarry.name ||
    ""
  ).trim();
}

export default function DashboardScreen() {
  const insets =
    useSafeAreaInsets();

  const { width } =
    useWindowDimensions();

  const compact =
    width <= 390;

  const [language, setLanguage] =
    useState<Language>("te");

  const [blocks, setBlocks] =
    useState<BlockItem[]>([]);

  const [quarries, setQuarries] =
    useState<QuarryItem[]>([]);

  const [
    capabilities,
    setCapabilities,
  ] =
    useState<CapabilityPayload | null>(
      null,
    );

  const [
    voiceCapabilities,
    setVoiceCapabilities,
  ] =
    useState<CapabilityPayload | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const copy = COPY[language];

  useEffect(() => {
    void SecureStore.getItemAsync(
      LANGUAGE_KEY,
    )
      .then((saved) => {
        if (
          saved === "te" ||
          saved === "en"
        ) {
          setLanguage(saved);
        }
      })
      .catch(() => undefined);
  }, []);

  const load =
    useCallback(
      async (
        refresh = false,
      ) => {
        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const [
          blockResult,
          quarryResult,
          capabilityResult,
          voiceResult,
        ] =
          await Promise.allSettled([
            requestJson<BlockItem[]>(
              "/granite-blocks",
            ),
            requestJson<QuarryItem[]>(
              "/quarries",
            ),
            requestJson<CapabilityPayload>(
              "/capabilities",
            ),
            requestJson<CapabilityPayload>(
              "/voice/capabilities",
            ),
          ]);

        if (
          blockResult.status ===
          "fulfilled"
        ) {
          setBlocks(
            Array.isArray(
              blockResult.value,
            )
              ? blockResult.value
              : [],
          );
        }

        if (
          quarryResult.status ===
          "fulfilled"
        ) {
          setQuarries(
            Array.isArray(
              quarryResult.value,
            )
              ? quarryResult.value
              : [],
          );
        }

        if (
          capabilityResult.status ===
          "fulfilled"
        ) {
          setCapabilities(
            capabilityResult.value,
          );
        } else {
          setCapabilities(null);
        }

        if (
          voiceResult.status ===
          "fulfilled"
        ) {
          setVoiceCapabilities(
            voiceResult.value,
          );
        } else {
          setVoiceCapabilities(null);
        }

        if (
          blockResult.status ===
            "rejected" ||
          quarryResult.status ===
            "rejected"
        ) {
          setError(
            language === "te"
              ? "డాష్‌బోర్డ్ డేటాలో కొంత భాగం లోడ్ కాలేదు."
              : "Some dashboard data could not be loaded.",
          );
        }

        setLoading(false);
        setRefreshing(false);
      },
      [language],
    );

  useEffect(() => {
    void load();
  }, [load]);

  const metrics =
    useMemo(() => {
      let analyzed = 0;
      let active = 0;
      let attention = 0;

      blocks.forEach((block) => {
        const status =
          normalize(block.status);

        if (
          ANALYZED.has(status)
        ) {
          analyzed += 1;
        } else if (
          ACTIVE.has(status)
        ) {
          active += 1;
        } else if (
          ATTENTION.has(status)
        ) {
          attention += 1;
        }
      });

      return {
        total: blocks.length,
        analyzed,
        active,
        attention,
      };
    }, [blocks]);

  const sortedBlocks =
    useMemo(
      () =>
        [...blocks].sort(
          (a, b) =>
            dateValue(
              b.capture_date,
            ) -
            dateValue(
              a.capture_date,
            ),
        ),
      [blocks],
    );

  const latestBlock =
    sortedBlocks[0] ??
    null;

  const latestAnalyzed =
    useMemo(
      () =>
        sortedBlocks.find(
          (block) =>
            ANALYZED.has(
              normalize(
                block.status,
              ),
            ),
        ) ?? null,
      [sortedBlocks],
    );

  const latestQuarry =
    useMemo(
      () =>
        latestBlock?.quarry_id
          ? quarries.find(
              (item) =>
                item.id ===
                latestBlock.quarry_id,
            ) ?? null
          : null,
      [
        latestBlock,
        quarries,
      ],
    );

  const operationalAI =
    useMemo(
      () =>
        countOperational(
          capabilities,
        ),
      [capabilities],
    );

  const sttReady =
    voiceCapabilities
      ?.stt_whisper_available ===
    true;

  const ttsReady =
    voiceCapabilities
      ?.tts_edge_available ===
    true;

  const voiceReady =
    sttReady && ttsReady;

  const currentStage =
    stageIndex(
      latestBlock?.status,
    );

  const toggleLanguage =
    useCallback(async () => {
      const next: Language =
        language === "te"
          ? "en"
          : "te";

      setLanguage(next);

      await SecureStore
        .setItemAsync(
          LANGUAGE_KEY,
          next,
        )
        .catch(
          () => undefined,
        );
    }, [language]);

  const openAI =
    useCallback(() => {
      if (!latestAnalyzed) {
        router.push(
          "/blocks" as never,
        );
        return;
      }

      const query =
        `/ai-assistant?blockId=${encodeURIComponent(
          latestAnalyzed.id,
        )}&blockCode=${encodeURIComponent(
          latestAnalyzed.block_code ||
            "",
        )}&voice=1&language=${language}`;

      router.push(
        query as never,
      );
    }, [
      language,
      latestAnalyzed,
    ]);

  return (
    <View
      style={styles.screen}
    >
      <AmbientMotion />

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() =>
              void load(true)
            }
            tintColor="#15949B"
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:
              Math.max(
                insets.top,
                12,
              ) + 3,
            paddingBottom:
              Math.max(
                insets.bottom,
                12,
              ) + 138,
          },
        ]}
      >
        <Animated.View
          entering={FadeInDown
            .duration(360)
            .springify()
            .damping(18)}
          style={styles.header}
        >
          <View
            style={styles.brandRow}
          >
            <AnimatedLogo />

            <View
              style={styles.flexOne}
            >
              <Text
                style={
                  styles.brandName
                }
              >
                {copy.brand}
              </Text>

              <Text
                style={
                  styles.brandSub
                }
              >
                {copy.brandSub}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() =>
              void toggleLanguage()
            }
            style={({
              pressed,
            }) => [
              styles.languageButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.languageText
              }
            >
              {language === "te"
                ? "TE · EN"
                : "EN · TE"}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInUp
            .delay(60)
            .duration(440)
            .springify()
            .damping(18)}
          style={styles.hero}
        >
          <HeroMotion />

          <View
            style={[
              styles.heroLayout,
              compact &&
                styles.heroLayoutCompact,
            ]}
          >
            <View
              style={
                styles.heroCopy
              }
            >
              <View
                style={
                  styles.liveBadge
                }
              >
                <LiveDot />

                <Text
                  style={
                    styles.liveText
                  }
                >
                  {
                    copy.heroKicker
                  }
                </Text>
              </View>

              <Text
                style={
                  styles.heroTitle
                }
              >
                {copy.title}
              </Text>

              <Text
                style={
                  styles.heroSubtitle
                }
              >
                {copy.subtitle}
              </Text>

              <View
                style={
                  styles.heroActions
                }
              >
                <Pressable
                  onPress={() =>
                    router.push(
                      "/capture" as never,
                    )
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.primaryAction,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <ScanGlyph />

                  <Text
                    style={
                      styles.primaryActionText
                    }
                  >
                    {copy.newScan}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    router.push(
                      "/blocks" as never,
                    )
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.secondaryAction,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={
                      styles.secondaryActionText
                    }
                  >
                    {
                      copy.viewBlocks
                    }
                  </Text>

                  <Text
                    style={
                      styles.secondaryActionArrow
                    }
                  >
                    ›
                  </Text>
                </Pressable>
              </View>
            </View>

            <View
              style={[
                styles.signalPanel,
                compact &&
                  styles.signalPanelCompact,
              ]}
            >
              <SignalCore
                code={
                  latestBlock
                    ?.block_code ||
                  "FIELD"
                }
                active={
                  !loading
                }
              />
            </View>
          </View>

          <View
            style={
              styles.heroFooter
            }
          >
            <HeroMiniStat
              label={
                copy.total
              }
              value={
                loading
                  ? "—"
                  : String(
                      metrics.total,
                    )
              }
            />

            <HeroFooterDivider />

            <HeroMiniStat
              label={
                copy.analyzed
              }
              value={
                loading
                  ? "—"
                  : String(
                      metrics.analyzed,
                    )
              }
            />

            <HeroFooterDivider />

            <HeroMiniStat
              label={
                copy.system
              }
              value={
                voiceReady
                  ? copy.live
                  : "—"
              }
              small
            />
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInUp
            .delay(120)
            .duration(420)}
          style={
            styles.metricsGrid
          }
        >
          <MetricCard
            delay={0}
            label={copy.total}
            value={
              loading
                ? "—"
                : String(
                    metrics.total,
                  )
            }
            glyph="▦"
            accent="teal"
          />

          <MetricCard
            delay={80}
            label={
              copy.analyzed
            }
            value={
              loading
                ? "—"
                : String(
                    metrics.analyzed,
                  )
            }
            glyph="✓"
            accent="mint"
          />

          <MetricCard
            delay={160}
            label={copy.active}
            value={
              loading
                ? "—"
                : String(
                    metrics.active,
                  )
            }
            glyph="◌"
            accent="amber"
          />

          <MetricCard
            delay={240}
            label={
              copy.quarries
            }
            value={
              loading
                ? "—"
                : String(
                    quarries.length,
                  )
            }
            glyph="▲"
            accent="blue"
          />
        </Animated.View>

        {error ? (
          <Animated.View
            entering={FadeInDown
              .duration(260)}
            style={
              styles.errorCard
            }
          >
            <View
              style={
                styles.errorMark
              }
            >
              <Text
                style={
                  styles.errorMarkText
                }
              >
                !
              </Text>
            </View>

            <Text
              style={
                styles.errorText
              }
            >
              {error}
            </Text>

            <Pressable
              onPress={() =>
                void load(true)
              }
            >
              <Text
                style={
                  styles.retryText
                }
              >
                {copy.retry}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View
          entering={FadeInUp
            .delay(190)
            .duration(400)}
          style={
            styles.pipelineCard
          }
        >
          <View
            style={
              styles.cardHeaderRow
            }
          >
            <View
              style={
                styles.flexOne
              }
            >
              <Text
                style={
                  styles.sectionKicker
                }
              >
                {copy.pipeline}
              </Text>

              <Text
                style={
                  styles.sectionSub
                }
              >
                {copy.pipelineSub}
              </Text>
            </View>

            <View
              style={
                styles.syncPill
              }
            >
              <LiveDot
                compact
              />

              <Text
                style={
                  styles.syncText
                }
              >
                {loading
                  ? "…"
                  : copy.synced}
              </Text>
            </View>
          </View>

          <Pipeline
            stage={
              currentStage
            }
            labels={[
              copy.stageRegistered,
              copy.stageCapture,
              copy.stageAnalyze,
              copy.stageResult,
            ]}
          />

          {latestBlock ? (
            <View
              style={
                styles.pipelineMeta
              }
            >
              <Text
                style={
                  styles.pipelineCode
                }
              >
                {latestBlock
                  .block_code ||
                  "BLOCK"}
              </Text>

              <Text
                style={
                  styles.pipelineDate
                }
              >
                {formatDate(
                  latestBlock
                    .capture_date,
                  language,
                )}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View
          entering={FadeInUp
            .delay(240)
            .duration(400)}
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionKicker
            }
          >
            {copy.latest}
          </Text>

          <Text
            style={
              styles.sectionSub
            }
          >
            {copy.latestSub}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp
            .delay(285)
            .duration(420)}
        >
          <Pressable
            disabled={
              !latestBlock
            }
            onPress={() => {
              if (!latestBlock) {
                return;
              }

              router.push(
                `/blocks/${encodeURIComponent(
                  latestBlock.id,
                )}` as never,
              );
            }}
            style={({
              pressed,
            }) => [
              styles.latestCard,
              pressed &&
                styles.pressed,
            ]}
          >
            <LatestCardGlow />

            {loading ? (
              <View
                style={
                  styles.loadingRow
                }
              >
                <ActivityIndicator
                  size="small"
                  color="#15949B"
                />
              </View>
            ) : latestBlock ? (
              <>
                <View
                  style={
                    styles.latestTop
                  }
                >
                  <View
                    style={
                      styles.latestIdentity
                    }
                  >
                    <View
                      style={
                        styles.blockMark
                      }
                    >
                      <Text
                        style={
                          styles.blockMarkGlyph
                        }
                      >
                        ◆
                      </Text>
                    </View>

                    <View
                      style={
                        styles.flexOne
                      }
                    >
                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.blockCode
                        }
                      >
                        {latestBlock
                          .block_code ||
                          "BLOCK"}
                      </Text>

                      <Text
                        style={
                          styles.blockDate
                        }
                      >
                        {formatDate(
                          latestBlock
                            .capture_date,
                          language,
                        )}
                      </Text>
                    </View>
                  </View>

                  <StatusPill
                    status={
                      latestBlock.status
                    }
                    language={
                      language
                    }
                  />
                </View>

                <View
                  style={
                    styles.latestDetails
                  }
                >
                  <DetailCell
                    title={
                      language ===
                      "te"
                        ? "క్వారీ"
                        : "QUARRY"
                    }
                    value={
                      quarryLabel(
                        latestQuarry,
                      ) ||
                      copy.quarryUnknown
                    }
                  />

                  <DetailDivider />

                  <DetailCell
                    title={
                      language ===
                      "te"
                        ? "దశ"
                        : "STAGE"
                    }
                    value={
                      [
                        copy.stageRegistered,
                        copy.stageCapture,
                        copy.stageAnalyze,
                        copy.stageResult,
                      ][
                        currentStage
                      ]
                    }
                  />
                </View>

                <View
                  style={
                    styles.latestFooter
                  }
                >
                  <Text
                    style={
                      styles.latestHint
                    }
                  >
                    {latestAnalyzed
                      ?.id ===
                    latestBlock.id
                      ? copy.analyzedHint
                      : copy.pipelineSub}
                  </Text>

                  <View
                    style={
                      styles.openPill
                    }
                  >
                    <Text
                      style={
                        styles.openPillText
                      }
                    >
                      {copy.open}
                    </Text>

                    <Text
                      style={
                        styles.openPillArrow
                      }
                    >
                      ›
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text
                style={
                  styles.emptyLatest
                }
              >
                {copy.noBlock}
              </Text>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInUp
            .delay(340)
            .duration(420)}
          style={
            styles.aiEngineCard
          }
        >
          <AIEngineMotion />

          <View
            style={
              styles.aiEngineIcon
            }
          >
            <View
              style={
                styles.aiEngineOrbit
              }
            />

            <Text
              style={
                styles.aiEngineSpark
              }
            >
              ✦
            </Text>
          </View>

          <View
            style={
              styles.aiEngineCopy
            }
          >
            <View
              style={
                styles.aiEngineTitleRow
              }
            >
              <Text
                style={
                  styles.aiEngineTitle
                }
              >
                {copy.aiTitle}
              </Text>

              <View
                style={[
                  styles.aiReadyBadge,
                  !voiceReady &&
                    styles.aiPartialBadge,
                ]}
              >
                <View
                  style={[
                    styles.aiReadyDot,
                    !voiceReady &&
                      styles.aiPartialDot,
                  ]}
                />

                <Text
                  style={[
                    styles.aiReadyText,
                    !voiceReady &&
                      styles.aiPartialText,
                  ]}
                >
                  {voiceReady
                    ? copy.live
                    : copy.notSynced}
                </Text>
              </View>
            </View>

            <Text
              style={
                styles.aiEngineSub
              }
            >
              {voiceReady
                ? copy.aiSubReady
                : copy.aiSubPartial}
            </Text>

            <View
              style={
                styles.aiChips
              }
            >
              <View
                style={
                  styles.aiChip
                }
              >
                <Text
                  style={
                    styles.aiChipText
                  }
                >
                  {operationalAI}{" "}
                  {
                    copy.aiCapabilities
                  }
                </Text>
              </View>

              <View
                style={[
                  styles.aiChip,
                  voiceReady
                    ? styles.aiChipReady
                    : styles.aiChipOff,
                ]}
              >
                <Text
                  style={[
                    styles.aiChipText,
                    voiceReady
                      ? styles.aiChipTextReady
                      : styles.aiChipTextOff,
                  ]}
                >
                  {voiceReady
                    ? copy.voiceReady
                    : copy.voiceOff}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {metrics.attention >
        0 ? (
          <Animated.View
            entering={FadeInUp
              .delay(390)
              .duration(380)}
          >
            <Pressable
              onPress={() =>
                router.push(
                  "/blocks" as never,
                )
              }
              style={({
                pressed,
              }) => [
                styles.attentionCard,
                pressed &&
                  styles.pressed,
              ]}
            >
              <View
                style={
                  styles.attentionMark
                }
              >
                <Text
                  style={
                    styles.attentionMarkText
                  }
                >
                  !
                </Text>
              </View>

              <View
                style={
                  styles.flexOne
                }
              >
                <Text
                  style={
                    styles.attentionTitle
                  }
                >
                  {metrics.attention}{" "}
                  {copy.attention}
                </Text>

                <Text
                  style={
                    styles.attentionText
                  }
                >
                  {copy.attentionSub}
                </Text>
              </View>

              <Text
                style={
                  styles.attentionArrow
                }
              >
                ›
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[
          styles.floatingLayer,
          {
            bottom:
              Math.max(
                insets.bottom,
                10,
              ) + 91,
          },
        ]}
      >
        <FloatingAI
          label={
            copy.floatingAI
          }
          onPress={openAI}
        />
      </View>
    </View>
  );
}

function AnimatedLogo() {
  const breathe =
    useSharedValue(0);

  useEffect(() => {
    breathe.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 1800,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [breathe]);

  const glow =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            breathe.value,
            [0, 1],
            [0.2, 0.7],
          ),
        transform: [
          {
            scale:
              interpolate(
                breathe.value,
                [0, 1],
                [0.9, 1.15],
              ),
          },
        ],
      }),
    );

  return (
    <View
      style={styles.logoWrap}
    >
      <Animated.View
        style={[
          styles.logoGlow,
          glow,
        ]}
      />

      <View
        style={styles.logo}
      >
        <View
          style={
            styles.logoStone
          }
        />
        <View
          style={
            styles.logoScan
          }
        />
      </View>
    </View>
  );
}

function LiveDot({
  compact = false,
}: {
  compact?: boolean;
}) {
  const pulse =
    useSharedValue(0);

  useEffect(() => {
    pulse.value =
      withRepeat(
        withSequence(
          withTiming(
            1,
            {
              duration: 650,
            },
          ),
          withTiming(
            0,
            {
              duration: 650,
            },
          ),
        ),
        -1,
      );
  }, [pulse]);

  const style =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            pulse.value,
            [0, 1],
            [0.45, 1],
          ),
        transform: [
          {
            scale:
              interpolate(
                pulse.value,
                [0, 1],
                [0.8, 1.2],
              ),
          },
        ],
      }),
    );

  return (
    <Animated.View
      style={[
        compact
          ? styles.liveDotSmall
          : styles.liveDot,
        style,
      ]}
    />
  );
}

function HeroMotion() {
  const scan =
    useSharedValue(0);

  const drift =
    useSharedValue(0);

  useEffect(() => {
    scan.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 3800,
            easing:
              Easing.inOut(
                Easing.quad,
              ),
          },
        ),
        -1,
        true,
      );

    drift.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 7200,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [
    drift,
    scan,
  ]);

  const beam =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            scan.value,
            [0, 0.5, 1],
            [0.05, 0.28, 0.05],
          ),
        transform: [
          {
            translateY:
              interpolate(
                scan.value,
                [0, 1],
                [-130, 175],
              ),
          },
        ],
      }),
    );

  const glowOne =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            translateX:
              interpolate(
                drift.value,
                [0, 1],
                [-20, 36],
              ),
          },
          {
            translateY:
              interpolate(
                drift.value,
                [0, 1],
                [-6, 24],
              ),
          },
        ],
      }),
    );

  return (
    <View
      pointerEvents="none"
      style={
        styles.heroMotion
      }
    >
      <Animated.View
        style={[
          styles.heroGlowA,
          glowOne,
        ]}
      />

      <View
        style={
          styles.heroGlowB
        }
      />

      <View
        style={
          styles.heroGridA
        }
      />

      <View
        style={
          styles.heroGridB
        }
      />

      <Animated.View
        style={[
          styles.heroBeam,
          beam,
        ]}
      />
    </View>
  );
}

function SignalCore({
  code,
  active,
}: {
  code: string;
  active: boolean;
}) {
  const orbit =
    useSharedValue(0);

  const pulse =
    useSharedValue(0);

  const scan =
    useSharedValue(0);

  useEffect(() => {
    orbit.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 8200,
            easing:
              Easing.linear,
          },
        ),
        -1,
        false,
      );

    pulse.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 1350,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );

    scan.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 2400,
            easing:
              Easing.inOut(
                Easing.quad,
              ),
          },
        ),
        -1,
        true,
      );
  }, [
    orbit,
    pulse,
    scan,
  ]);

  const ring =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            rotate:
              `${interpolate(
                orbit.value,
                [0, 1],
                [0, 360],
              )}deg`,
          },
        ],
      }),
    );

  const core =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            scale:
              interpolate(
                pulse.value,
                [0, 1],
                [0.94, 1.05],
              ),
          },
        ],
        opacity:
          interpolate(
            pulse.value,
            [0, 1],
            [0.82, 1],
          ),
      }),
    );

  const scanLine =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            translateY:
              interpolate(
                scan.value,
                [0, 1],
                [-38, 38],
              ),
          },
        ],
        opacity:
          interpolate(
            scan.value,
            [0, 0.5, 1],
            [0.1, 0.9, 0.1],
          ),
      }),
    );

  return (
    <View
      style={
        styles.signalCore
      }
    >
      <View
        style={
          styles.signalFrame
        }
      >
        <View
          style={
            styles.cornerTL
          }
        />
        <View
          style={
            styles.cornerTR
          }
        />
        <View
          style={
            styles.cornerBL
          }
        />
        <View
          style={
            styles.cornerBR
          }
        />

        <Animated.View
          style={[
            styles.signalRing,
            ring,
          ]}
        >
          <View
            style={
              styles.signalOrbitDot
            }
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.signalCoreCenter,
            core,
          ]}
        >
          <View
            style={
              styles.signalCoreInner
            }
          >
            <Text
              style={
                styles.signalSpark
              }
            >
              ✦
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.signalScanLine,
            scanLine,
          ]}
        />
      </View>

      <Text
        numberOfLines={1}
        style={
          styles.signalCode
        }
      >
        {code}
      </Text>

      <View
        style={
          styles.signalStatus
        }
      >
        <LiveDot
          compact
        />

        <Text
          style={
            styles.signalStatusText
          }
        >
          {active
            ? "CONNECTED"
            : "SYNCING"}
        </Text>
      </View>
    </View>
  );
}

function ScanGlyph() {
  return (
    <View
      style={
        styles.scanGlyph
      }
    >
      <View
        style={
          styles.scanGlyphH
        }
      />
      <View
        style={
          styles.scanGlyphV
        }
      />
    </View>
  );
}

function HeroMiniStat({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <View
      style={
        styles.heroMiniStat
      }
    >
      <Text
        style={[
          styles.heroMiniValue,
          small &&
            styles.heroMiniValueSmall,
        ]}
      >
        {value}
      </Text>

      <Text
        style={
          styles.heroMiniLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function HeroFooterDivider() {
  return (
    <View
      style={
        styles.heroFooterDivider
      }
    />
  );
}

function MetricCard({
  label,
  value,
  glyph,
  accent,
  delay,
}: {
  label: string;
  value: string;
  glyph: string;
  accent:
    | "teal"
    | "mint"
    | "amber"
    | "blue";
  delay: number;
}) {
  const float =
    useSharedValue(0);

  useEffect(() => {
    float.value =
      withDelay(
        delay,
        withRepeat(
          withTiming(
            1,
            {
              duration:
                2600 +
                delay,
              easing:
                Easing.inOut(
                  Easing.ease,
                ),
            },
          ),
          -1,
          true,
        ),
      );
  }, [
    delay,
    float,
  ]);

  const animated =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            translateY:
              interpolate(
                float.value,
                [0, 1],
                [0, -3],
              ),
          },
        ],
      }),
    );

  return (
    <Animated.View
      style={[
        styles.metricCard,
        animated,
      ]}
    >
      <View
        style={[
          styles.metricAccent,
          accent === "mint" &&
            styles.metricAccentMint,
          accent === "amber" &&
            styles.metricAccentAmber,
          accent === "blue" &&
            styles.metricAccentBlue,
        ]}
      />

      <View
        style={
          styles.metricTop
        }
      >
        <View
          style={[
            styles.metricGlyphWrap,
            accent === "mint" &&
              styles.metricGlyphMint,
            accent === "amber" &&
              styles.metricGlyphAmber,
            accent === "blue" &&
              styles.metricGlyphBlue,
          ]}
        >
          <Text
            style={[
              styles.metricGlyph,
              accent === "mint" &&
                styles.metricGlyphTextMint,
              accent === "amber" &&
                styles.metricGlyphTextAmber,
              accent === "blue" &&
                styles.metricGlyphTextBlue,
            ]}
          >
            {glyph}
          </Text>
        </View>

        <View
          style={
            styles.metricSignal
          }
        >
          <View
            style={
              styles.metricSignalDot
            }
          />
          <View
            style={
              styles.metricSignalLine
            }
          />
        </View>
      </View>

      <Text
        style={
          styles.metricValue
        }
      >
        {value}
      </Text>

      <Text
        numberOfLines={2}
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>
    </Animated.View>
  );
}

function Pipeline({
  stage,
  labels,
}: {
  stage: number;
  labels: string[];
}) {
  return (
    <View
      style={
        styles.pipeline
      }
    >
      {labels.map(
        (
          label,
          index,
        ) => {
          const complete =
            index < stage;

          const current =
            index === stage;

          return (
            <React.Fragment
              key={label}
            >
              <View
                style={
                  styles.pipelineStage
                }
              >
                <View
                  style={[
                    styles.pipelineNodeOuter,
                    (complete ||
                      current) &&
                      styles.pipelineNodeOuterActive,
                  ]}
                >
                  {current ? (
                    <PipelinePulse />
                  ) : null}

                  <View
                    style={[
                      styles.pipelineNode,
                      complete &&
                        styles.pipelineNodeComplete,
                      current &&
                        styles.pipelineNodeCurrent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pipelineNodeText,
                        (complete ||
                          current) &&
                          styles.pipelineNodeTextActive,
                      ]}
                    >
                      {complete
                        ? "✓"
                        : index +
                          1}
                    </Text>
                  </View>
                </View>

                <Text
                  numberOfLines={
                    2
                  }
                  style={[
                    styles.pipelineLabel,
                    (complete ||
                      current) &&
                      styles.pipelineLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </View>

              {index <
              labels.length -
                1 ? (
                <View
                  style={[
                    styles.pipelineConnector,
                    index <
                      stage &&
                      styles.pipelineConnectorActive,
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        },
      )}
    </View>
  );
}

function PipelinePulse() {
  const pulse =
    useSharedValue(0);

  useEffect(() => {
    pulse.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 900,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [pulse]);

  const animated =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            pulse.value,
            [0, 1],
            [0.18, 0.6],
          ),
        transform: [
          {
            scale:
              interpolate(
                pulse.value,
                [0, 1],
                [0.9, 1.45],
              ),
          },
        ],
      }),
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pipelinePulse,
        animated,
      ]}
    />
  );
}

function DetailCell({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.detailCell
      }
    >
      <Text
        style={
          styles.detailTitle
        }
      >
        {title}
      </Text>

      <Text
        numberOfLines={1}
        style={
          styles.detailValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function DetailDivider() {
  return (
    <View
      style={
        styles.detailDivider
      }
    />
  );
}

function StatusPill({
  status,
  language,
}: {
  status?: string | null;
  language: Language;
}) {
  const value =
    normalize(status);

  const good =
    ANALYZED.has(value);

  const bad =
    ATTENTION.has(value);

  const registered =
    value === "REGISTERED";

  const copy =
    COPY[language];

  const label =
    good
      ? copy.statusAnalyzed
      : bad
        ? copy.statusAttention
        : registered
          ? copy.statusRegistered
          : copy.statusProgress;

  return (
    <View
      style={[
        styles.statusPill,
        good &&
          styles.statusPillGood,
        bad &&
          styles.statusPillBad,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          good &&
            styles.statusDotGood,
          bad &&
            styles.statusDotBad,
        ]}
      />

      <Text
        style={[
          styles.statusText,
          good &&
            styles.statusTextGood,
          bad &&
            styles.statusTextBad,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function LatestCardGlow() {
  const drift =
    useSharedValue(0);

  useEffect(() => {
    drift.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 6000,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [drift]);

  const animated =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            translateX:
              interpolate(
                drift.value,
                [0, 1],
                [-35, 60],
              ),
          },
        ],
      }),
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.latestGlow,
        animated,
      ]}
    />
  );
}

function AIEngineMotion() {
  const drift =
    useSharedValue(0);

  useEffect(() => {
    drift.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 5200,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [drift]);

  const animated =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            drift.value,
            [0, 1],
            [0.18, 0.42],
          ),
        transform: [
          {
            scale:
              interpolate(
                drift.value,
                [0, 1],
                [0.94, 1.08],
              ),
          },
        ],
      }),
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.aiEngineGlow,
        animated,
      ]}
    />
  );
}

function FloatingAI({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const pulse =
    useSharedValue(0);

  const orbit =
    useSharedValue(0);

  useEffect(() => {
    pulse.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 1450,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );

    orbit.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 7200,
            easing:
              Easing.linear,
          },
        ),
        -1,
        false,
      );
  }, [
    orbit,
    pulse,
  ]);

  const pulseStyle =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            pulse.value,
            [0, 1],
            [0.14, 0.48],
          ),
        transform: [
          {
            scale:
              interpolate(
                pulse.value,
                [0, 1],
                [0.92, 1.26],
              ),
          },
        ],
      }),
    );

  const orbitStyle =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            rotate:
              `${interpolate(
                orbit.value,
                [0, 1],
                [0, 360],
              )}deg`,
          },
        ],
      }),
    );

  return (
    <View
      style={
        styles.aiButtonWrap
      }
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.aiButtonPulse,
          pulseStyle,
        ]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label
        }
        onPress={onPress}
        style={({
          pressed,
        }) => [
          styles.floatingAI,
          pressed &&
            styles.floatingAIPressed,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.floatingOrbit,
            orbitStyle,
          ]}
        >
          <View
            style={
              styles.floatingOrbitDot
            }
          />
        </Animated.View>

        <Text
          style={
            styles.floatingSpark
          }
        >
          ✦
        </Text>

        <View
          style={
            styles.floatingMicBadge
          }
        >
          <View
            style={
              styles.floatingMicCapsule
            }
          />
          <View
            style={
              styles.floatingMicStem
            }
          />
          <View
            style={
              styles.floatingMicBase
            }
          />
        </View>
      </Pressable>

      <View
        style={
          styles.aiLabel
        }
      >
        <Text
          style={
            styles.aiLabelText
          }
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

function AmbientMotion() {
  const drift =
    useSharedValue(0);

  const breathe =
    useSharedValue(0);

  useEffect(() => {
    drift.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 11500,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );

    breathe.value =
      withRepeat(
        withTiming(
          1,
          {
            duration: 7800,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [
    breathe,
    drift,
  ]);

  const first =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            translateX:
              interpolate(
                drift.value,
                [0, 1],
                [-30, 38],
              ),
          },
          {
            translateY:
              interpolate(
                drift.value,
                [0, 1],
                [-15, 38],
              ),
          },
        ],
      }),
    );

  const second =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            breathe.value,
            [0, 1],
            [0.4, 1],
          ),
        transform: [
          {
            scale:
              interpolate(
                breathe.value,
                [0, 1],
                [0.92, 1.12],
              ),
          },
        ],
      }),
    );

  return (
    <View
      pointerEvents="none"
      style={
        styles.ambient
      }
    >
      <Animated.View
        style={[
          styles.ambientOrbA,
          first,
        ]}
      />

      <Animated.View
        style={[
          styles.ambientOrbB,
          second,
        ]}
      />

      <View
        style={
          styles.ambientGridV1
        }
      />
      <View
        style={
          styles.ambientGridV2
        }
      />
      <View
        style={
          styles.ambientGridH1
        }
      />
      <View
        style={
          styles.ambientGridH2
        }
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    flexOne: {
      flex: 1,
    },
    screen: {
      flex: 1,
      backgroundColor:
        "#F3F7F6",
    },
    ambient: {
      position:
        "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow:
        "hidden",
    },
    ambientOrbA: {
      position:
        "absolute",
      width: 340,
      height: 340,
      borderRadius: 170,
      top: -195,
      right: -155,
      backgroundColor:
        "rgba(61,197,170,0.10)",
    },
    ambientOrbB: {
      position:
        "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      top: 470,
      left: -185,
      backgroundColor:
        "rgba(74,147,184,0.055)",
    },
    ambientGridV1: {
      position:
        "absolute",
      width: 1,
      top: 160,
      bottom: 0,
      left: "22%",
      backgroundColor:
        "rgba(25,59,70,0.025)",
    },
    ambientGridV2: {
      position:
        "absolute",
      width: 1,
      top: 0,
      bottom: 100,
      right: "19%",
      backgroundColor:
        "rgba(25,59,70,0.022)",
    },
    ambientGridH1: {
      position:
        "absolute",
      height: 1,
      left: 0,
      right: 0,
      top: 330,
      backgroundColor:
        "rgba(25,59,70,0.022)",
    },
    ambientGridH2: {
      position:
        "absolute",
      height: 1,
      left: 0,
      right: 0,
      top: 770,
      backgroundColor:
        "rgba(25,59,70,0.018)",
    },
    content: {
      width: "100%",
      maxWidth: 700,
      alignSelf:
        "center",
      paddingHorizontal: 15,
    },
    header: {
      minHeight: 54,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 10,
    },
    brandRow: {
      flex: 1,
      minWidth: 0,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
    },
    logoWrap: {
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    logoGlow: {
      position:
        "absolute",
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor:
        "rgba(38,176,164,0.17)",
    },
    logo: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        "#173B47",
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow:
        "hidden",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.08)",
    },
    logoStone: {
      width: 17,
      height: 15,
      borderRadius: 5,
      backgroundColor:
        "#7ADAC8",
      transform: [
        {
          rotate:
            "-10deg",
        },
      ],
    },
    logoScan: {
      position:
        "absolute",
      width: 26,
      height: 2,
      backgroundColor:
        "rgba(255,255,255,0.60)",
    },
    brandName: {
      color:
        "#193B46",
      fontSize: 14,
      lineHeight: 18,
      fontWeight:
        "900",
    },
    brandSub: {
      marginTop: 2,
      color:
        "#71868B",
      fontSize: 7,
      lineHeight: 10,
      fontWeight:
        "900",
      letterSpacing:
        0.65,
    },
    languageButton: {
      minHeight: 34,
      borderRadius: 12,
      paddingHorizontal: 10,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(255,255,255,0.88)",
      borderWidth: 1,
      borderColor:
        "#D6E6E3",
    },
    languageText: {
      color:
        "#157F84",
      fontSize: 7.5,
      fontWeight:
        "900",
    },
    pressed: {
      opacity: 0.77,
      transform: [
        {
          scale:
            0.985,
        },
      ],
    },
    hero: {
      borderRadius: 28,
      overflow:
        "hidden",
      backgroundColor:
        "#143743",
      shadowColor:
        "#092A33",
      shadowOpacity: 0.19,
      shadowRadius: 24,
      shadowOffset: {
        width: 0,
        height: 11,
      },
      elevation: 9,
    },
    heroMotion: {
      position:
        "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow:
        "hidden",
    },
    heroGlowA: {
      position:
        "absolute",
      width: 280,
      height: 280,
      borderRadius: 140,
      top: -170,
      right: -80,
      backgroundColor:
        "rgba(79,222,192,0.13)",
    },
    heroGlowB: {
      position:
        "absolute",
      width: 170,
      height: 170,
      borderRadius: 85,
      left: -105,
      bottom: -95,
      backgroundColor:
        "rgba(74,154,192,0.08)",
    },
    heroGridA: {
      position:
        "absolute",
      width: 1,
      top: 0,
      bottom: 0,
      right: 92,
      backgroundColor:
        "rgba(255,255,255,0.035)",
    },
    heroGridB: {
      position:
        "absolute",
      height: 1,
      left: 0,
      right: 0,
      top: 92,
      backgroundColor:
        "rgba(255,255,255,0.03)",
    },
    heroBeam: {
      position:
        "absolute",
      left: 0,
      right: 0,
      height: 36,
      backgroundColor:
        "rgba(107,226,204,0.10)",
    },
    heroLayout: {
      minHeight: 260,
      padding: 18,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
    },
    heroLayoutCompact: {
      minHeight: 390,
      flexDirection:
        "column",
      alignItems:
        "stretch",
    },
    heroCopy: {
      flex: 1.15,
      minWidth: 0,
    },
    liveBadge: {
      alignSelf:
        "flex-start",
      minHeight: 24,
      borderRadius: 999,
      paddingHorizontal: 8,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 6,
      backgroundColor:
        "rgba(108,222,200,0.08)",
      borderWidth: 1,
      borderColor:
        "rgba(108,222,200,0.15)",
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        "#69D6B6",
    },
    liveDotSmall: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#69D6B6",
    },
    liveText: {
      color:
        "#86DDCD",
      fontSize: 6.8,
      lineHeight: 10,
      fontWeight:
        "900",
      letterSpacing:
        0.75,
    },
    heroTitle: {
      marginTop: 13,
      maxWidth: 330,
      color:
        "#FFFFFF",
      fontSize: 26,
      lineHeight: 31,
      fontWeight:
        "900",
      letterSpacing:
        -0.55,
    },
    heroSubtitle: {
      marginTop: 7,
      maxWidth: 340,
      color:
        "#AFC2C6",
      fontSize: 9.5,
      lineHeight: 15,
      fontWeight:
        "600",
    },
    heroActions: {
      marginTop: 18,
      flexDirection:
        "row",
      gap: 8,
    },
    primaryAction: {
      flex: 1,
      minHeight: 47,
      borderRadius: 15,
      paddingHorizontal: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 8,
      backgroundColor:
        "#15949B",
      shadowColor:
        "#5BD9C8",
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 5,
      },
    },
    primaryActionText: {
      color:
        "#FFFFFF",
      fontSize: 9.5,
      fontWeight:
        "900",
    },
    scanGlyph: {
      width: 16,
      height: 16,
      borderWidth: 1.4,
      borderRadius: 4,
      borderColor:
        "#FFFFFF",
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    scanGlyphH: {
      position:
        "absolute",
      width: 10,
      height: 1.4,
      backgroundColor:
        "#FFFFFF",
    },
    scanGlyphV: {
      position:
        "absolute",
      width: 1.4,
      height: 10,
      backgroundColor:
        "#FFFFFF",
    },
    secondaryAction: {
      flex: 1,
      minHeight: 47,
      borderRadius: 15,
      paddingHorizontal: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      backgroundColor:
        "rgba(255,255,255,0.065)",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.095)",
    },
    secondaryActionText: {
      color:
        "#E3EEEE",
      fontSize: 9.4,
      fontWeight:
        "900",
    },
    secondaryActionArrow: {
      color:
        "#83DCCC",
      fontSize: 21,
      lineHeight: 22,
    },
    signalPanel: {
      width: 165,
      alignSelf:
        "stretch",
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    signalPanelCompact: {
      width: "100%",
      minHeight: 155,
    },
    signalCore: {
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    signalFrame: {
      width: 126,
      height: 126,
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow:
        "hidden",
    },
    cornerTL: {
      position:
        "absolute",
      top: 4,
      left: 4,
      width: 21,
      height: 21,
      borderTopWidth: 2,
      borderLeftWidth: 2,
      borderColor:
        "rgba(129,224,207,0.74)",
    },
    cornerTR: {
      position:
        "absolute",
      top: 4,
      right: 4,
      width: 21,
      height: 21,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderColor:
        "rgba(129,224,207,0.74)",
    },
    cornerBL: {
      position:
        "absolute",
      bottom: 4,
      left: 4,
      width: 21,
      height: 21,
      borderBottomWidth: 2,
      borderLeftWidth: 2,
      borderColor:
        "rgba(129,224,207,0.74)",
    },
    cornerBR: {
      position:
        "absolute",
      bottom: 4,
      right: 4,
      width: 21,
      height: 21,
      borderBottomWidth: 2,
      borderRightWidth: 2,
      borderColor:
        "rgba(129,224,207,0.74)",
    },
    signalRing: {
      position:
        "absolute",
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 1,
      borderColor:
        "rgba(115,215,198,0.25)",
    },
    signalOrbitDot: {
      position:
        "absolute",
      top: -3,
      left: 43,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#84E1CF",
    },
    signalCoreCenter: {
      width: 62,
      height: 62,
      borderRadius: 22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(21,148,155,0.24)",
      borderWidth: 1,
      borderColor:
        "rgba(123,224,205,0.24)",
    },
    signalCoreInner: {
      width: 45,
      height: 45,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#15949B",
      shadowColor:
        "#7CE0CE",
      shadowOpacity: 0.18,
      shadowRadius: 13,
    },
    signalSpark: {
      color:
        "#FFFFFF",
      fontSize: 23,
      lineHeight: 26,
      fontWeight:
        "900",
    },
    signalScanLine: {
      position:
        "absolute",
      width: 86,
      height: 1,
      backgroundColor:
        "#87E1D0",
      shadowColor:
        "#87E1D0",
      shadowOpacity: 0.7,
      shadowRadius: 6,
    },
    signalCode: {
      marginTop: 4,
      maxWidth: 145,
      color:
        "#EAF4F3",
      fontSize: 9,
      lineHeight: 13,
      fontWeight:
        "900",
      letterSpacing:
        0.35,
    },
    signalStatus: {
      marginTop: 5,
      minHeight: 20,
      borderRadius: 999,
      paddingHorizontal: 7,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        "rgba(255,255,255,0.05)",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.06)",
    },
    signalStatusText: {
      color:
        "#91CFC3",
      fontSize: 5.8,
      fontWeight:
        "900",
      letterSpacing:
        0.7,
    },
    heroFooter: {
      minHeight: 64,
      paddingHorizontal: 18,
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "rgba(255,255,255,0.035)",
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        "rgba(255,255,255,0.07)",
    },
    heroMiniStat: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    heroMiniValue: {
      color:
        "#FFFFFF",
      fontSize: 15,
      lineHeight: 18,
      fontWeight:
        "900",
    },
    heroMiniValueSmall: {
      color:
        "#7CDBCA",
      fontSize: 9,
      letterSpacing:
        0.6,
    },
    heroMiniLabel: {
      marginTop: 3,
      color:
        "#8FA7AC",
      fontSize: 6.8,
      lineHeight: 9,
      fontWeight:
        "800",
    },
    heroFooterDivider: {
      width: 1,
      height: 24,
      backgroundColor:
        "rgba(255,255,255,0.08)",
    },
    metricsGrid: {
      marginTop: 12,
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 8,
    },
    metricCard: {
      width: "48%",
      flexGrow: 1,
      minWidth: 145,
      minHeight: 108,
      borderRadius: 19,
      padding: 12,
      overflow:
        "hidden",
      backgroundColor:
        "rgba(255,255,255,0.94)",
      borderWidth: 1,
      borderColor:
        "#DDE9E7",
      shadowColor:
        "#173B47",
      shadowOpacity: 0.035,
      shadowRadius: 9,
      shadowOffset: {
        width: 0,
        height: 4,
      },
    },
    metricAccent: {
      position:
        "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: 3,
      backgroundColor:
        "#15949B",
    },
    metricAccentMint: {
      backgroundColor:
        "#49AD7F",
    },
    metricAccentAmber: {
      backgroundColor:
        "#D69B3D",
    },
    metricAccentBlue: {
      backgroundColor:
        "#5B9FBC",
    },
    metricTop: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },
    metricGlyphWrap: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E8F6F3",
    },
    metricGlyphMint: {
      backgroundColor:
        "#EAF7EF",
    },
    metricGlyphAmber: {
      backgroundColor:
        "#FFF4DE",
    },
    metricGlyphBlue: {
      backgroundColor:
        "#EAF4F8",
    },
    metricGlyph: {
      color:
        "#15949B",
      fontSize: 11,
      fontWeight:
        "900",
    },
    metricGlyphTextMint: {
      color:
        "#36956C",
    },
    metricGlyphTextAmber: {
      color:
        "#B37A24",
    },
    metricGlyphTextBlue: {
      color:
        "#4F8DA8",
    },
    metricSignal: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 3,
    },
    metricSignalDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor:
        "#9EDDD0",
    },
    metricSignalLine: {
      width: 13,
      height: 1,
      backgroundColor:
        "#D8E8E5",
    },
    metricValue: {
      marginTop: 10,
      color:
        "#183B47",
      fontSize: 24,
      lineHeight: 28,
      fontWeight:
        "900",
      letterSpacing:
        -0.35,
    },
    metricLabel: {
      marginTop: 3,
      color:
        "#73878D",
      fontSize: 8.2,
      lineHeight: 12,
      fontWeight:
        "700",
    },
    errorCard: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: 14,
      padding: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
      backgroundColor:
        "#FFF1ED",
      borderWidth: 1,
      borderColor:
        "#F0CEC4",
    },
    errorMark: {
      width: 25,
      height: 25,
      borderRadius: 8,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F7DBD2",
    },
    errorMarkText: {
      color:
        "#AA4E3C",
      fontSize: 10,
      fontWeight:
        "900",
    },
    errorText: {
      flex: 1,
      color:
        "#80564E",
      fontSize: 8.3,
      lineHeight: 12,
      fontWeight:
        "600",
    },
    retryText: {
      color:
        "#15949B",
      fontSize: 8,
      fontWeight:
        "900",
    },
    pipelineCard: {
      marginTop: 12,
      borderRadius: 21,
      padding: 14,
      backgroundColor:
        "rgba(255,255,255,0.95)",
      borderWidth: 1,
      borderColor:
        "#DAE7E5",
      shadowColor:
        "#173B47",
      shadowOpacity: 0.035,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 4,
      },
    },
    cardHeaderRow: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 10,
    },
    sectionHeader: {
      marginTop: 17,
      marginBottom: 8,
    },
    sectionKicker: {
      color:
        "#1D4B56",
      fontSize: 10,
      lineHeight: 14,
      fontWeight:
        "900",
    },
    sectionSub: {
      marginTop: 3,
      color:
        "#809196",
      fontSize: 7.5,
      lineHeight: 11,
      fontWeight:
        "600",
    },
    syncPill: {
      minHeight: 25,
      borderRadius: 999,
      paddingHorizontal: 8,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        "#EDF8F4",
      borderWidth: 1,
      borderColor:
        "#D2EBDD",
    },
    syncText: {
      color:
        "#3B8D70",
      fontSize: 6.3,
      fontWeight:
        "900",
      letterSpacing:
        0.6,
    },
    pipeline: {
      marginTop: 19,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
    },
    pipelineStage: {
      width: 57,
      alignItems:
        "center",
    },
    pipelineNodeOuter: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    pipelineNodeOuterActive: {
      backgroundColor:
        "#EFF9F6",
    },
    pipelinePulse: {
      position:
        "absolute",
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor:
        "rgba(44,173,151,0.18)",
    },
    pipelineNode: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F0F4F3",
      borderWidth: 1,
      borderColor:
        "#DCE6E4",
    },
    pipelineNodeComplete: {
      backgroundColor:
        "#E7F7F1",
      borderColor:
        "#C5E7D9",
    },
    pipelineNodeCurrent: {
      backgroundColor:
        "#15949B",
      borderColor:
        "#15949B",
    },
    pipelineNodeText: {
      color:
        "#91A0A3",
      fontSize: 7.5,
      fontWeight:
        "900",
    },
    pipelineNodeTextActive: {
      color:
        "#FFFFFF",
    },
    pipelineLabel: {
      marginTop: 6,
      width: 68,
      color:
        "#93A1A5",
      fontSize: 6.4,
      lineHeight: 9,
      fontWeight:
        "700",
      textAlign:
        "center",
    },
    pipelineLabelActive: {
      color:
        "#45646B",
      fontWeight:
        "900",
    },
    pipelineConnector: {
      flex: 1,
      minWidth: 17,
      height: 2,
      marginTop: 16,
      backgroundColor:
        "#E3EBEA",
    },
    pipelineConnectorActive: {
      backgroundColor:
        "#8FD8C8",
    },
    pipelineMeta: {
      marginTop: 16,
      paddingTop: 11,
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        "#E6ECEB",
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
    },
    pipelineCode: {
      color:
        "#274A53",
      fontSize: 9,
      fontWeight:
        "900",
    },
    pipelineDate: {
      color:
        "#87979B",
      fontSize: 7.5,
      fontWeight:
        "700",
    },
    latestCard: {
      minHeight: 166,
      borderRadius: 22,
      padding: 14,
      overflow:
        "hidden",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE7E6",
      shadowColor:
        "#163A45",
      shadowOpacity: 0.045,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 5,
      },
    },
    latestGlow: {
      position:
        "absolute",
      width: 150,
      height: 190,
      top: -30,
      right: -70,
      backgroundColor:
        "rgba(70,199,177,0.055)",
      transform: [
        {
          rotate:
            "18deg",
        },
      ],
    },
    loadingRow: {
      flex: 1,
      minHeight: 120,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    latestTop: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 10,
    },
    latestIdentity: {
      flex: 1,
      minWidth: 0,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 9,
    },
    blockMark: {
      width: 37,
      height: 37,
      borderRadius: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#173B47",
    },
    blockMarkGlyph: {
      color:
        "#74D8C5",
      fontSize: 12,
      transform: [
        {
          rotate:
            "12deg",
        },
      ],
    },
    blockCode: {
      color:
        "#203F49",
      fontSize: 15,
      lineHeight: 20,
      fontWeight:
        "900",
    },
    blockDate: {
      marginTop: 3,
      color:
        "#7B8E94",
      fontSize: 8,
      lineHeight: 11,
      fontWeight:
        "700",
    },
    statusPill: {
      minHeight: 27,
      borderRadius: 999,
      paddingHorizontal: 9,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        "#F4F6F5",
      borderWidth: 1,
      borderColor:
        "#E0E7E7",
    },
    statusPillGood: {
      backgroundColor:
        "#EAF8F1",
      borderColor:
        "#C9E7D7",
    },
    statusPillBad: {
      backgroundColor:
        "#FFF0EC",
      borderColor:
        "#EECAC0",
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        "#B28C4B",
    },
    statusDotGood: {
      backgroundColor:
        "#39A276",
    },
    statusDotBad: {
      backgroundColor:
        "#C65B46",
    },
    statusText: {
      color:
        "#7A6A4B",
      fontSize: 6.5,
      fontWeight:
        "900",
    },
    statusTextGood: {
      color:
        "#2D7F62",
    },
    statusTextBad: {
      color:
        "#A54A38",
    },
    latestDetails: {
      marginTop: 17,
      minHeight: 50,
      borderRadius: 14,
      paddingHorizontal: 11,
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#F6F9F8",
      borderWidth: 1,
      borderColor:
        "#E7EEEC",
    },
    detailCell: {
      flex: 1,
      minWidth: 0,
    },
    detailTitle: {
      color:
        "#8A9A9E",
      fontSize: 6.2,
      fontWeight:
        "900",
      letterSpacing:
        0.5,
    },
    detailValue: {
      marginTop: 4,
      color:
        "#3A5961",
      fontSize: 8.4,
      fontWeight:
        "800",
    },
    detailDivider: {
      width: 1,
      height: 25,
      marginHorizontal: 10,
      backgroundColor:
        "#E0E9E7",
    },
    latestFooter: {
      marginTop: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
    },
    latestHint: {
      flex: 1,
      color:
        "#819196",
      fontSize: 7.4,
      lineHeight: 11,
      fontWeight:
        "600",
    },
    openPill: {
      minHeight: 31,
      borderRadius: 10,
      paddingHorizontal: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 7,
      backgroundColor:
        "#E6F5F2",
    },
    openPillText: {
      color:
        "#167F84",
      fontSize: 7.5,
      fontWeight:
        "900",
    },
    openPillArrow: {
      color:
        "#167F84",
      fontSize: 17,
      lineHeight: 18,
    },
    emptyLatest: {
      color:
        "#829398",
      fontSize: 9,
      fontWeight:
        "700",
    },
    aiEngineCard: {
      marginTop: 12,
      minHeight: 126,
      borderRadius: 22,
      padding: 14,
      overflow:
        "hidden",
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      backgroundColor:
        "#163B47",
      shadowColor:
        "#0A2932",
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: {
        width: 0,
        height: 6,
      },
    },
    aiEngineGlow: {
      position:
        "absolute",
      width: 180,
      height: 180,
      borderRadius: 90,
      right: -85,
      top: -75,
      backgroundColor:
        "rgba(93,218,196,0.10)",
    },
    aiEngineIcon: {
      width: 63,
      height: 63,
      borderRadius: 22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(24,151,157,0.22)",
      borderWidth: 1,
      borderColor:
        "rgba(120,220,204,0.20)",
    },
    aiEngineOrbit: {
      position:
        "absolute",
      width: 47,
      height: 47,
      borderRadius: 24,
      borderWidth: 1,
      borderColor:
        "rgba(134,226,210,0.28)",
    },
    aiEngineSpark: {
      color:
        "#FFFFFF",
      fontSize: 26,
      fontWeight:
        "900",
    },
    aiEngineCopy: {
      flex: 1,
      minWidth: 0,
    },
    aiEngineTitleRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
    },
    aiEngineTitle: {
      color:
        "#FFFFFF",
      fontSize: 11,
      lineHeight: 15,
      fontWeight:
        "900",
    },
    aiReadyBadge: {
      minHeight: 22,
      borderRadius: 999,
      paddingHorizontal: 7,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        "rgba(88,210,174,0.10)",
      borderWidth: 1,
      borderColor:
        "rgba(110,224,193,0.16)",
    },
    aiPartialBadge: {
      backgroundColor:
        "rgba(223,168,74,0.08)",
      borderColor:
        "rgba(223,168,74,0.15)",
    },
    aiReadyDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#6FDCB9",
    },
    aiPartialDot: {
      backgroundColor:
        "#D7A452",
    },
    aiReadyText: {
      color:
        "#88E0C8",
      fontSize: 5.8,
      fontWeight:
        "900",
      letterSpacing:
        0.55,
    },
    aiPartialText: {
      color:
        "#E3BF7F",
    },
    aiEngineSub: {
      marginTop: 5,
      color:
        "#A9BEC2",
      fontSize: 7.8,
      lineHeight: 11,
      fontWeight:
        "600",
    },
    aiChips: {
      marginTop: 9,
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 6,
    },
    aiChip: {
      minHeight: 25,
      borderRadius: 9,
      paddingHorizontal: 8,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(255,255,255,0.055)",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.07)",
    },
    aiChipReady: {
      backgroundColor:
        "rgba(95,214,184,0.08)",
      borderColor:
        "rgba(95,214,184,0.13)",
    },
    aiChipOff: {
      backgroundColor:
        "rgba(223,168,74,0.06)",
      borderColor:
        "rgba(223,168,74,0.12)",
    },
    aiChipText: {
      color:
        "#B3C8CC",
      fontSize: 6.4,
      fontWeight:
        "800",
    },
    aiChipTextReady: {
      color:
        "#8DDDC8",
    },
    aiChipTextOff: {
      color:
        "#E1BE80",
    },
    attentionCard: {
      marginTop: 12,
      minHeight: 72,
      borderRadius: 18,
      padding: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
      backgroundColor:
        "#FFF4F0",
      borderWidth: 1,
      borderColor:
        "#EECFC6",
    },
    attentionMark: {
      width: 35,
      height: 35,
      borderRadius: 11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F8DDD4",
    },
    attentionMarkText: {
      color:
        "#A94F3D",
      fontSize: 13,
      fontWeight:
        "900",
    },
    attentionTitle: {
      color:
        "#713F36",
      fontSize: 9.5,
      fontWeight:
        "900",
    },
    attentionText: {
      marginTop: 3,
      color:
        "#926E66",
      fontSize: 7.3,
      lineHeight: 10,
      fontWeight:
        "600",
    },
    attentionArrow: {
      color:
        "#B66D5B",
      fontSize: 22,
      lineHeight: 23,
    },
    floatingLayer: {
      position:
        "absolute",
      right: 15,
      alignItems:
        "flex-end",
    },
    aiButtonWrap: {
      alignItems:
        "center",
    },
    aiButtonPulse: {
      position:
        "absolute",
      top: 1,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor:
        "rgba(27,165,158,0.18)",
    },
    floatingAI: {
      width: 58,
      height: 58,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow:
        "hidden",
      backgroundColor:
        "#153A46",
      borderWidth: 1,
      borderColor:
        "rgba(120,222,204,0.30)",
      shadowColor:
        "#143E49",
      shadowOpacity: 0.23,
      shadowRadius: 15,
      shadowOffset: {
        width: 0,
        height: 7,
      },
      elevation: 9,
    },
    floatingAIPressed: {
      transform: [
        {
          scale:
            0.94,
        },
      ],
    },
    floatingOrbit: {
      position:
        "absolute",
      width: 43,
      height: 43,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        "rgba(112,220,201,0.30)",
    },
    floatingOrbitDot: {
      position:
        "absolute",
      width: 6,
      height: 6,
      borderRadius: 3,
      top: -3,
      left: 18,
      backgroundColor:
        "#7BE0CD",
    },
    floatingSpark: {
      color:
        "#FFFFFF",
      fontSize: 24,
      fontWeight:
        "900",
    },
    floatingMicBadge: {
      position:
        "absolute",
      right: 5,
      bottom: 5,
      width: 17,
      height: 17,
      borderRadius: 9,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#DDF7F1",
      borderWidth: 2,
      borderColor:
        "#153A46",
    },
    floatingMicCapsule: {
      width: 5,
      height: 7,
      borderRadius: 3,
      borderWidth: 1.2,
      borderColor:
        "#173B47",
    },
    floatingMicStem: {
      width: 1.2,
      height: 2,
      marginTop: -1,
      backgroundColor:
        "#173B47",
    },
    floatingMicBase: {
      width: 6,
      height: 1.2,
      borderRadius: 1,
      backgroundColor:
        "#173B47",
    },
    aiLabel: {
      marginTop: 6,
      minHeight: 23,
      borderRadius: 999,
      paddingHorizontal: 8,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(20,57,68,0.93)",
      shadowColor:
        "#173B47",
      shadowOpacity: 0.10,
      shadowRadius: 7,
    },
    aiLabelText: {
      color:
        "#EAF8F5",
      fontSize: 6.3,
      fontWeight:
        "900",
    },
  });
