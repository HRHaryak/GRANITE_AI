import { useColorScheme as useNativeColorScheme } from "react-native";

export function useColorScheme(): "light" | "dark" {
  const colorScheme = useNativeColorScheme();

  return colorScheme === "dark" ? "dark" : "light";
}