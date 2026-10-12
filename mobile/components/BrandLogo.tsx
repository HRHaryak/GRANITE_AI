import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from './ui';

export function BrandLogo({
  size = 40,
  withText = false,
  subtitle = 'PRECISION INTELLIGENCE',
}: {
  size?: number;
  withText?: boolean;
  subtitle?: string;
}) {
  const radius = Math.round(size * 0.28);
  const innerSize = Math.round(size * 0.62);

  return (
    <View style={styles.container}>
      {/* Precision Geometric Mark */}
      <View
        style={[
          styles.markFrame,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}
      >
        {/* Isometric Faceted Granite Geometry */}
        <View
          style={[
            styles.crystalFacetTop,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: Math.round(innerSize * 0.22),
            },
          ]}
        >
          {/* Internal Crosshair Reticle & Precision Vertex */}
          <View style={styles.reticleHorizontal} />
          <View style={styles.reticleVertical} />
          <View style={styles.aiCoreNode} />
          {/* Coordinate Corner Accents */}
          <View style={[styles.cornerTick, { top: 2, left: 2 }]} />
          <View style={[styles.cornerTick, { bottom: 2, right: 2 }]} />
        </View>
      </View>

      {/* Typography Lockup */}
      {withText && (
        <View style={styles.textContainer}>
          <Text style={styles.brandTitle}>
            GRANITE<Text style={styles.brandAccent}>MEASURE</Text>
          </Text>
          <Text style={styles.brandSubtitle}>{subtitle}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markFrame: {
    backgroundColor: '#0c1017',
    borderColor: '#263142',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  crystalFacetTop: {
    backgroundColor: '#161e2c',
    borderColor: colors.amber,
    borderWidth: 1.4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    transform: [{ rotate: '45deg' }],
  },
  reticleHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(232, 180, 94, 0.35)',
  },
  reticleVertical: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(232, 180, 94, 0.35)',
  },
  aiCoreNode: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  cornerTick: {
    position: 'absolute',
    width: 3,
    height: 3,
    backgroundColor: colors.mint,
    borderRadius: 1,
  },
  textContainer: {
    justifyContent: 'center',
  },
  brandTitle: {
    color: colors.stone,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  brandAccent: {
    color: colors.amber,
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 1.5,
  },
});