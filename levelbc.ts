import type { LevelDefinition } from '../types';

/**
 * Default single-level canyon definition
 * 8-meter canyon on 1-meter blueprint grid
 */
export const DEFAULT_LEVEL: LevelDefinition = {
  // Canvas dimensions
  canvasWidth: 1024,
  canvasHeight: 650,
  canvasWidthMeters: 8,
  gridSpacing: 128, // pixels per meter (1024 / 8)

  // Canyon geometry
  leftAnchorX: 1, // meters
  rightAnchorX: 7, // meters
  topY: 2, // meters (roadway)
  bottomY: 5, // meters (cliff base)

  // Budget and construction limits
  budget: 10000, // dollars
  maxMemberLength: {
    deck: 2.0, // meters
    steel: 2.5, // meters
  },

  // Material definitions
  materials: {
    deck: {
      kind: 'deck',
      density: 500, // kg/m
      costPerMeter: 500, // dollars/meter
      maxTensile: 150000, // N
      maxCompressive: 150000, // N
      maxBendingMoment: 50000, // N⋅m
      color: 0xf39c12, // amber
      stressColor: { amber: 0xffb347, red: 0xff4444 },
    },
    steel: {
      kind: 'steel',
      density: 300, // kg/m
      costPerMeter: 300, // dollars/meter
      maxTensile: 300000, // N
      maxCompressive: 300000, // N
      color: 0x34495e, // steel gray
      stressColor: { amber: 0xf39c12, red: 0xff4444 },
    },
  },

  // Truck configuration
  truck: {
    wheelRadius: 0.3, // meters
    chassisWidth: 1.5, // meters
    chassisHeight: 0.8, // meters
    mass: 5000, // kg
    motorPower: 50000, // watts
    maxVelocity: 8, // m/s
  },

  // Test parameters
  successTriggerX: 7.5, // meters (near right edge)
  testTimeLimit: 30, // seconds
  stallTimeLimit: 3, // seconds of no forward progress
};
