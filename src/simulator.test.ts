import { describe, expect, it } from "vitest";
import { createReferenceDesign, LEVEL } from "./level";
import { addMember, createEmptyDesign } from "./model";
import {
  BridgeSimulation,
  PHYSICS_STEP,
  type RuntimeSegment,
  updateStressState,
} from "./simulator";
import type { BridgeDesign, MemberStress, Vec2Data } from "./types";

function runToResult(simulation: BridgeSimulation) {
  for (let index = 0; index < 31 / PHYSICS_STEP; index += 1) {
    const snapshot = simulation.step();
    if (snapshot.result) {
      return snapshot.result;
    }
  }
  return undefined;
}

function unsupportedRoad(): BridgeDesign {
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
    if (!result.ok) {
      throw new Error(result.reason);
    }
    design = result.design;
  }
  return design;
}

describe("deterministic bridge physics", () => {
  it("breaks a member after sustained overload or an extreme spike", () => {
    const initial: MemberStress = {
      memberId: "member-1",
      utilization: 0,
      smoothedUtilization: 0,
      mode: "tension",
      overloadTime: 0,
      broken: false,
    };
    let state = initial;
    for (let index = 0; index < 15; index += 1) {
      state = updateStressState(state, 1.1, "tension", 0.01);
    }
    expect(state.broken).toBe(true);
    expect(updateStressState(initial, 1.6, "compression", 0.01).broken).toBe(true);
  });

  it("carries the truck across the documented reference truss", () => {
    const result = runToResult(new BridgeSimulation(createReferenceDesign(), LEVEL));
    expect(result?.outcome).toBe("success");
  });

  it("fails an unsupported road and recreates an intact design on reset", () => {
    const design = unsupportedRoad();
    const first = new BridgeSimulation(design, LEVEL);
    const result = runToResult(first);
    expect(result?.outcome).toBe("failure");
    expect(result?.failureReason).toBe("fell");
    expect(result?.brokenMemberCount).toBeGreaterThan(0);

    const reset = new BridgeSimulation(design, LEVEL).snapshot();
    expect(reset.members.every((member) => !member.stress.broken)).toBe(true);
  });

  it("keeps a failed steel member at its physical endpoints after destroying its joint", () => {
    const weakLevel = {
      ...LEVEL,
      materials: {
        ...LEVEL.materials,
        steel: {
          ...LEVEL.materials.steel,
          tensileStrength: 0.001,
          compressiveStrength: 0.001,
        },
      },
    };
    const simulation = new BridgeSimulation(createReferenceDesign(), weakLevel);
    let brokenSteel: RuntimeSegment | undefined;
    for (let index = 0; index < 60; index += 1) {
      const snapshot = simulation.step();
      brokenSteel = snapshot.members.find(
        (member) => member.kind === "steel" && member.stress.broken,
      );
      if (brokenSteel) {
        break;
      }
    }
    expect(brokenSteel).toBeDefined();
    expect(brokenSteel?.start).not.toEqual({ x: 0, y: 0 });
    expect(brokenSteel?.end).not.toEqual({ x: 0, y: 0 });
  });
});
