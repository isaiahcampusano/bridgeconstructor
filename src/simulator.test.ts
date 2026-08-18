import { describe, expect, it } from "vitest";
import { createReferenceDesign, LEVEL } from "./level";
import { addMember, createEmptyDesign } from "./model";
import {
  BridgeSimulation,
  evaluateDeckStress,
  PHYSICS_STEP,
  type RuntimeSegment,
  updateAxialStressState,
  updateStressState,
} from "./simulator";
import type { BridgeDesign, MemberStress, TestResult, Vec2Data } from "./types";

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

describe("deck stress decomposition", () => {
  const material = {
    ...LEVEL.materials.deck,
    tensileStrength: 100,
    compressiveStrength: 50,
    shearStrength: 40,
    bendingStrength: 200,
  };

  it("distinguishes axial tension from compression", () => {
    const tension = evaluateDeckStress(
      { x: -60, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      material,
    );
    expect(tension.loads.axialForce).toBeCloseTo(60);
    expect(tension.componentUtilization).toEqual({ axial: 0.6, shear: 0, bending: 0 });
    expect(tension.mode).toBe("tension");
    expect(tension.utilization).toBeCloseTo(0.6);

    const compression = evaluateDeckStress(
      { x: 30, y: 0 },
      { x: -30, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      material,
    );
    expect(compression.loads.axialForce).toBeCloseTo(-30);
    expect(compression.componentUtilization.axial).toBeCloseTo(0.6);
    expect(compression.mode).toBe("compression");
  });

  it("measures transverse shear separately from the bending proxy", () => {
    const evaluation = evaluateDeckStress(
      { x: 0, y: 32 },
      { x: 0, y: 32 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      material,
    );
    expect(evaluation.loads).toEqual({
      axialForce: 0,
      shearForce: 32,
      bendingMoment: 16,
    });
    expect(evaluation.componentUtilization).toEqual({
      axial: 0,
      shear: 0.8,
      bending: 0.08,
    });
    expect(evaluation.mode).toBe("shear");
    expect(evaluation.utilization).toBeCloseTo(0.8);

    const bendingDominant = evaluateDeckStress(
      { x: 0, y: 32 },
      { x: 0, y: 32 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { ...material, bendingStrength: 10 },
    );
    expect(bendingDominant.componentUtilization.bending).toBeCloseTo(1.6);
    expect(bendingDominant.mode).toBe("bending");
  });

  it("is invariant when the deck and reactions rotate together", () => {
    const horizontal = evaluateDeckStress(
      { x: -60, y: 32 },
      { x: 60, y: 32 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      material,
    );
    const rootHalf = Math.SQRT1_2;
    const rotate = ({ x, y }: Vec2Data): Vec2Data => ({
      x: (x - y) * rootHalf,
      y: (x + y) * rootHalf,
    });
    const rotated = evaluateDeckStress(
      rotate({ x: -60, y: 32 }),
      rotate({ x: 60, y: 32 }),
      rotate({ x: 0, y: 0 }),
      rotate({ x: 2, y: 0 }),
      material,
    );
    expect(rotated.loads.axialForce).toBeCloseTo(horizontal.loads.axialForce);
    expect(rotated.loads.shearForce).toBeCloseTo(horizontal.loads.shearForce);
    expect(rotated.loads.bendingMoment).toBeCloseTo(horizontal.loads.bendingMoment);
    expect(rotated.componentUtilization.axial).toBeCloseTo(horizontal.componentUtilization.axial);
    expect(rotated.componentUtilization.shear).toBeCloseTo(horizontal.componentUtilization.shear);
    expect(rotated.componentUtilization.bending).toBeCloseTo(
      horizontal.componentUtilization.bending,
    );
    expect(rotated.mode).toBe(horizontal.mode);
  });
});

describe("deterministic bridge physics", () => {
  it("breaks a member after sustained overload or an extreme spike", () => {
    const initial: MemberStress = {
      memberId: "member-1",
      utilization: 0,
      smoothedUtilization: 0,
      mode: "tension",
      componentUtilization: { axial: 0, shear: 0, bending: 0 },
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

  it("snaps a cable on its first compressed physics step", () => {
    const initial: MemberStress = {
      memberId: "cable-1",
      utilization: 0,
      smoothedUtilization: 0,
      mode: "tension",
      componentUtilization: { axial: 0, shear: 0, bending: 0 },
      overloadTime: 0,
      broken: false,
    };
    const compressed = updateAxialStressState(
      initial,
      0.001,
      LEVEL.materials.cable,
      "cable",
      PHYSICS_STEP,
    );
    expect(compressed.mode).toBe("compression");
    expect(compressed.broken).toBe(true);
    expect(compressed.overloadTime).toBe(PHYSICS_STEP);
  });

  it("keeps non-cable axial materials intact under a tiny compressive load", () => {
    const initial: MemberStress = {
      memberId: "axial-1",
      utilization: 0,
      smoothedUtilization: 0,
      mode: "tension",
      componentUtilization: { axial: 0, shear: 0, bending: 0 },
      overloadTime: 0,
      broken: false,
    };
    for (const kind of ["steel", "aluminum"] as const) {
      expect(
        updateAxialStressState(initial, 0.001, LEVEL.materials[kind], kind, PHYSICS_STEP).broken,
      ).toBe(false);
    }
  });

  it("carries the truck across the documented reference truss", () => {
    const simulation = new BridgeSimulation(createReferenceDesign(), LEVEL);
    let peakDeckShear = 0;
    let result: TestResult | undefined;
    for (let index = 0; index < 31 / PHYSICS_STEP; index += 1) {
      const snapshot = simulation.step();
      for (const member of snapshot.members) {
        if (member.kind === "deck") {
          peakDeckShear = Math.max(peakDeckShear, member.stress.componentUtilization.shear);
        } else {
          expect(member.stress.componentUtilization.shear).toBe(0);
          expect(member.stress.componentUtilization.bending).toBe(0);
        }
      }
      if (snapshot.result) {
        result = snapshot.result;
        break;
      }
    }
    expect(result?.outcome).toBe("success");
    expect(result?.brokenMemberCount).toBe(0);
    expect(peakDeckShear).toBeGreaterThanOrEqual(0.75);
    expect(peakDeckShear).toBeLessThanOrEqual(0.85);
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
    expect(
      reset.members.every(
        (member) =>
          member.stress.componentUtilization.axial === 0 &&
          member.stress.componentUtilization.shear === 0 &&
          member.stress.componentUtilization.bending === 0,
      ),
    ).toBe(true);
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

  it("breaks deck joints when transverse reactions exceed shear strength", () => {
    const weakShearLevel = {
      ...LEVEL,
      materials: {
        ...LEVEL.materials,
        deck: {
          ...LEVEL.materials.deck,
          tensileStrength: 1e12,
          compressiveStrength: 1e12,
          shearStrength: 0.001,
          bendingStrength: 1e12,
        },
        steel: {
          ...LEVEL.materials.steel,
          tensileStrength: 1e12,
          compressiveStrength: 1e12,
        },
      },
    };
    const simulation = new BridgeSimulation(createReferenceDesign(), weakShearLevel);
    const initialJointCount = simulation.world.getJointCount();
    let brokenDeck: RuntimeSegment | undefined;
    for (let index = 0; index < 60; index += 1) {
      const snapshot = simulation.step();
      brokenDeck = snapshot.members.find(
        (member) => member.kind === "deck" && member.stress.broken,
      );
      if (brokenDeck) {
        break;
      }
    }

    expect(brokenDeck).toBeDefined();
    expect(brokenDeck?.stress.mode).toBe("shear");
    expect(brokenDeck?.stress.componentUtilization.shear).toBeGreaterThan(
      brokenDeck?.stress.componentUtilization.axial ?? Number.POSITIVE_INFINITY,
    );
    expect(brokenDeck?.stress.componentUtilization.shear).toBeGreaterThan(
      brokenDeck?.stress.componentUtilization.bending ?? Number.POSITIVE_INFINITY,
    );
    expect(simulation.world.getJointCount()).toBeLessThanOrEqual(initialJointCount - 2);
  });
});
