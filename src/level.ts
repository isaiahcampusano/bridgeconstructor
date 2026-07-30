import { addMember, createEmptyDesign } from "./model";
import type { BridgeDesign, LevelDefinition } from "./types";

export const LEVEL: LevelDefinition = {
  id: "blueprint-span-01",
  title: "The Eight-Meter Test",
  canyonWidth: 8,
  gridSpacing: 1,
  budget: 10_000,
  buildBounds: {
    minX: 0,
    maxX: 8,
    minY: -4,
    maxY: 2,
  },
  viewBounds: {
    minX: -3.7,
    maxX: 11.7,
    minY: -5.2,
    maxY: 4.1,
  },
  anchors: [
    { id: "road-left", x: 0, y: 0, kind: "road", label: "West road" },
    { id: "road-right", x: 8, y: 0, kind: "road", label: "East road" },
    { id: "lower-left", x: 0, y: -2, kind: "foundation", label: "West bedrock" },
    { id: "lower-right", x: 8, y: -2, kind: "foundation", label: "East bedrock" },
  ],
  materials: {
    deck: {
      kind: "deck",
      label: "Road deck",
      costPerMeter: 500,
      density: 2,
      maxLength: 2,
      tensileStrength: 920,
      compressiveStrength: 820,
      bendingStrength: 390,
      color: 0xf2b84b,
    },
    steel: {
      kind: "steel",
      label: "Steel truss",
      costPerMeter: 300,
      density: 0.25,
      maxLength: 2.5,
      tensileStrength: 165,
      compressiveStrength: 135,
      bendingStrength: 0,
      color: 0x69c6d9,
    },
  },
  physics: {
    gravity: -9.81,
    nodeMass: 0.35,
    steelFrequencyHz: 15,
    steelDampingRatio: 0.7,
  },
  truck: {
    start: { x: -2.3, y: 0.65 },
    chassisHalfWidth: 0.67,
    chassisHalfHeight: 0.19,
    chassisDensity: 2.6,
    wheelRadius: 0.235,
    wheelOffsetX: 0.43,
    wheelOffsetY: -0.28,
    wheelDensity: 1.1,
    suspensionFrequencyHz: 5,
    suspensionDampingRatio: 0.72,
    targetSpeed: 1.65,
    maxMotorTorque: 34,
    startDelay: 1,
    finishX: 9.25,
    fallY: -4.65,
    timeout: 30,
    stallWindow: 3,
    minimumProgress: 0.15,
  },
};

/**
 * A compact truss used by deterministic tests and documented in the README.
 * It costs $8,784 (87.8% of the level budget).
 */
export function createReferenceDesign(): BridgeDesign {
  let design = createEmptyDesign(LEVEL);

  const segments: Array<["deck" | "steel", number, number, number, number]> = [
    ["deck", 0, 0, 2, 0],
    ["deck", 2, 0, 4, 0],
    ["deck", 4, 0, 6, 0],
    ["deck", 6, 0, 8, 0],
    ["steel", 2, -1, 4, -1],
    ["steel", 4, -1, 6, -1],
    ["steel", 0, 0, 2, -1],
    ["steel", 2, -1, 4, 0],
    ["steel", 4, 0, 6, -1],
    ["steel", 6, -1, 8, 0],
    ["steel", 2, 0, 2, -1],
    ["steel", 4, 0, 4, -1],
    ["steel", 6, 0, 6, -1],
  ];

  for (const [kind, x1, y1, x2, y2] of segments) {
    const result = addMember(design, LEVEL, kind, { x: x1, y: y1 }, { x: x2, y: y2 });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    design = result.design;
  }
  return design;
}
