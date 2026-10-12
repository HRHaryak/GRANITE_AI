import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  Text,
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

type TabGlyph =
  | "home"
  | "blocks"
  | "capture"
  | "quarry"
  | "profile";

type IconProps = {
  focused: boolean;
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const compact = width <= 390;
  const tabBarHeight = 70 + Math.max(insets.bottom, 8);

  return (
    <>
      <StatusBar style="dark" />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: false,

          tabBarStyle: {
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 0,
            height: tabBarHeight,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingHorizontal: compact ? 3 : 6,
            backgroundColor: "#172635",
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: "#2A3C4C",
            borderRadius: 27,
            overflow: "visible",

            ...Platform.select({
              ios: {
                shadowColor: "#0B1A26",
                shadowOffset: {
                  width: 0,
                  height: 10,
                },
                shadowOpacity: 0.2,
                shadowRadius: 22,
              },
              android: {
                elevation: 16,
              },
            }),
          },

          tabBarItemStyle: {
            height: 58,
            marginTop: 0,
            overflow: "visible",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }: IconProps) => (
              <RegularTabIcon
                focused={focused}
                label="Home"
                glyph="home"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="blocks"
          options={{
            title: "Blocks",
            tabBarIcon: ({ focused }: IconProps) => (
              <RegularTabIcon
                focused={focused}
                label="Blocks"
                glyph="blocks"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="capture"
          options={{
            title: "Scan",
            tabBarIcon: ({ focused }: IconProps) => (
              <CaptureTabIcon focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="quarries"
          options={{
            title: "Quarries",
            tabBarIcon: ({ focused }: IconProps) => (
              <RegularTabIcon
                focused={focused}
                label={compact ? "Quarry" : "Quarries"}
                glyph="quarry"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ focused }: IconProps) => (
              <RegularTabIcon
                focused={focused}
                label="Profile"
                glyph="profile"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="analytics"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </>
  );
}

function RegularTabIcon({
  focused,
  label,
  glyph,
}: {
  focused: boolean;
  label: string;
  glyph: TabGlyph;
}) {
  return (
    <View
      style={[
        styles.regularTab,
        focused && styles.regularTabFocused,
      ]}
    >
      <MobileGlyph
        glyph={glyph}
        focused={focused}
      />

      <Text
        numberOfLines={1}
        style={[
          styles.regularLabel,
          focused && styles.regularLabelFocused,
        ]}
      >
        {label}
      </Text>

      {focused ? (
        <View style={styles.activeDot} />
      ) : null}
    </View>
  );
}

function CaptureTabIcon({
  focused,
}: {
  focused: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      pulse.value,
      [0, 1],
      [0.22, 0.04],
    ),
    transform: [
      {
        scale: interpolate(
          pulse.value,
          [0, 1],
          [0.96, 1.18],
        ),
      },
    ],
  }));

  return (
    <View style={styles.captureWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.capturePulse,
          pulseStyle,
        ]}
      />

      <View
        style={[
          styles.captureButton,
          focused && styles.captureButtonFocused,
        ]}
      >
        <MobileGlyph
          glyph="capture"
          focused
        />
      </View>

      <Text
        style={[
          styles.captureLabel,
          focused && styles.captureLabelFocused,
        ]}
      >
        Scan
      </Text>
    </View>
  );
}

function MobileGlyph({
  glyph,
  focused,
}: {
  glyph: TabGlyph;
  focused: boolean;
}) {
  const stroke = focused
    ? "#0E8E96"
    : "#8EA1B3";

  if (glyph === "home") {
    return (
      <View style={styles.glyphBox}>
        <View
          style={[
            styles.homeRoof,
            {
              borderColor: stroke,
            },
          ]}
        />

        <View
          style={[
            styles.homeBase,
            {
              borderColor: stroke,
            },
          ]}
        />
      </View>
    );
  }

  if (glyph === "blocks") {
    return (
      <View style={styles.glyphBox}>
        <View
          style={[
            styles.blockBack,
            {
              borderColor: stroke,
            },
          ]}
        />

        <View
          style={[
            styles.blockFront,
            {
              borderColor: stroke,
            },
          ]}
        />
      </View>
    );
  }

  if (glyph === "capture") {
    return (
      <View style={styles.scanGlyph}>
        <View
          style={[
            styles.scanCorner,
            styles.scanTopLeft,
          ]}
        />
        <View
          style={[
            styles.scanCorner,
            styles.scanTopRight,
          ]}
        />
        <View
          style={[
            styles.scanCorner,
            styles.scanBottomLeft,
          ]}
        />
        <View
          style={[
            styles.scanCorner,
            styles.scanBottomRight,
          ]}
        />
        <View style={styles.scanCore} />
      </View>
    );
  }

  if (glyph === "quarry") {
    return (
      <View style={styles.glyphBox}>
        <View
          style={[
            styles.mountainLarge,
            {
              borderBottomColor: stroke,
            },
          ]}
        />

        <View
          style={[
            styles.mountainSmall,
            {
              borderBottomColor: stroke,
            },
          ]}
        />
      </View>
    );
  }

  return (
    <View style={styles.glyphBox}>
      <View
        style={[
          styles.profileHead,
          {
            borderColor: stroke,
          },
        ]}
      />

      <View
        style={[
          styles.profileBody,
          {
            borderColor: stroke,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  regularTab: {
    minWidth: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  regularTabFocused: {
    backgroundColor: "#EEF8F7",
    borderWidth: 1,
    borderColor: "#C9EDEC",
  },

  regularLabel: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: "#8296A8",
    letterSpacing: 0.05,
  },

  regularLabelFocused: {
    color: "#0F737A",
    fontWeight: "800",
  },

  activeDot: {
    position: "absolute",
    bottom: 3,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#19B4B8",
  },

  glyphBox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  homeRoof: {
    position: "absolute",
    top: 2,
    width: 13,
    height: 13,
    borderLeftWidth: 1.7,
    borderTopWidth: 1.7,
    transform: [
      {
        rotate: "45deg",
      },
    ],
    borderTopLeftRadius: 2,
  },

  homeBase: {
    position: "absolute",
    bottom: 2,
    width: 13,
    height: 11,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },

  blockBack: {
    position: "absolute",
    top: 3,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 4,
    borderWidth: 1.6,
  },

  blockFront: {
    position: "absolute",
    left: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 4,
    borderWidth: 1.6,
    backgroundColor: "transparent",
  },

  scanGlyph: {
    width: 27,
    height: 27,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  scanCorner: {
    position: "absolute",
    width: 9,
    height: 9,
    borderColor: "#F7FFFF",
  },

  scanTopLeft: {
    left: 1,
    top: 1,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: 3,
  },

  scanTopRight: {
    right: 1,
    top: 1,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderTopRightRadius: 3,
  },

  scanBottomLeft: {
    left: 1,
    bottom: 1,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 3,
  },

  scanBottomRight: {
    right: 1,
    bottom: 1,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 3,
  },

  scanCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E8FFFF",
  },

  mountainLarge: {
    position: "absolute",
    left: 1,
    bottom: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },

  mountainSmall: {
    position: "absolute",
    right: 0,
    bottom: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },

  profileHead: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.6,
  },

  profileBody: {
    position: "absolute",
    bottom: 1,
    width: 16,
    height: 9,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 1.6,
    borderBottomWidth: 0,
  },

  captureWrap: {
    width: 68,
    height: 74,
    marginTop: -17,
    alignItems: "center",
    justifyContent: "flex-start",
  },

  capturePulse: {
    position: "absolute",
    top: -2,
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: "#48CFCD",
  },

  captureButton: {
    width: 58,
    height: 58,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: "#DDF7F4",
    backgroundColor: "#168C93",
    alignItems: "center",
    justifyContent: "center",

    ...Platform.select({
      ios: {
        shadowColor: "#37C8C4",
        shadowOffset: {
          width: 0,
          height: 7,
        },
        shadowOpacity: 0.27,
        shadowRadius: 13,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  captureButtonFocused: {
    backgroundColor: "#0D7379",
    borderColor: "#F2FFFD",
  },

  captureLabel: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: "#91A6B7",
  },

  captureLabelFocused: {
    color: "#D7FAF5",
  },
});
