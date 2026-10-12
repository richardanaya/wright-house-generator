/** Usonian planning module: the 4 ft side of the 2×4 ft grid. */
export const MODULE = 4;

/** Fine grid. Widths, lengths, and hearth edges land on this. */
export const HALF_MODULE = 2;

/** Ribbon and clerestory mullions are centered on this rhythm. */
export const MULLION_SPACING = 2;

/** Prairie hip rise over run. Low, but high enough that the ridge still reads. */
export const PRAIRIE_PITCH = 0.3;

export const MIN_OVERHANG = 2;
export const MAX_OVERHANG = 8;
export const MIN_SIZE = 0.75;
export const MAX_SIZE = 1.45;
export const MIN_WINGS = 2;
export const MAX_WINGS = 4;
export const MIN_SEED = 1;
export const MAX_SEED = 999_999_999;

export const DEFAULT_PARAMS = {
  seed: 12045,
  style: 'prairie' as const,
  size: 1,
  wings: 4,
  overhang: 5,
};
