export type Style = 'prairie' | 'usonian' | 'mixed';
export type ResolvedStyle = 'prairie' | 'usonian';
export type PlanType = 'l' | 't' | 'cruciform' | 'pinwheel';
export type Side = 'n' | 'e' | 's' | 'w';
export type VolumeKind = 'hearth' | 'wing' | 'upper' | 'carport';
export type WingRole = 'living' | 'chamber';

/** Axis-aligned footprint in feet. x/z is the minimum corner. */
export interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Volume extends Footprint {
  id: string;
  kind: VolumeKind;
  /** Floor elevation in feet. */
  y: number;
  /** Wall height above y. The roof soffit sits on this top. */
  h: number;
  /**
   * Side of this volume that meets its parent.
   * Roof overhang is suppressed on that side.
   */
  attach?: Side;
  parentId?: string;
  role?: WingRole;
}

export interface Overhang {
  n: number;
  e: number;
  s: number;
  w: number;
}

/** A roof that covers one volume. The mesh may union several of these. */
export interface Roof extends Footprint {
  id: string;
  volumeId: string;
  type: 'hip' | 'flat';
  /** Soffit / wall-top elevation. The surface rises above this on hips. */
  eaveY: number;
  pitch: number;
  overhang: Overhang;
  /** Volume footprint this roof is required to cover. */
  covers: Footprint;
}

export interface WindowBand {
  id: string;
  volumeId: string;
  kind: 'ribbon' | 'clerestory';
  face: Side;
  /** Tangent-axis interval in world feet. */
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  /** Constant coordinate of the facade plane. */
  plane: number;
  mullionSpacing: number;
}

export interface Terrace extends Footprint {
  id: string;
  y: number;
  h: number;
  hostId: string;
  /** Outer edge, where the planter sits. */
  outer: Side;
}

export interface Planter extends Footprint {
  id: string;
  y: number;
  h: number;
}

export interface Chimney extends Footprint {
  y: number;
  h: number;
}

export interface Entry {
  volumeId: string;
  face: Side;
  /** Center of the door along the facade tangent. */
  u: number;
  plane: number;
}

export interface HousePlan {
  seed: number;
  style: ResolvedStyle;
  requestedStyle: Style;
  planType: PlanType;
  module: number;
  volumes: Volume[];
  roofs: Roof[];
  windows: WindowBand[];
  terraces: Terrace[];
  planters: Planter[];
  chimney: Chimney;
  /** Raised base under the floor plates. Top is y=0. */
  plinth: Footprint & { h: number };
  entry: Entry;
}

export interface Params {
  /** Integer seed. The same seed and params always rebuild the same plan. */
  seed: number;
  style: Style;
  /** Scales wing length. Typical range 0.75–1.45. */
  size: number;
  /** Number of wings grown from the hearth. 2, 3, or 4. */
  wings: number;
  /** Eave overhang in feet on free sides. Typical range 2–8. */
  overhang: number;
}
