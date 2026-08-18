import { LEVELS } from "./levels";
import { addMember, createEmptyDesign } from "./model";
import type { BridgeDesign, LevelDefinition, MemberKind } from "./types";

export const LEVEL: LevelDefinition = LEVELS[0] as LevelDefinition;

/**
 * A compact truss used by deterministic tests and documented in the README.
 * It costs $8,784 (87.8% of the level budget).
 */
export function createReferenceDesign(): BridgeDesign {
  let design = createEmptyDesign(LEVEL);

  const segments: Array<[MemberKind, number, number, number, number]> = [
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
