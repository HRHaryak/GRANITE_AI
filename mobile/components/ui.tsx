import React, { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { theme } from '../constants/theme';

export const colors = {
  ink: theme.colors.background,
  inkSecondary: theme.colors.backgroundSecondary,
  panel: theme.colors.surface,
  panelRaised: theme.colors.surfaceRaised,
  panelElevated: theme.colors.surfaceElevated,
  surfaceElevated: theme.colors.surfaceElevated,
  stone: theme.colors.text,
  stoneSecondary: theme.colors.textSecondary,
  muted: theme.colors.textMuted,
  subtle: theme.colors.textSubtle,
  amber: theme.colors.primary,
  amberLight: theme.colors.primaryLight,
  amberMuted: theme.colors.primaryMuted,
  mint: theme.colors.success,
  mintMuted: theme.colors.successMuted,
  cyan: theme.colors.info,
  cyanMuted: theme.colors.infoMuted,
  line: theme.colors.border,
  lineLight: theme.colors.borderLight,
  danger: theme.colors.danger,
  dangerMuted: theme.colors.dangerMuted,
};

export function Button({
  label,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.amber : colors.ink} size="small" />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
          <Text
            style={[
              styles.buttonText,
              secondary && styles.buttonSecondaryText,
              danger && styles.buttonDangerText,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Panel({
  children,
  style,
  glow = false,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
}>) {
  return (
    <View style={[styles.panel, glow && styles.panelGlow, style]}>
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  unit,
  keyboardType = 'default',
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  unit?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  error?: string | null;
}) {
  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.label}>{label}</Text>
        {unit ? <Text style={styles.unitText}>{unit}</Text> : null}
      </View>
      <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.subtle}
          keyboardType={keyboardType}
          style={styles.input}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ProvenanceBadge({
  tag,
}: {
  tag: 'OBSERVED' | 'RECONSTRUCTED' | 'DERIVED' | 'ESTIMATED' | 'ASSUMED' | 'SIMULATED' | 'DEMO' | string;
}) {
  const upper = (tag || '').toUpperCase();
  let bg: string = 'rgba(255, 255, 255, 0.05)';
  let col: string = colors.muted;

  if (upper.includes('OBSERVED') || upper.includes('RECONSTRUCTED')) {
    bg = 'rgba(16, 185, 129, 0.15)';
    col = colors.mint;
  } else if (upper.includes('DERIVED')) {
    bg = 'rgba(56, 189, 248, 0.15)';
    col = colors.cyan;
  } else if (upper.includes('ESTIMATED')) {
    bg = 'rgba(245, 158, 11, 0.15)';
    col = colors.amber;
  } else if (upper.includes('ASSUMED') || upper.includes('SIMULATED') || upper.includes('DEMO')) {
    bg = 'rgba(239, 68, 68, 0.15)';
    col = colors.danger;
  }

  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: col, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{upper}</Text>
    </View>
  );
}

export function DualMetricCard({
  label,
  primaryValue,
  primaryUnit,
  secondaryValue,
  secondaryUnit,
  uncertainty,
  provenance,
  status = 'default',
  style,
}: {
  label: string;
  primaryValue: string | number;
  primaryUnit?: string;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  uncertainty?: string;
  provenance?: string;
  status?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  style?: StyleProp<ViewStyle>;
}) {
  const valueColor =
    status === 'success'
      ? colors.mint
      : status === 'warning'
      ? colors.amber
      : status === 'danger'
      ? colors.danger
      : status === 'info'
      ? colors.cyan
      : colors.stone;

  return (
    <View style={[styles.metricCard, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.metricLabel}>{label}</Text>
        {provenance ? <ProvenanceBadge tag={provenance} /> : null}
      </View>
      <Text style={[styles.metricValue, { color: valueColor }]}>
        {primaryValue}{' '}
        {primaryUnit ? <Text style={styles.metricUnit}>{primaryUnit}</Text> : null}
      </Text>
      {secondaryValue != null ? (
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
          {secondaryValue} {secondaryUnit || ''}
        </Text>
      ) : null}
      {uncertainty ? <Text style={styles.metricSublabel}>{uncertainty}</Text> : null}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  sublabel,
  status = 'default',
  style,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  status?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  style?: StyleProp<ViewStyle>;
}) {
  const valueColor =
    status === 'success'
      ? colors.mint
      : status === 'warning'
      ? colors.amber
      : status === 'danger'
      ? colors.danger
      : status === 'info'
      ? colors.cyan
      : colors.stone;

  return (
    <View style={[styles.metricCard, style]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>
        {value}{' '}
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </Text>
      {sublabel ? <Text style={styles.metricSublabel}>{sublabel}</Text> : null}
    </View>
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const s = status.toLowerCase();
  let bg: string = colors.panelElevated;
  let textCol: string = colors.muted;
  let borderCol: string = colors.line;

  if (['synced', 'analyzed', 'completed', 'operational', 'high', 'verified'].includes(s)) {
    bg = colors.mintMuted;
    textCol = colors.mint;
    borderCol = 'rgba(16, 185, 129, 0.4)';
  } else if (['pending', 'ready', 'ready_for_analysis', 'medium', 'degraded', 'draft'].includes(s)) {
    bg = colors.amberMuted;
    textCol = colors.amber;
    borderCol = 'rgba(245, 158, 11, 0.4)';
  } else if (['uploading', 'processing', 'analyzing', 'created', 'queued'].includes(s)) {
    bg = colors.cyanMuted;
    textCol = colors.cyan;
    borderCol = 'rgba(56, 189, 248, 0.4)';
  } else if (['failed', 'rejected', 'low', 'insufficient', 'unavailable', 'analysis_failed'].includes(s)) {
    bg = colors.dangerMuted;
    textCol = colors.danger;
    borderCol = 'rgba(239, 68, 68, 0.4)';
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: borderCol }]}>
      <View style={[styles.badgeDot, { backgroundColor: textCol }]} />
      <Text style={[styles.badgeText, { color: textCol }]}>
        {label || status.toUpperCase().replaceAll('_', ' ')}
      </Text>
    </View>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  rightAction,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} secondary onPress={onAction} style={{ marginTop: 12 }} />
      ) : null}
    </View>
  );
}

export function SkeletonCard({ height = 72, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          height,
          backgroundColor: colors.inkSecondary,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: 14,
          overflow: 'hidden',
          padding: 14,
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      <View style={{ width: '45%', height: 12, backgroundColor: colors.panelRaised, borderRadius: 4 }} />
      <View style={{ width: '75%', height: 10, backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: 3 }} />
    </View>
  );
}

export function ProgressBar({
  progress,
  stage,
}: {
  progress: number;
  stage?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${clamped}%` }]} />
      </View>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressStage}>{stage || 'Processing...'}</Text>
        <Text style={styles.progressPercent}>{clamped}%</Text>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: colors.stone,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1.2,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  panelGlow: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.amber,
  },
  buttonSecondary: {
    backgroundColor: colors.panelRaised,
    borderColor: colors.line,
    borderWidth: 1.2,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonIcon: {
    marginRight: 2,
  },
  buttonText: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  buttonSecondaryText: {
    color: colors.stone,
  },
  buttonDangerText: {
    color: '#ffffff',
  },
  fieldContainer: {
    gap: 6,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  unitText: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: '600',
  },
  inputWrapper: {
    borderColor: colors.line,
    borderWidth: 1.2,
    borderRadius: 12,
    backgroundColor: colors.inkSecondary,
  },
  inputWrapperError: {
    borderColor: colors.danger,
  },
  input: {
    color: colors.stone,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  errorText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.panelRaised,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'center',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  metricUnit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  metricSublabel: {
    color: colors.subtle,
    fontSize: 10,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyStateContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.line,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  emptyTitle: {
    color: colors.stone,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyMessage: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  progressContainer: {
    gap: 6,
    marginVertical: 4,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.panelRaised,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.amber,
    borderRadius: 3,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressStage: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  progressPercent: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '800',
  },
});
