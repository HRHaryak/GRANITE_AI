import {
  Text as DefaultText,
  View as DefaultView,
  type TextProps as RNTextProps,
  type ViewProps,
} from "react-native";

import Colors from "../constants/Colors";
import { useColorScheme } from "./useColorScheme";

export type TextProps = RNTextProps;

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type ThemedTextProps = TextProps &
  ThemeProps & {
    colorName?: keyof typeof Colors.light & keyof typeof Colors.dark;
  };

export type ThemedViewProps = ViewProps & ThemeProps;

function useThemeColor(
  props: ThemeProps,
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? "light";

  const colorFromProps =
    theme === "dark" ? props.darkColor : props.lightColor;

  if (colorFromProps) {
    return colorFromProps;
  }

  return Colors[theme][colorName];
}

export function Text(props: ThemedTextProps) {
  const {
    style,
    lightColor,
    darkColor,
    colorName = "text",
    ...otherProps
  } = props;

  const color = useThemeColor(
    { lightColor, darkColor },
    colorName
  );

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ThemedViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;

  const backgroundColor = useThemeColor(
    { lightColor, darkColor },
    "background"
  );

  return (
    <DefaultView
      style={[{ backgroundColor }, style]}
      {...otherProps}
    />
  );
}