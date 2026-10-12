export type LocalQualityResult = {
  score: number;
  warnings: string[];
  isAcceptable: boolean;
  statusText: string;
};

export function assessLocalImageQuality(
  image: {
    uri: string;
    width?: number;
    height?: number;
    fileSize?: number | null;
  },
  existingFingerprints: string[] = []
): LocalQualityResult {
  const warnings: string[] = [];
  let score = 1.0;

  const w = image.width ?? 0;
  const h = image.height ?? 0;
  const size = image.fileSize ?? 0;

  // 1. Resolution checks
  if (w > 0 && h > 0) {
    const minDim = Math.min(w, h);
    if (minDim < 320) {
      warnings.push('Resolution too low (<320px)');
      score -= 0.4;
    } else if (minDim < 640) {
      warnings.push('Low resolution warning (<640px)');
      score -= 0.15;
    }
  }

  // 2. File size sanity
  if (size > 0) {
    if (size < 30 * 1024) {
      warnings.push('File size very small (potential severe compression)');
      score -= 0.25;
    } else if (size > 25 * 1024 * 1024) {
      warnings.push('File exceeds recommended 25MB limit');
      score -= 0.1;
    }
  }

  // 3. Duplicate check
  const fingerprint = `${image.uri}|${size}|${w}x${h}`;
  if (existingFingerprints.includes(fingerprint)) {
    warnings.push('Duplicate photograph detected');
    score -= 0.5;
  }

  score = Math.max(0.1, Math.min(1.0, Math.round(score * 100) / 100));
  const isAcceptable = score >= 0.4 && !warnings.includes('Duplicate photograph detected');

  let statusText = 'Quality Good';
  if (score < 0.4) {
    statusText = 'Low Quality';
  } else if (score < 0.75) {
    statusText = 'Acceptable';
  }

  return {
    score,
    warnings,
    isAcceptable,
    statusText,
  };
}
