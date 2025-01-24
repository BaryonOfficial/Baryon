export interface BloomSettings {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export const defaultBloomSettings: BloomSettings = {
  bloomStrength: 0.16,
  bloomRadius: 0.4,
  bloomThreshold: 0.48,
};
