/**
 * Rule-based Influencer Tier Classification (per-platform).
 * Never treats missing follower counts as zero.
 */

export type InfluencerTier = "nano" | "micro" | "macro" | "mega" | "emerging" | "unknown";

export interface TierThresholdConfig {
  nanoMin: number;
  microMin: number;
  macroMin: number;
  megaMin: number;
}

export const DEFAULT_TIER_CONFIG: TierThresholdConfig = {
  nanoMin: 1_000,
  microMin: 10_000,
  macroMin: 100_000,
  megaMin: 1_000_000,
};

export function classifyFollowerTier(
  count: number | null | undefined,
  config: TierThresholdConfig = DEFAULT_TIER_CONFIG,
): InfluencerTier {
  if (count === null || count === undefined || !Number.isFinite(count) || count < 0) {
    return "unknown";
  }
  if (count >= config.megaMin) return "mega";
  if (count >= config.macroMin) return "macro";
  if (count >= config.microMin) return "micro";
  if (count >= config.nanoMin) return "nano";
  return "emerging";
}

export interface PlatformTiers {
  instagram?: InfluencerTier;
  youtube?: InfluencerTier;
  overall: InfluencerTier;
}

export function classifyPlatformTiers(
  metrics: { followers?: number | null; youtubeSubscribers?: number | null },
  config: TierThresholdConfig = DEFAULT_TIER_CONFIG,
): PlatformTiers {
  const igTier = metrics.followers !== null && metrics.followers !== undefined
    ? classifyFollowerTier(metrics.followers, config)
    : undefined;
  const ytTier = metrics.youtubeSubscribers !== null && metrics.youtubeSubscribers !== undefined
    ? classifyFollowerTier(metrics.youtubeSubscribers, config)
    : undefined;

  const maxCount =
    metrics.followers !== null && metrics.followers !== undefined &&
    metrics.youtubeSubscribers !== null && metrics.youtubeSubscribers !== undefined
      ? Math.max(metrics.followers, metrics.youtubeSubscribers)
      : metrics.followers ?? metrics.youtubeSubscribers ?? null;

  return {
    ...(igTier ? { instagram: igTier } : {}),
    ...(ytTier ? { youtube: ytTier } : {}),
    overall: classifyFollowerTier(maxCount, config),
  };
}
