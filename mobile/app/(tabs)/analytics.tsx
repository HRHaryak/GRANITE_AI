import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BrandLogo } from '../../components/BrandLogo';
import {
  colors,
  MetricCard,
  Panel,
  SectionHeader,
  StatusBadge,
  styles,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCaptureStore } from '../../lib/store';
import { useTranslation } from '../../lib/i18n';

export default function Analytics() {
  const { t } = useTranslation();
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: api.blocks });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: api.capabilities });
  const [refreshing, setRefreshing] = useState(false);
  const { images, queueState } = useCaptureStore();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([blocks.refetch(), capabilities.refetch()]);
    setRefreshing(false);
  };

  const allBlocks = blocks.data ?? [];
  const analyzedCount = allBlocks.filter((b) => b.status === 'ANALYZED').length;
  const processingCount = allBlocks.filter((b) =>
    ['READY_FOR_ANALYSIS', 'ANALYZING', 'CAPTURE_IN_PROGRESS'].includes(b.status)
  ).length;

  const caps = capabilities.data ?? {};

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
    >
      {/* Top Brand Bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <BrandLogo size={42} withText subtitle="SYSTEM INTELLIGENCE" />
        <StatusBadge status="operational" label="DIAGNOSTICS" />
      </View>

      <SectionHeader
        eyebrow="ANALYTICS / 05"
        title={t('analytics_title')}
        subtitle={t('analytics_subtitle')}
      />

      {/* Operational Stats Grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <MetricCard label={t('total_blocks')} value={allBlocks.length || '--'} sublabel={t('registered_blocks')} />
        <MetricCard label={t('analyzed')} value={analyzedCount} status="success" sublabel={t('volume_verified')} />
        <MetricCard label={t('in_progress')} value={processingCount} status="warning" sublabel={t('active_pipeline')} />
      </View>

      {/* Local Queue Health */}
      <Panel>
        <Text style={styles.label}>OFFLINE UPLOAD QUEUE HEALTH</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={[styles.title, { fontSize: 22, color: queueState === 'FAILED' ? colors.danger : colors.mint }]}>
            {queueState}
          </Text>
          <StatusBadge status={queueState} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
          {images.length} photograph{images.length === 1 ? '' : 's'} retained in device encrypted storage.
        </Text>
      </Panel>

      {/* AI Capabilities Registry */}
      <Panel>
        <Text style={styles.label}>{t('ai_capabilities_matrix')}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
          {t('ai_matrix_desc')}
        </Text>

        {capabilities.isLoading ? (
          <ActivityIndicator color={colors.amber} style={{ paddingVertical: 16 }} />
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            {Object.entries(caps).map(([key, item]) => {
              const cap = item as { status: string; provider: string; reason?: string | null };
              return (
                <View
                  key={key}
                  style={{
                    backgroundColor: colors.inkSecondary,
                    borderColor: colors.line,
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.stone, fontWeight: '800', fontSize: 13, textTransform: 'capitalize' }}>
                      {key.replaceAll('_', ' ')}
                    </Text>
                    <StatusBadge status={cap.status} />
                  </View>
                  <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '600' }}>
                    Provider: {cap.provider}
                  </Text>
                  {cap.reason ? (
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                      ℹ️ {cap.reason}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Panel>
    </ScrollView>
  );
}