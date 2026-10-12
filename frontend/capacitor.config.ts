import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.granitemeasure.ai",
  appName: "GraniteMeasure AI",
  webDir: "out",
  server: {
    cleartext: process.env.CAPACITOR_DEV_HTTP === "true",
  },
};

export default config;