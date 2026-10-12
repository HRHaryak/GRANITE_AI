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
} from "react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Language = "te" | "en";

type DemoUser = {
  id: string;
  name: string;
  role?: string | null;
  is_active?: boolean | null;
  avatar_initials?: string | null;
};

type ConnectionState =
  | "idle"
  | "testing"
  | "reachable"
  | "partial"
  | "failed";

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
    eyebrow: "యూజర్ & యాప్",
    title: "ప్రొఫైల్",
    subtitle:
      "యూజర్ ఎంపిక, తెలుగు ప్రాధాన్యత మరియు బ్యాక్‌ఎండ్ కనెక్షన్.",
    activeUser: "ప్రస్తుత యూజర్",
    noUser: "యూజర్ ఎంచుకోలేదు",
    role: "బ్యాక్‌ఎండ్ పాత్ర",
    id: "యూజర్ ID",
    active: "యాక్టివ్",
    inactive: "ఇనాక్టివ్",
    users: "యూజర్లు",
    usersSub:
      "బ్యాక్‌ఎండ్ ఇచ్చిన యూజర్లలో ఒకరిని ఈ మొబైల్ సెషన్‌కు ఎంచుకోండి.",
    selected: "ఎంచుకున్నారు",
    choose: "ఎంచుకోండి",
    language: "భాష ప్రాధాన్యత",
    languageSub:
      "తెలుగు ప్రధాన భాష. అవసరమైతే English కు మార్చవచ్చు.",
    telugu: "తెలుగు",
    english: "English",
    connection: "బ్యాక్‌ఎండ్ కనెక్షన్",
    endpoint: "ప్రస్తుత API",
    test: "కనెక్షన్ టెస్ట్",
    testing: "పరీక్షిస్తోంది…",
    reachable: "కనెక్ట్ అయింది",
    partial: "సర్వర్ చేరింది · AI సామర్థ్యాలు పరిమితం",
    failed: "కనెక్షన్ విఫలమైంది",
    notTested: "ఇంకా పరీక్షించలేదు",
    truth:
      "కనెక్షన్ విజయవంతమవడం మాత్రమే అన్ని AI మోడళ్లు పనిచేస్తున్నాయని అర్థం కాదు.",
    ai: "తెలుగు AI Assistant",
    aiSub:
      "AI సమాధానాలు ఎంపిక చేసిన విశ్లేషిత బ్లాక్ ఆధారాల నుంచే రావాలి.",
    openAI: "AI తెరవండి",
    retry: "మళ్లీ ప్రయత్నించండి",
  },
  en: {
    eyebrow: "USER & APP",
    title: "Profile",
    subtitle:
      "User attribution, Telugu preference and backend connectivity.",
    activeUser: "Current User",
    noUser: "No user selected",
    role: "Backend Role",
    id: "User ID",
    active: "ACTIVE",
    inactive: "INACTIVE",
    users: "Users",
    usersSub:
      "Select one backend-returned user for this mobile session.",
    selected: "Selected",
    choose: "Select",
    language: "Language Preference",
    languageSub:
      "Telugu is the primary language; English remains available.",
    telugu: "తెలుగు",
    english: "English",
    connection: "Backend Connection",
    endpoint: "Active API",
    test: "Test Connection",
    testing: "Testing…",
    reachable: "Reachable",
    partial: "Server reachable · AI capability limited",
    failed: "Connection failed",
    notTested: "Not tested yet",
    truth:
      "Reachability alone does not prove that every AI provider is operational.",
    ai: "Telugu AI Assistant",
    aiSub:
      "AI answers should remain grounded in the selected analyzed block.",
    openAI: "Open AI",
    retry: "Retry",
  },
} as const;

async function apiRequest<T>(
  path: string,
): Promise<T> {
  const headers =
    new Headers({
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
    const raw =
      await response.text().catch(
        () => "",
      );

    throw new Error(
      raw ||
        `HTTP ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function initials(
  user: DemoUser | null,
): string {
  if (user?.avatar_initials) {
    return user.avatar_initials
      .slice(0, 2)
      .toUpperCase();
  }

  const parts =
    user?.name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean) || [];

  if (parts.length === 0) {
    return "—";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[
      parts.length - 1
    ][0]
  ).toUpperCase();
}

export default function ProfileScreen() {
  const insets =
    useSafeAreaInsets();

  const [language, setLanguage] =
    useState<Language>("te");

  const [users, setUsers] =
    useState<DemoUser[]>([]);

  const [
    selectedUserId,
    setSelectedUserId,
  ] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    connection,
    setConnection,
  ] =
    useState<ConnectionState>(
      "idle",
    );

  const [error, setError] =
    useState<string | null>(null);

  const copy = COPY[language];

  const selectedUser =
    useMemo(
      () =>
        users.find(
          (user) =>
            user.id ===
            selectedUserId,
        ) ?? null,
      [selectedUserId, users],
    );

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
          savedLanguage,
          savedUser,
          userResult,
        ] = await Promise.all([
          SecureStore.getItemAsync(
            LANGUAGE_KEY,
          ).catch(() => null),
          SecureStore.getItemAsync(
            SELECTED_USER_KEY,
          ).catch(() => null),
          apiRequest<DemoUser[]>(
            "/demo-users",
          ),
        ]);

        if (
          savedLanguage === "te" ||
          savedLanguage === "en"
        ) {
          setLanguage(
            savedLanguage,
          );
        }

        const values =
          Array.isArray(userResult)
            ? userResult
            : [];

        setUsers(values);

        if (
          savedUser &&
          values.some(
            (user) =>
              user.id === savedUser &&
              user.is_active !==
                false,
          )
        ) {
          setSelectedUserId(
            savedUser,
          );
        } else {
          setSelectedUserId("");
          if (savedUser) {
            await SecureStore.deleteItemAsync(
              SELECTED_USER_KEY,
            ).catch(
              () => undefined,
            );
          }
        }
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

  const selectUser =
    useCallback(
      async (
        user: DemoUser,
      ) => {
        if (
          user.is_active === false
        ) {
          return;
        }

        await SecureStore.setItemAsync(
          SELECTED_USER_KEY,
          user.id,
        );

        setSelectedUserId(
          user.id,
        );
      },
      [],
    );

  const selectLanguage =
    useCallback(
      async (
        next: Language,
      ) => {
        setLanguage(next);
        await SecureStore.setItemAsync(
          LANGUAGE_KEY,
          next,
        ).catch(
          () => undefined,
        );
      },
      [],
    );

  const testConnection =
    useCallback(async () => {
      if (
        connection === "testing"
      ) {
        return;
      }

      setConnection("testing");
      setError(null);

      try {
        const health =
          await fetch(
            `${SERVER_ROOT}/health`,
            {
              headers: {
                Accept:
                  "application/json",
              },
            },
          );

        if (!health.ok) {
          throw new Error(
            `Health HTTP ${health.status}`,
          );
        }

        try {
          await apiRequest<
            Record<string, unknown>
          >("/capabilities");

          setConnection(
            "reachable",
          );
        } catch {
          setConnection("partial");
        }
      } catch (cause) {
        setConnection("failed");
        setError(
          cause instanceof Error
            ? cause.message
            : copy.failed,
        );
      }
    }, [
      connection,
      copy.failed,
    ]);

  const connectionLabel =
    connection === "testing"
      ? copy.testing
      : connection ===
          "reachable"
        ? copy.reachable
        : connection === "partial"
          ? copy.partial
          : connection ===
              "failed"
            ? copy.failed
            : copy.notTested;

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
          <Text style={styles.eyebrow}>
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
        </Animated.View>

        <Animated.View
          entering={FadeInDown
            .delay(35)
            .duration(320)}
          style={styles.profileCard}
        >
          <View
            pointerEvents="none"
            style={styles.profileGlow}
          />

          <View
            style={styles.avatar}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#78D9C7"
              />
            ) : (
              <Text
                style={styles.avatarText}
              >
                {initials(
                  selectedUser,
                )}
              </Text>
            )}
          </View>

          <View style={styles.flexOne}>
            <Text
              style={styles.cardEyebrow}
            >
              {copy.activeUser}
            </Text>
            <Text
              numberOfLines={1}
              style={styles.userName}
            >
              {selectedUser?.name ||
                copy.noUser}
            </Text>

            <View
              style={styles.roleRow}
            >
              <Text
                style={styles.userRole}
              >
                {selectedUser?.role ||
                  "—"}
              </Text>

              {selectedUser ? (
                <View
                  style={[
                    styles.userStatus,
                    selectedUser.is_active ===
                      false &&
                      styles.userStatusOff,
                  ]}
                >
                  <Text
                    style={[
                      styles.userStatusText,
                      selectedUser.is_active ===
                        false &&
                        styles.userStatusTextOff,
                    ]}
                  >
                    {selectedUser.is_active ===
                    false
                      ? copy.inactive
                      : copy.active}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {selectedUser ? (
          <View
            style={styles.userMetaCard}
          >
            <InfoRow
              label={copy.role}
              value={
                selectedUser.role ||
                "—"
              }
            />
            <InfoRow
              label={copy.id}
              value={
                selectedUser.id
              }
              last
            />
          </View>
        ) : null}

        <SectionTitle
          title={copy.users}
          subtitle={copy.usersSub}
        />

        <View style={styles.userList}>
          {loading ? (
            <View
              style={styles.loadingCard}
            >
              <ActivityIndicator
                size="small"
                color="#15949B"
              />
            </View>
          ) : users.length === 0 ? (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={styles.emptyText}
              >
                {language === "te"
                  ? "బ్యాక్‌ఎండ్‌లో యూజర్లు లేరు."
                  : "No users returned by the backend."}
              </Text>
            </View>
          ) : (
            users.map((user) => {
              const selected =
                user.id ===
                selectedUserId;

              return (
                <Pressable
                  key={user.id}
                  disabled={
                    user.is_active ===
                    false
                  }
                  onPress={() =>
                    void selectUser(
                      user,
                    )
                  }
                  style={({ pressed }) => [
                    styles.userRow,
                    selected &&
                      styles.userRowSelected,
                    user.is_active ===
                      false &&
                      styles.userRowInactive,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.userMiniAvatar,
                      selected &&
                        styles.userMiniAvatarSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.userMiniAvatarText,
                        selected &&
                          styles.userMiniAvatarTextSelected,
                      ]}
                    >
                      {initials(user)}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.flexOne
                    }
                  >
                    <Text
                      numberOfLines={1}
                      style={
                        styles.userRowName
                      }
                    >
                      {user.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={
                        styles.userRowRole
                      }
                    >
                      {user.role ||
                        "—"}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.chooseText,
                      selected &&
                        styles.chooseTextSelected,
                    ]}
                  >
                    {selected
                      ? copy.selected
                      : copy.choose}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>

        <SectionTitle
          title={copy.language}
          subtitle={copy.languageSub}
        />

        <View
          style={styles.languageCard}
        >
          <LanguageChoice
            label={copy.telugu}
            active={
              language === "te"
            }
            onPress={() =>
              void selectLanguage(
                "te",
              )
            }
          />
          <LanguageChoice
            label={copy.english}
            active={
              language === "en"
            }
            onPress={() =>
              void selectLanguage(
                "en",
              )
            }
          />
        </View>

        <SectionTitle
          title={copy.connection}
          subtitle={copy.truth}
        />

        <View
          style={styles.connectionCard}
        >
          <View
            style={styles.connectionTop}
          >
            <View
              style={[
                styles.connectionDot,
                connection ===
                  "reachable" &&
                  styles.connectionDotGood,
                connection ===
                  "partial" &&
                  styles.connectionDotWarn,
                connection ===
                  "failed" &&
                  styles.connectionDotBad,
              ]}
            />

            <View
              style={styles.flexOne}
            >
              <Text
                style={
                  styles.connectionLabel
                }
              >
                {connectionLabel}
              </Text>

              <Text
                numberOfLines={2}
                style={
                  styles.endpoint
                }
              >
                {copy.endpoint}:{" "}
                {API_ROOT}
              </Text>
            </View>
          </View>

          <Pressable
            disabled={
              connection === "testing"
            }
            onPress={() =>
              void testConnection()
            }
            style={[
              styles.testButton,
              connection ===
                "testing" &&
                styles.disabled,
            ]}
          >
            {connection ===
            "testing" ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.testButtonText
                }
              >
                {copy.test}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() =>
            router.push(
              "/blocks" as never,
            )
          }
          style={({ pressed }) => [
            styles.aiCard,
            pressed &&
              styles.pressed,
          ]}
        >
          <View style={styles.aiOrb}>
            <Text
              style={styles.aiOrbText}
            >
              AI
            </Text>
          </View>

          <View style={styles.flexOne}>
            <Text
              style={styles.aiTitle}
            >
              {copy.ai}
            </Text>
            <Text
              style={styles.aiText}
            >
              {copy.aiSub}
            </Text>
          </View>

          <Text style={styles.aiArrow}>
            ›
          </Text>
        </Pressable>

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
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View
      style={styles.sectionHeader}
    >
      <Text
        style={styles.sectionTitle}
      >
        {title}
      </Text>
      <Text
        style={styles.sectionSub}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last &&
          styles.infoRowLast,
      ]}
    >
      <Text
        style={styles.infoLabel}
      >
        {label}
      </Text>
      <Text
        selectable
        numberOfLines={2}
        style={styles.infoValue}
      >
        {value}
      </Text>
    </View>
  );
}

function LanguageChoice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.languageChoice,
        active &&
          styles.languageChoiceActive,
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={[
          styles.languageChoiceDot,
          active &&
            styles.languageChoiceDotActive,
        ]}
      />
      <Text
        style={[
          styles.languageChoiceText,
          active &&
            styles.languageChoiceTextActive,
        ]}
      >
        {label}
      </Text>
      {active ? (
        <Text
          style={
            styles.languageCheck
          }
        >
          ✓
        </Text>
      ) : null}
    </Pressable>
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
      width: 310,
      height: 310,
      borderRadius: 155,
      top: -180,
      right: -140,
      backgroundColor:
        "rgba(70,194,175,0.09)",
    },
    content: {
      width: "100%",
      maxWidth: 680,
      alignSelf: "center",
      paddingHorizontal: 15,
      gap: 10,
    },
    header: {
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
      maxWidth: 350,
      color: "#75898E",
      fontSize: 9.5,
      lineHeight: 14,
      fontWeight: "600",
    },
    profileCard: {
      minHeight: 116,
      borderRadius: 22,
      padding: 14,
      overflow: "hidden",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: "#173B47",
    },
    profileGlow: {
      position: "absolute",
      width: 190,
      height: 190,
      borderRadius: 95,
      right: -80,
      top: -115,
      backgroundColor:
        "rgba(83,211,188,0.12)",
    },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "rgba(109,218,197,0.12)",
      borderWidth: 1,
      borderColor:
        "rgba(109,218,197,0.22)",
    },
    avatarText: {
      color: "#80DCCB",
      fontSize: 18,
      fontWeight: "900",
    },
    cardEyebrow: {
      color: "#78D9C7",
      fontSize: 7.2,
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    userName: {
      marginTop: 4,
      color: "#FFFFFF",
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "900",
    },
    roleRow: {
      marginTop: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    userRole: {
      flexShrink: 1,
      color: "#A8BEC3",
      fontSize: 8.5,
      fontWeight: "700",
    },
    userStatus: {
      minHeight: 21,
      borderRadius: 999,
      paddingHorizontal: 7,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "rgba(91,207,169,0.11)",
      borderWidth: 1,
      borderColor:
        "rgba(91,207,169,0.18)",
    },
    userStatusOff: {
      backgroundColor:
        "rgba(197,126,107,0.10)",
      borderColor:
        "rgba(197,126,107,0.18)",
    },
    userStatusText: {
      color: "#6FD2AE",
      fontSize: 6.3,
      fontWeight: "900",
    },
    userStatusTextOff: {
      color: "#D39B89",
    },
    userMetaCard: {
      borderRadius: 17,
      paddingHorizontal: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDE7E6",
    },
    infoRow: {
      minHeight: 48,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor: "#E5ECEB",
    },
    infoRowLast: {
      borderBottomWidth: 0,
    },
    infoLabel: {
      width: 96,
      color: "#829297",
      fontSize: 7.5,
      fontWeight: "900",
    },
    infoValue: {
      flex: 1,
      color: "#31515A",
      fontSize: 8.5,
      lineHeight: 12,
      fontWeight: "700",
      textAlign: "right",
    },
    sectionHeader: {
      marginTop: 6,
      marginBottom: -1,
    },
    sectionTitle: {
      color: "#24454E",
      fontSize: 11,
      fontWeight: "900",
    },
    sectionSub: {
      marginTop: 3,
      color: "#7B8D92",
      fontSize: 8,
      lineHeight: 12,
      fontWeight: "600",
    },
    userList: {
      gap: 7,
    },
    loadingCard: {
      minHeight: 90,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCard: {
      minHeight: 80,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DEE7E6",
    },
    emptyText: {
      color: "#7B8D92",
      fontSize: 8.5,
      fontWeight: "700",
    },
    userRow: {
      minHeight: 62,
      borderRadius: 16,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DEE7E6",
    },
    userRowSelected: {
      backgroundColor: "#ECF8F5",
      borderColor: "#A9DBD0",
    },
    userRowInactive: {
      opacity: 0.5,
    },
    userMiniAvatar: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EFF3F3",
    },
    userMiniAvatarSelected: {
      backgroundColor: "#173B47",
    },
    userMiniAvatarText: {
      color: "#60777E",
      fontSize: 9,
      fontWeight: "900",
    },
    userMiniAvatarTextSelected: {
      color: "#78D9C7",
    },
    userRowName: {
      color: "#2A4851",
      fontSize: 10,
      fontWeight: "900",
    },
    userRowRole: {
      marginTop: 3,
      color: "#839398",
      fontSize: 7.5,
      fontWeight: "700",
    },
    chooseText: {
      color: "#7A8D92",
      fontSize: 7.5,
      fontWeight: "900",
    },
    chooseTextSelected: {
      color: "#167D80",
    },
    languageCard: {
      flexDirection: "row",
      gap: 8,
    },
    languageChoice: {
      flex: 1,
      minHeight: 54,
      borderRadius: 16,
      paddingHorizontal: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDE7E6",
    },
    languageChoiceActive: {
      backgroundColor: "#EAF7F4",
      borderColor: "#9ED7CC",
    },
    languageChoiceDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: "#B8C4C6",
    },
    languageChoiceDotActive: {
      backgroundColor: "#15949B",
    },
    languageChoiceText: {
      flex: 1,
      color: "#637A81",
      fontSize: 9,
      fontWeight: "800",
    },
    languageChoiceTextActive: {
      color: "#23525B",
      fontWeight: "900",
    },
    languageCheck: {
      color: "#15949B",
      fontSize: 11,
      fontWeight: "900",
    },
    connectionCard: {
      borderRadius: 18,
      padding: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDE7E6",
    },
    connectionTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    connectionDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: "#B7C2C4",
    },
    connectionDotGood: {
      backgroundColor: "#39A276",
    },
    connectionDotWarn: {
      backgroundColor: "#D29A3F",
    },
    connectionDotBad: {
      backgroundColor: "#C45B47",
    },
    connectionLabel: {
      color: "#294A53",
      fontSize: 9.5,
      fontWeight: "900",
    },
    endpoint: {
      marginTop: 3,
      color: "#809197",
      fontSize: 7.2,
      lineHeight: 10,
      fontWeight: "600",
    },
    testButton: {
      marginTop: 11,
      minHeight: 43,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#173B47",
    },
    testButtonText: {
      color: "#FFFFFF",
      fontSize: 8.5,
      fontWeight: "900",
    },
    disabled: {
      opacity: 0.5,
    },
    aiCard: {
      minHeight: 76,
      borderRadius: 18,
      padding: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "#E9F6F3",
      borderWidth: 1,
      borderColor: "#CFE7E1",
    },
    aiOrb: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#173B47",
    },
    aiOrbText: {
      color: "#78D9C7",
      fontSize: 11,
      fontWeight: "900",
    },
    aiTitle: {
      color: "#28515B",
      fontSize: 10.5,
      fontWeight: "900",
    },
    aiText: {
      marginTop: 3,
      color: "#70878D",
      fontSize: 8,
      lineHeight: 12,
      fontWeight: "600",
    },
    aiArrow: {
      color: "#699197",
      fontSize: 23,
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
      color: "#A34D3B",
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
    pressed: {
      opacity: 0.75,
      transform: [
        { scale: 0.985 },
      ],
    },
  });
