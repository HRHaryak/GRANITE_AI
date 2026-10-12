import * as Location from "expo-location";
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
} from "react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Language = "te" | "en";

type Quarry = {
  id: string;
  quarry_name?: string | null;
  name?: string | null;
  quarry_code?: string | null;
  lease_id?: string | null;
  district?: string | null;
  mandal?: string | null;
  village?: string | null;
  granite_category_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
};

type GraniteCategory = {
  id: string;
  code?: string | null;
  name?: string | null;
};

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

const COPY = {
  te: {
    eyebrow: "క్వారీ డైరెక్టరీ",
    title: "క్వారీలు",
    subtitle:
      "నిజమైన లీజ్, జిల్లా, మండలం, గ్రామం మరియు GPS వివరాలు.",
    search: "క్వారీ పేరు, కోడ్, లీజ్ లేదా ప్రాంతం వెతకండి…",
    total: "మొత్తం",
    active: "యాక్టివ్",
    districts: "జిల్లాలు",
    add: "క్వారీ నమోదు",
    close: "మూసివేయండి",
    name: "క్వారీ పేరు",
    code: "క్వారీ కోడ్",
    lease: "లీజ్ ID",
    district: "జిల్లా",
    mandal: "మండలం",
    village: "గ్రామం",
    category: "గ్రానైట్ వర్గం",
    gps: "GPS",
    useGps: "ఫోన్ GPS తీసుకోండి",
    gpsReady: "GPS తీసుకున్నాం",
    gpsOptional:
      "GPS ఐచ్చికం. అందుబాటులో లేని స్థానాన్ని AI ఊహించదు.",
    register: "నమోదు చేయండి",
    registering: "నమోదు చేస్తోంది…",
    required:
      "పేరు, కోడ్, లీజ్, జిల్లా, మండలం, గ్రామం మరియు గ్రానైట్ వర్గం అవసరం.",
    operator:
      "క్వారీ నమోదు కోసం ముందుగా Profile లో యూజర్‌ను ఎంచుకోండి.",
    noRecords: "క్వారీ రికార్డులు లేవు",
    noMatch: "సరిపోయే క్వారీ దొరకలేదు",
    location: "స్థానం",
    coordinates: "కోఆర్డినేట్స్",
    notRecorded: "నమోదు కాలేదు",
    retry: "మళ్లీ ప్రయత్నించండి",
    success: "క్వారీ విజయవంతంగా నమోదైంది.",
    newScan: "ఈ క్వారీతో స్కాన్ ప్రారంభించండి",
  },
  en: {
    eyebrow: "QUARRY DIRECTORY",
    title: "Quarries",
    subtitle:
      "Real lease, district, mandal, village and GPS records.",
    search: "Search quarry name, code, lease or location…",
    total: "Total",
    active: "Active",
    districts: "Districts",
    add: "Register Quarry",
    close: "Close",
    name: "Quarry Name",
    code: "Quarry Code",
    lease: "Lease ID",
    district: "District",
    mandal: "Mandal",
    village: "Village",
    category: "Granite Category",
    gps: "GPS",
    useGps: "Use phone GPS",
    gpsReady: "GPS captured",
    gpsOptional:
      "GPS is optional. Missing location is not inferred.",
    register: "Register",
    registering: "Registering…",
    required:
      "Name, code, lease, district, mandal, village and category are required.",
    operator:
      "Select a user in Profile before registering a quarry.",
    noRecords: "No quarry records",
    noMatch: "No matching quarry",
    location: "Location",
    coordinates: "Coordinates",
    notRecorded: "Not recorded",
    retry: "Retry",
    success: "Quarry registered successfully.",
    newScan: "Start scan from this quarry",
  },
} as const;

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers =
    new Headers(init.headers);

  headers.set(
    "Accept",
    "application/json",
  );

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
    {
      ...init,
      headers,
    },
  );

  if (!response.ok) {
    const raw =
      await response.text().catch(
        () => "",
      );

    let detail = raw;

    try {
      const parsed =
        raw
          ? (JSON.parse(raw) as {
              detail?: unknown;
            })
          : {};

      if (
        typeof parsed.detail ===
        "string"
      ) {
        detail = parsed.detail;
      }
    } catch {
      // Keep raw body.
    }

    throw new Error(
      detail ||
        `HTTP ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function text(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function quarryName(
  quarry: Quarry,
): string {
  return (
    text(quarry.quarry_name) ||
    text(quarry.name) ||
    "Quarry"
  );
}

function statusActive(
  quarry: Quarry,
): boolean {
  const status =
    text(quarry.status)
      .toUpperCase();

  return (
    !status ||
    status === "ACTIVE" ||
    status === "OPERATIONAL"
  );
}

export default function QuarriesScreen() {
  const insets =
    useSafeAreaInsets();

  const [language, setLanguage] =
    useState<Language>("te");

  const [quarries, setQuarries] =
    useState<Quarry[]>([]);

  const [
    categories,
    setCategories,
  ] =
    useState<GraniteCategory[]>([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  const [name, setName] =
    useState("");

  const [code, setCode] =
    useState("");

  const [lease, setLease] =
    useState("");

  const [district, setDistrict] =
    useState("");

  const [mandal, setMandal] =
    useState("");

  const [village, setVillage] =
    useState("");

  const [
    categoryId,
    setCategoryId,
  ] =
    useState("");

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [gpsBusy, setGpsBusy] =
    useState(false);

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

  const load = useCallback(
    async (
      refresh = false,
    ) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const [
          quarryResult,
          categoryResult,
        ] = await Promise.all([
          requestJson<Quarry[]>(
            "/quarries",
          ),
          requestJson<
            GraniteCategory[]
          >(
            "/granite-categories",
          ),
        ]);

        setQuarries(
          Array.isArray(
            quarryResult,
          )
            ? quarryResult
            : [],
        );

        setCategories(
          Array.isArray(
            categoryResult,
          )
            ? categoryResult
            : [],
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : copy.retry,
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [copy.retry],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    useMemo(() => {
      const needle =
        search
          .trim()
          .toLowerCase();

      if (!needle) {
        return quarries;
      }

      return quarries.filter(
        (quarry) => {
          const haystack = [
            quarryName(quarry),
            quarry.quarry_code,
            quarry.lease_id,
            quarry.district,
            quarry.mandal,
            quarry.village,
          ]
            .map((item) =>
              text(item)
                .toLowerCase(),
            )
            .join(" ");

          return haystack.includes(
            needle,
          );
        },
      );
    }, [quarries, search]);

  const metrics =
    useMemo(() => {
      const districts =
        new Set(
          quarries
            .map((item) =>
              text(item.district),
            )
            .filter(Boolean),
        );

      return {
        total: quarries.length,
        active:
          quarries.filter(
            statusActive,
          ).length,
        districts:
          districts.size,
      };
    }, [quarries]);

  const toggleLanguage =
    useCallback(async () => {
      const next: Language =
        language === "te"
          ? "en"
          : "te";

      setLanguage(next);

      await SecureStore.setItemAsync(
        LANGUAGE_KEY,
        next,
      ).catch(() => undefined);
    }, [language]);

  const captureGps =
    useCallback(async () => {
      if (gpsBusy) return;

      setGpsBusy(true);
      setError(null);

      try {
        const permission =
          await Location
            .requestForegroundPermissionsAsync();

        if (
          permission.status !==
          "granted"
        ) {
          throw new Error(
            language === "te"
              ? "GPS అనుమతి ఇవ్వలేదు."
              : "Location permission was not granted.",
          );
        }

        const position =
          await Location
            .getCurrentPositionAsync({
              accuracy:
                Location.Accuracy
                  .High,
            });

        setLatitude(
          position.coords.latitude,
        );
        setLongitude(
          position.coords.longitude,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : copy.gpsOptional,
        );
      } finally {
        setGpsBusy(false);
      }
    }, [
      copy.gpsOptional,
      gpsBusy,
      language,
    ]);

  const resetForm =
    useCallback(() => {
      setName("");
      setCode("");
      setLease("");
      setDistrict("");
      setMandal("");
      setVillage("");
      setCategoryId("");
      setLatitude(null);
      setLongitude(null);
    }, []);

  const register =
    useCallback(async () => {
      if (saving) return;

      setError(null);
      setMessage(null);

      const selectedUser =
        await SecureStore.getItemAsync(
          SELECTED_USER_KEY,
        ).catch(() => null);

      if (!selectedUser) {
        setError(copy.operator);
        return;
      }

      if (
        !name.trim() ||
        !code.trim() ||
        !lease.trim() ||
        !district.trim() ||
        !mandal.trim() ||
        !village.trim() ||
        !categoryId
      ) {
        setError(copy.required);
        return;
      }

      setSaving(true);

      try {
        await requestJson<Quarry>(
          "/quarries",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              quarry_name:
                name.trim(),
              quarry_code:
                code.trim(),
              lease_id:
                lease.trim(),
              district:
                district.trim(),
              mandal:
                mandal.trim(),
              village:
                village.trim(),
              granite_category_id:
                categoryId,
              latitude,
              longitude,
              status: "ACTIVE",
            }),
          },
        );

        setMessage(copy.success);
        resetForm();
        setFormOpen(false);
        await load(true);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : copy.retry,
        );
      } finally {
        setSaving(false);
      }
    }, [
      categoryId,
      code,
      copy.operator,
      copy.required,
      copy.retry,
      copy.success,
      district,
      latitude,
      lease,
      load,
      longitude,
      mandal,
      name,
      resetForm,
      saving,
      village,
    ]);

  return (
    <View style={styles.screen}>
      <View
        pointerEvents="none"
        style={styles.ambient}
      >
        <View
          style={styles.ambientOrb}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
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
              ) + 4,
            paddingBottom:
              Math.max(
                insets.bottom,
                12,
              ) + 124,
          },
        ]}
      >
        <Animated.View
          entering={FadeInDown.duration(
            300,
          )}
          style={styles.header}
        >
          <View style={styles.flexOne}>
            <Text
              style={
                styles.eyebrow
              }
            >
              {copy.eyebrow}
            </Text>
            <Text style={styles.title}>
              {copy.title}
            </Text>
            <Text
              style={styles.subtitle}
            >
              {copy.subtitle}
            </Text>
          </View>

          <Pressable
            onPress={() =>
              void toggleLanguage()
            }
            style={({ pressed }) => [
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
                ? "తెలుగు · EN"
                : "EN · తెలుగు"}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInDown
            .delay(40)
            .duration(320)}
          style={styles.summaryCard}
        >
          <SummaryMetric
            value={
              loading
                ? "—"
                : String(
                    metrics.total,
                  )
            }
            label={copy.total}
          />
          <View
            style={styles.divider}
          />
          <SummaryMetric
            value={
              loading
                ? "—"
                : String(
                    metrics.active,
                  )
            }
            label={copy.active}
          />
          <View
            style={styles.divider}
          />
          <SummaryMetric
            value={
              loading
                ? "—"
                : String(
                    metrics.districts,
                  )
            }
            label={copy.districts}
          />
        </Animated.View>

        <View style={styles.actionRow}>
          <View
            style={styles.searchBox}
          >
            <Text
              style={
                styles.searchGlyph
              }
            >
              ⌕
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={copy.search}
              placeholderTextColor="#8A9A9F"
              style={styles.searchInput}
            />
          </View>

          <Pressable
            onPress={() => {
              setFormOpen(
                (value) => !value,
              );
              setError(null);
              setMessage(null);
            }}
            style={({ pressed }) => [
              styles.addButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.addIcon}
            >
              +
            </Text>
          </Pressable>
        </View>

        {formOpen ? (
          <Animated.View
            entering={FadeInDown.duration(
              260,
            )}
            style={styles.formCard}
          >
            <View
              style={styles.formHeader}
            >
              <View>
                <Text
                  style={
                    styles.formEyebrow
                  }
                >
                  {copy.add}
                </Text>
                <Text
                  style={
                    styles.formHint
                  }
                >
                  {language === "te"
                    ? "తెలిసిన నిజమైన వివరాలనే నమోదు చేయండి."
                    : "Enter only known real quarry metadata."}
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setFormOpen(false)
                }
              >
                <Text
                  style={
                    styles.closeText
                  }
                >
                  ×
                </Text>
              </Pressable>
            </View>

            <FormField
              value={name}
              onChangeText={setName}
              label={copy.name}
            />
            <View
              style={styles.twoCol}
            >
              <View
                style={styles.flexOne}
              >
                <FormField
                  value={code}
                  onChangeText={
                    setCode
                  }
                  label={copy.code}
                />
              </View>
              <View
                style={styles.flexOne}
              >
                <FormField
                  value={lease}
                  onChangeText={
                    setLease
                  }
                  label={copy.lease}
                />
              </View>
            </View>

            <FormField
              value={district}
              onChangeText={
                setDistrict
              }
              label={copy.district}
            />
            <View
              style={styles.twoCol}
            >
              <View
                style={styles.flexOne}
              >
                <FormField
                  value={mandal}
                  onChangeText={
                    setMandal
                  }
                  label={copy.mandal}
                />
              </View>
              <View
                style={styles.flexOne}
              >
                <FormField
                  value={village}
                  onChangeText={
                    setVillage
                  }
                  label={copy.village}
                />
              </View>
            </View>

            <Text
              style={
                styles.fieldLabel
              }
            >
              {copy.category}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.categoryRow
              }
            >
              {categories.map(
                (category) => {
                  const selected =
                    category.id ===
                    categoryId;

                  return (
                    <Pressable
                      key={category.id}
                      onPress={() =>
                        setCategoryId(
                          category.id,
                        )
                      }
                      style={[
                        styles.categoryChip,
                        selected &&
                          styles.categoryChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected &&
                            styles.categoryChipTextSelected,
                        ]}
                      >
                        {text(
                          category.name,
                        ) ||
                          text(
                            category.code,
                          ) ||
                          category.id}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>

            <View style={styles.gpsCard}>
              <View style={styles.flexOne}>
                <Text
                  style={styles.gpsTitle}
                >
                  {copy.gps}
                </Text>
                <Text
                  style={styles.gpsText}
                >
                  {latitude !== null &&
                  longitude !== null
                    ? `${latitude.toFixed(
                        6,
                      )}, ${longitude.toFixed(
                        6,
                      )}`
                    : copy.gpsOptional}
                </Text>
              </View>

              <Pressable
                disabled={gpsBusy}
                onPress={() =>
                  void captureGps()
                }
                style={styles.gpsButton}
              >
                {gpsBusy ? (
                  <ActivityIndicator
                    size="small"
                    color="#15949B"
                  />
                ) : (
                  <Text
                    style={
                      styles.gpsButtonText
                    }
                  >
                    {latitude !== null
                      ? copy.gpsReady
                      : copy.useGps}
                  </Text>
                )}
              </Pressable>
            </View>

            <Pressable
              disabled={saving}
              onPress={() =>
                void register()
              }
              style={[
                styles.registerButton,
                saving &&
                  styles.disabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.registerText
                  }
                >
                  {copy.register}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        {message ? (
          <View
            style={styles.successCard}
          >
            <Text
              style={
                styles.successText
              }
            >
              ✓ {message}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={styles.errorCard}
          >
            <Text
              style={styles.errorMark}
            >
              !
            </Text>
            <Text
              style={styles.errorText}
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
          </View>
        ) : null}

        {loading ? (
          <View
            style={styles.loadingCard}
          >
            <ActivityIndicator
              color="#15949B"
            />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text
              style={styles.emptyIcon}
            >
              ▲
            </Text>
            <Text
              style={styles.emptyTitle}
            >
              {quarries.length === 0
                ? copy.noRecords
                : copy.noMatch}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map(
              (quarry, index) => (
                <Animated.View
                  key={quarry.id}
                  entering={FadeInDown
                    .delay(
                      Math.min(
                        index * 28,
                        180,
                      ),
                    )
                    .duration(260)}
                >
                  <QuarryCard
                    quarry={quarry}
                    language={
                      language
                    }
                    copy={copy}
                  />
                </Animated.View>
              ),
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryMetric({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <View
      style={
        styles.summaryMetric
      }
    >
      <Text
        style={
          styles.summaryValue
        }
      >
        {value}
      </Text>
      <Text
        style={
          styles.summaryLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function FormField({
  value,
  onChangeText,
  label,
}: {
  value: string;
  onChangeText: (
    value: string,
  ) => void;
  label: string;
}) {
  return (
    <View style={styles.field}>
      <Text
        style={styles.fieldLabel}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#A1AFB2"
        autoCapitalize="words"
        style={styles.input}
      />
    </View>
  );
}

function QuarryCard({
  quarry,
  language,
  copy,
}: {
  quarry: Quarry;
  language: Language;
  copy: (typeof COPY)[Language];
}) {
  const location = [
    text(quarry.village),
    text(quarry.mandal),
    text(quarry.district),
  ]
    .filter(Boolean)
    .join(", ");

  const hasGps =
    typeof quarry.latitude ===
      "number" &&
    typeof quarry.longitude ===
      "number";

  return (
    <View style={styles.quarryCard}>
      <View style={styles.quarryTop}>
        <View
          style={styles.quarryIcon}
        >
          <Text
            style={
              styles.quarryIconText
            }
          >
            ▲
          </Text>
        </View>

        <View style={styles.flexOne}>
          <Text
            numberOfLines={1}
            style={
              styles.quarryName
            }
          >
            {quarryName(quarry)}
          </Text>
          <Text
            numberOfLines={1}
            style={
              styles.quarryCode
            }
          >
            {text(
              quarry.quarry_code,
            ) || copy.notRecorded}
          </Text>
        </View>

        <View
          style={[
            styles.activeBadge,
            !statusActive(quarry) &&
              styles.inactiveBadge,
          ]}
        >
          <Text
            style={[
              styles.activeText,
              !statusActive(quarry) &&
                styles.inactiveText,
            ]}
          >
            {statusActive(quarry)
              ? language === "te"
                ? "యాక్టివ్"
                : "ACTIVE"
              : text(quarry.status) ||
                "STATUS"}
          </Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <Detail
          label={copy.lease}
          value={
            text(quarry.lease_id) ||
            copy.notRecorded
          }
        />
        <Detail
          label={copy.location}
          value={
            location ||
            copy.notRecorded
          }
        />
        <Detail
          label={copy.coordinates}
          value={
            hasGps
              ? `${quarry.latitude?.toFixed(
                  5,
                )}, ${quarry.longitude?.toFixed(
                  5,
                )}`
              : copy.notRecorded
          }
        />
      </View>

      <Pressable
        onPress={() =>
          router.push(
            "/capture" as never,
          )
        }
        style={({ pressed }) => [
          styles.scanLink,
          pressed &&
            styles.pressed,
        ]}
      >
        <Text
          style={styles.scanLinkText}
        >
          {copy.newScan}
        </Text>
        <Text
          style={styles.scanLinkArrow}
        >
          ›
        </Text>
      </Pressable>
    </View>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Text
        style={styles.detailLabel}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={styles.detailValue}
      >
        {value}
      </Text>
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
      backgroundColor: "#F3F7F6",
    },
    ambient: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: "hidden",
    },
    ambientOrb: {
      position: "absolute",
      width: 300,
      height: 300,
      borderRadius: 150,
      top: -170,
      right: -135,
      backgroundColor:
        "rgba(69,195,173,0.09)",
    },
    content: {
      width: "100%",
      maxWidth: 680,
      alignSelf: "center",
      paddingHorizontal: 15,
      gap: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 2,
    },
    eyebrow: {
      color: "#15949B",
      fontSize: 8,
      lineHeight: 11,
      fontWeight: "900",
      letterSpacing: 0.95,
    },
    title: {
      marginTop: 4,
      color: "#183B47",
      fontSize: 25,
      lineHeight: 30,
      fontWeight: "900",
    },
    subtitle: {
      marginTop: 5,
      maxWidth: 340,
      color: "#75898E",
      fontSize: 9.5,
      lineHeight: 14,
      fontWeight: "600",
    },
    languageButton: {
      minHeight: 34,
      borderRadius: 11,
      paddingHorizontal: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E3F3F0",
      borderWidth: 1,
      borderColor: "#CBE5DF",
    },
    languageText: {
      color: "#177E82",
      fontSize: 7.5,
      fontWeight: "900",
    },
    pressed: {
      opacity: 0.74,
      transform: [
        { scale: 0.985 },
      ],
    },
    summaryCard: {
      minHeight: 82,
      borderRadius: 20,
      paddingVertical: 12,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#173B47",
      overflow: "hidden",
    },
    summaryMetric: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryValue: {
      color: "#FFFFFF",
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "900",
    },
    summaryLabel: {
      marginTop: 3,
      color: "#8FDCCF",
      fontSize: 7.5,
      fontWeight: "800",
    },
    divider: {
      width: 1,
      height: 36,
      backgroundColor:
        "rgba(255,255,255,0.09)",
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
    },
    searchBox: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      paddingHorizontal: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDE7E6",
    },
    searchGlyph: {
      color: "#15949B",
      fontSize: 17,
      fontWeight: "800",
    },
    searchInput: {
      flex: 1,
      color: "#294750",
      fontSize: 9.5,
      fontWeight: "600",
    },
    addButton: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#15949B",
    },
    addIcon: {
      color: "#FFFFFF",
      fontSize: 24,
      lineHeight: 26,
      fontWeight: "500",
    },
    formCard: {
      borderRadius: 20,
      padding: 14,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#D9E6E4",
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent:
        "space-between",
      marginBottom: 9,
    },
    formEyebrow: {
      color: "#183B47",
      fontSize: 12,
      fontWeight: "900",
    },
    formHint: {
      marginTop: 3,
      color: "#819196",
      fontSize: 8,
      lineHeight: 11,
      fontWeight: "600",
    },
    closeText: {
      color: "#70858B",
      fontSize: 24,
      lineHeight: 26,
    },
    field: {
      marginTop: 8,
    },
    fieldLabel: {
      marginBottom: 5,
      color: "#687E85",
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.35,
    },
    input: {
      minHeight: 44,
      borderRadius: 13,
      paddingHorizontal: 11,
      color: "#23434D",
      fontSize: 9.5,
      fontWeight: "600",
      backgroundColor: "#F7FAF9",
      borderWidth: 1,
      borderColor: "#DFE8E7",
    },
    twoCol: {
      flexDirection: "row",
      gap: 8,
    },
    categoryRow: {
      gap: 6,
      paddingBottom: 2,
    },
    categoryChip: {
      minHeight: 35,
      borderRadius: 11,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F4F7F7",
      borderWidth: 1,
      borderColor: "#DEE7E6",
    },
    categoryChipSelected: {
      backgroundColor: "#E6F5F2",
      borderColor: "#91D3C7",
    },
    categoryChipText: {
      color: "#6C7F85",
      fontSize: 8,
      fontWeight: "800",
    },
    categoryChipTextSelected: {
      color: "#167D80",
    },
    gpsCard: {
      marginTop: 10,
      minHeight: 62,
      borderRadius: 14,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#EFF7F5",
      borderWidth: 1,
      borderColor: "#D6E9E4",
    },
    gpsTitle: {
      color: "#315760",
      fontSize: 9,
      fontWeight: "900",
    },
    gpsText: {
      marginTop: 3,
      color: "#74898E",
      fontSize: 7.5,
      lineHeight: 11,
      fontWeight: "600",
    },
    gpsButton: {
      minHeight: 34,
      maxWidth: 112,
      borderRadius: 10,
      paddingHorizontal: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#C9E2DD",
    },
    gpsButtonText: {
      color: "#167D80",
      fontSize: 7.5,
      fontWeight: "900",
      textAlign: "center",
    },
    registerButton: {
      marginTop: 11,
      minHeight: 47,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#173B47",
    },
    registerText: {
      color: "#FFFFFF",
      fontSize: 9.5,
      fontWeight: "900",
    },
    disabled: {
      opacity: 0.5,
    },
    successCard: {
      minHeight: 43,
      borderRadius: 13,
      paddingHorizontal: 11,
      justifyContent: "center",
      backgroundColor: "#E9F8F1",
      borderWidth: 1,
      borderColor: "#CAE6D8",
    },
    successText: {
      color: "#2C7D61",
      fontSize: 8.5,
      fontWeight: "800",
    },
    errorCard: {
      minHeight: 48,
      borderRadius: 14,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#FFF1ED",
      borderWidth: 1,
      borderColor: "#EFCBC1",
    },
    errorMark: {
      width: 23,
      height: 23,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: "#F7DAD1",
      color: "#A44E3C",
      textAlign: "center",
      lineHeight: 23,
      fontSize: 10,
      fontWeight: "900",
    },
    errorText: {
      flex: 1,
      color: "#80564E",
      fontSize: 8,
      lineHeight: 11,
      fontWeight: "600",
    },
    retryText: {
      color: "#15949B",
      fontSize: 8,
      fontWeight: "900",
    },
    loadingCard: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCard: {
      minHeight: 180,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DEE8E7",
    },
    emptyIcon: {
      color: "#A5B4B7",
      fontSize: 24,
    },
    emptyTitle: {
      marginTop: 8,
      color: "#667C82",
      fontSize: 10,
      fontWeight: "800",
    },
    list: {
      gap: 9,
    },
    quarryCard: {
      borderRadius: 19,
      padding: 13,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDE7E6",
    },
    quarryTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    quarryIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#173B47",
    },
    quarryIconText: {
      color: "#78D9C7",
      fontSize: 15,
    },
    quarryName: {
      color: "#24454E",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "900",
    },
    quarryCode: {
      marginTop: 3,
      color: "#839398",
      fontSize: 7.5,
      fontWeight: "700",
    },
    activeBadge: {
      minHeight: 25,
      borderRadius: 999,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EAF8F1",
      borderWidth: 1,
      borderColor: "#C9E6D7",
    },
    inactiveBadge: {
      backgroundColor: "#F4F5F5",
      borderColor: "#E1E5E5",
    },
    activeText: {
      color: "#2D7D61",
      fontSize: 6.5,
      fontWeight: "900",
    },
    inactiveText: {
      color: "#718187",
    },
    detailsGrid: {
      marginTop: 12,
      gap: 7,
    },
    detail: {
      minHeight: 43,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: "#F7F9F9",
    },
    detailLabel: {
      color: "#849499",
      fontSize: 6.8,
      fontWeight: "900",
      letterSpacing: 0.35,
    },
    detailValue: {
      marginTop: 3,
      color: "#39565E",
      fontSize: 8.5,
      lineHeight: 11,
      fontWeight: "700",
    },
    scanLink: {
      marginTop: 10,
      minHeight: 39,
      borderRadius: 12,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      backgroundColor: "#ECF7F5",
      borderWidth: 1,
      borderColor: "#D2E9E4",
    },
    scanLinkText: {
      color: "#167D80",
      fontSize: 8.5,
      fontWeight: "900",
    },
    scanLinkArrow: {
      color: "#15949B",
      fontSize: 19,
    },
  });
