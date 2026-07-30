/**
 * Level definitions for both campaigns
 * UPDATED FILE - replace existing src/level.ts
 */

import type { LevelDefinition } from '../types';
import { MATERIALS, LEVEL_1_MATERIALS, LEVEL_2_MATERIALS } from './materials';

/**
 * Level 1: 8-meter canyon, two anchors, original challenge
 */
export const LEVEL_1: LevelDefinition = {
  id: 'level-1',
  name: 'Canyon Crossing',
  description: 'Cross an 8-meter canyon with asphalt and steel.',

  // Canvas dimensions
  canvasWidth: 1024,
  canvasHeight: 650,
  canvasWidthMeters: 8,
  gridSpacing: 128, // pixels per meter

  // Canyon geometry
  anchors: [
    { x: 1, y: 2, id: 'left', isSupport: false },
    { x: 7, y: 2, id: 'right', isSupport: false },
  ],

  topY: 2, // roadway
  bottomY: 5, // cliff base

  // Budget and construction limits
  budget: 10000,
  maxMemberLength: {
    asphalt: 2.0,
    steel: 2.5,
    concrete: 1.8,
    wood: 1.5,
    aluminum: 2.8,
    cable: 4.0,
  },

  // Available materials (only asphalt and steel)
  materials: {
    asphalt: MATERIALS.asphalt,
    steel: MATERIALS.steel,
  },

  // Truck configuration
  truck: {
    wheelRadius: 0.3,
    chassisWidth: 1.5,
    chassisHeight: 0.8,
    mass: 5000,
    motorPower: 50000,
    maxVelocity: 8,
  },

  // Test parameters
  successTriggerX: 7.5,
  testTimeLimit: 30,
  stallTimeLimit: 3,
};

/**
 * Level 2: 14-meter canyon with middle support pillar
 * Strategy: two separate 6.5m gaps with a middle anchor
 */
export const LEVEL_2: LevelDefinition = {
  id: 'level-2',
  name: 'Double Span',
  description: 'Bridge a 14-meter canyon with a middle support pillar. Use multiple materials wisely.',

  // Canvas dimensions (wider)
  canvasWidth: 1400,
  canvasHeight: 650,
  canvasWidthMeters: 14,
  gridSpacing: 100, // pixels per meter (1400 / 14)

  // Canyon geometry with three anchor points
  anchors: [
    { x: 0.5, y: 2, id: 'left', isSupport: false },
    { x: 7, y: 2, id: 'middle', isSupport: true }, // MIDDLE PILLAR
    { x: 13.5, y: 2, id: 'right', isSupport: false },
  ],

  topY: 2, // roadway
  bottomY: 6, // deeper canyon (more dramatic)

  // Budget and construction limits
  budget: 15000,
  maxMemberLength: {
    asphalt: 2.0,
    steel: 2.5,
    concrete: 1.8,
    wood: 1.5,
    aluminum: 2.8,
    cable: 4.0,
  },

  // Available materials (all 6)
  materials: {
    asphalt: MATERIALS.asphalt,
    concrete: MATERIALS.concrete,
    wood: MATERIALS.wood,
    steel: MATERIALS.steel,
    aluminum: MATERIALS.aluminum,
    cable: MATERIALS.cable,
  },

  // Truck configuration (same as L1)
  truck: {
    wheelRadius: 0.3,
    chassisWidth: 1.5,
    chassisHeight: 0.8,
    mass: 5000,
    motorPower: 50000,
    maxVelocity: 8,
  },

  // Test parameters
  successTriggerX: 13.2,
  testTimeLimit: 35, // slightly longer for longer distance
  stallTimeLimit: 3,
};

/**
 * Middle support pillar rendering (visual structure, not physics body)
 * Drawn from topY to partway down canyon to create visual reference
 */
export const MIDDLE_PILLAR_RENDER = {
  x: 7, // center at middle anchor
  topY: 2,
  bottomY: 4.5, // goes 2.5 meters down (not all the way) - creates visual challenge
  width: 0.3, // 30cm wide
  color: 0x2c3e50, // dark gray (part of canyon)
};
