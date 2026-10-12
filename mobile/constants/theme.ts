export const theme = {
  colors: {
    // Deep stone / slate background palette
    background: '#0a0d12',
    backgroundSecondary: '#10141d',
    surface: '#151b26',
    surfaceRaised: '#1d2433',
    surfaceElevated: '#252e40',

    // Industrial gold / amber accent (Precision engineering)
    primary: '#f59e0b',
    primaryLight: '#fbbf24',
    primaryDark: '#d97706',
    primaryMuted: 'rgba(245, 158, 11, 0.15)',

    // Operational emerald (Verified / Synced / Success)
    success: '#10b981',
    successLight: '#34d399',
    successMuted: 'rgba(16, 185, 129, 0.15)',

    // Tech cyan / blue (Scanning / Processing / SfM)
    info: '#38bdf8',
    infoLight: '#7dd3fc',
    infoMuted: 'rgba(56, 189, 248, 0.15)',

    // Warning amber
    warning: '#f59e0b',
    warningMuted: 'rgba(245, 158, 11, 0.15)',

    // Defect / Error crimson
    danger: '#ef4444',
    dangerLight: '#f87171',
    dangerMuted: 'rgba(239, 68, 68, 0.15)',

    // Crisp typography
    text: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',

    // Precision engineering borders
    border: '#242c3d',
    borderLight: '#334155',
    borderFocused: '#f59e0b',
    borderSuccess: '#10b981',
    borderDanger: '#ef4444',

    // Status mapping
    status: {
      synced: '#10b981',
      pending: '#f59e0b',
      uploading: '#38bdf8',
      failed: '#ef4444',
      analyzed: '#10b981',
      analyzing: '#38bdf8',
      ready: '#fbbf24',
      draft: '#94a3b8',
    },
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    xxxl: 36,
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  typography: {
    eyebrow: {
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
    },
    titleLg: {
      fontSize: 28,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
    },
    titleMd: {
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
    },
    titleSm: {
      fontSize: 18,
      fontWeight: '700' as const,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
    },
    bodySm: {
      fontSize: 13,
      lineHeight: 18,
    },
    caption: {
      fontSize: 11,
      lineHeight: 15,
    },
    metric: {
      fontSize: 24,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
    },
    metricLg: {
      fontSize: 34,
      fontWeight: '900' as const,
      letterSpacing: -1,
    },
  },
  shadows: {
    panel: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    glow: {
      shadowColor: '#f59e0b',
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
  },
} as const;
