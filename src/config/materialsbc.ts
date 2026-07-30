/**
 * Material definitions for both levels
 * NEW FILE - add to src/materials.ts
 */

export interface MaterialProperties {
  name: string;
  kind: 'deck' | 'steel' | 'concrete' | 'wood' | 'aluminum' | 'cable';
  density: number; // kg/m
  costPerMeter: number; // dollars
  maxTensile: number; // Newtons (or null for tension-only like cable)
  maxCompressive: number; // Newtons (or 0 for cable = compression not allowed)
  maxBendingMoment?: number; // N⋅m for deck-like materials
  maxShear?: number; // N for shear failure
  color: number; // PIXI color int
  lineStyle: 'solid' | 'dashed' | 'dotted';
  lineWidth: number;
  stressColor: { amber: number; red: number };
  failureWarning?: string; // e.g., "Cable cannot be compressed"
}

export const MATERIALS: Record<string, MaterialProperties> = {
  // LEVEL 1 ONLY
  asphalt: {
    name: 'Asphalt',
    kind: 'deck',
    density: 500,
    costPerMeter: 500,
    maxTensile: 920000,
    maxCompressive: 820000,
    maxBendingMoment: 390000,
    maxShear: 250000,
    color: 0xf39c12, // amber
    lineStyle: 'solid',
    lineWidth: 4,
    stressColor: { amber: 0xffb347, red: 0xff4444 },
  },

  steel: {
    name: 'Steel',
    kind: 'steel',
    density: 300,
    costPerMeter: 300,
    maxTensile: 300000,
    maxCompressive: 300000,
    color: 0x34495e, // dark gray
    lineStyle: 'solid',
    lineWidth: 3,
    stressColor: { amber: 0xf39c12, red: 0xff4444 },
  },

  // LEVEL 2 ADDITIONS
  concrete: {
    name: 'Concrete',
    kind: 'steel',
    density: 800, // heavy
    costPerMeter: 250, // cheap
    maxTensile: 60000, // weak in tension
    maxCompressive: 1200000, // strong in compression
    color: 0x95a5a6, // light gray
    lineStyle: 'dotted',
    lineWidth: 5, // thick appearance
    stressColor: { amber: 0xffe680, red: 0xff6b6b },
    failureWarning: 'Concrete is weak in tension, strong in compression',
  },

  wood: {
    name: 'Wood',
    kind: 'steel',
    density: 400,
    costPerMeter: 200, // cheapest
    maxTensile: 400000,
    maxCompressive: 500000,
    color: 0x8b4513, // saddle brown
    lineStyle: 'dashed',
    lineWidth: 3,
    stressColor: { amber: 0xf4a460, red: 0xcd5c5c },
    failureWarning: 'Wood is light but weaker than steel',
  },

  aluminum: {
    name: 'Aluminum',
    kind: 'steel',
    density: 150, // lightest
    costPerMeter: 400,
    maxTensile: 280000,
    maxCompressive: 280000,
    color: 0xc0c0c0, // silver
    lineStyle: 'solid',
    lineWidth: 2.5, // thin appearance
    stressColor: { amber: 0xffd700, red: 0xff4444 },
    failureWarning: 'Aluminum is light but equal in tension/compression',
  },

  cable: {
    name: 'Cable',
    kind: 'steel',
    density: 50, // ultra-light
    costPerMeter: 600, // expensive
    maxTensile: 500000,
    maxCompressive: 0, // CANNOT BE COMPRESSED - will snap immediately
    color: 0xe74c3c, // red
    lineStyle: 'solid',
    lineWidth: 1,
    stressColor: { amber: 0xff6b6b, red: 0xff0000 },
    failureWarning: 'Cable can only pull, not push. Will snap if compressed!',
  },
};

/**
 * Level 1 materials (subset)
 */
export const LEVEL_1_MATERIALS = ['asphalt', 'steel'];

/**
 * Level 2 materials (all available)
 */
export const LEVEL_2_MATERIALS = ['asphalt', 'concrete', 'wood', 'steel', 'aluminum', 'cable'];
