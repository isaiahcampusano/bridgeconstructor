import { describe, expect, it } from "vitest";
import { createReferenceDesign, LEVEL } from "./level";
import {
  addMember,
  createEmptyDesign,
  designCost,
  hasContinuousRoad,
  previewMember,
  segmentsCrossWithoutNode,
  snapPoint,
  validateDesign,
} from "./model";
import type { Vec2Data } from "./types";

describe("bridge design model", () => {
  it("snaps coordinates to the level grid", () => {
    expect(snapPoint({ x: 1.49, y: -1.51 }, 1)).toEqual({ x: 1, y: -2 });
    expect(snapPoint({ x: 1.51, y: -1.49 }, 1)).toEqual({ x: 2, y: -1 });
  });

  it("calculates the reference design inside the intended budget window", () => {
    const design = createReferenceDesign();
    const cost = designCost(design);
    expect(cost).toBe(8_784);
    expect(cost / LEVEL.budget).toBeGreaterThanOrEqual(0.75);
    expect(cost / LEVEL.budget).toBeLessThanOrEqual(0.9);
    expect(validateDesign(design, LEVEL).valid).toBe(true);
  });

  it("enforces span limits and budget before adding a member", () => {
    const design = createEmptyDesign(LEVEL);
    const tooLong = previewMember(design, LEVEL, "deck", { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(tooLong.valid).toBe(false);
    expect(tooLong.reason).toContain("limited to 2 m");

    let expensive = design;
    for (const y of [2, 1, 0, -1, -2]) {
      for (const x of [0, 4]) {
        const result = addMember(expensive, LEVEL, "deck", { x, y }, { x: x + 2, y });
        expect(result.ok).toBe(true);
        expensive = result.design;
      }
    }
    expect(designCost(expensive)).toBe(LEVEL.budget);

    const overBudget = addMember(expensive, LEVEL, "deck", { x: 0, y: -3 }, { x: 2, y: -3 });
    expect(overBudget.ok).toBe(false);
    expect(overBudget.reason).toContain("exceed the budget");
    expect(designCost(overBudget.design)).toBe(LEVEL.budget);
  });

  it("requires a connected deck path between road anchors", () => {
    let design = createEmptyDesign(LEVEL);
    const roadSegments: Array<[Vec2Data, Vec2Data]> = [
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { x: 2, y: 0 },
        { x: 4, y: 0 },
      ],
      [
        { x: 4, y: 0 },
        { x: 6, y: 0 },
      ],
      [
        { x: 6, y: 0 },
        { x: 8, y: 0 },
      ],
    ];
    for (const [start, end] of roadSegments) {
      const result = addMember(design, LEVEL, "deck", start, end);
      expect(result.ok).toBe(true);
      design = result.design;
    }
    expect(hasContinuousRoad(design)).toBe(true);
  });

  it("does not treat a geometric crossing as a structural connection", () => {
    expect(
      segmentsCrossWithoutNode({ x: 0, y: 0 }, { x: 2, y: -2 }, { x: 0, y: -2 }, { x: 2, y: 0 }),
    ).toBe(true);
    expect(
      segmentsCrossWithoutNode({ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 1, y: -1 }, { x: 2, y: 0 }),
    ).toBe(false);
  });
});
