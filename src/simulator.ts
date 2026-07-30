import {
  type Body,
  Box,
  Circle,
  DistanceJoint,
  type Joint,
  RevoluteJoint,
  Vec2,
  WheelJoint,
  type WheelJoint as WheelJointType,
  World,
} from "planck";
import { cloneDesign, designCost } from "./model";
import type {
  BridgeDesign,
  BridgeMember,
  FailureReason,
  LevelDefinition,
  MaterialDefinition,
  MemberStress,
  StressMode,
  TestResult,
  Vec2Data,
} from "./types";

const FIXED_STEP = 1 / 120;
const BRIDGE_CATEGORY = 0x0002;
const TRUCK_CATEGORY = 0x0004;
const GROUND_CATEGORY = 0x0008;

interface RuntimeMember {
  definition: BridgeMember;
  startBody: Body;
  endBody: Body;
  body?: Body;
  deckJoints?: {
    start: Joint;
    end: Joint;
  };
  joints: Joint[];
  stress: MemberStress;
}

export interface RuntimeSegment {
  id: string;
  kind: "deck" | "steel";
  start: Vec2Data;
  end: Vec2Data;
  stress: MemberStress;
}

export interface TruckSnapshot {
  chassis: { x: number; y: number; angle: number };
  wheels: Array<{ x: number; y: number; angle: number; radius: number }>;
}

export interface SimulationSnapshot {
  elapsedTime: number;
  members: RuntimeSegment[];
  nodes: Array<Vec2Data & { id: string; anchored: boolean }>;
  truck: TruckSnapshot;
  brokenMemberIds: string[];
  result?: TestResult;
}

export interface DeckStressEvaluation {
  utilization: number;
  mode: StressMode;
  componentUtilization: MemberStress["componentUtilization"];
  loads: {
    axialForce: number;
    shearForce: number;
    bendingMoment: number;
  };
}

function dot(left: Vec2Data, right: Vec2Data): number {
  return left.x * right.x + left.y * right.y;
}

function normalizeLoad(load: number, strength: number): number {
  if (load === 0) {
    return 0;
  }
  return strength > 0 ? load / strength : Number.POSITIVE_INFINITY;
}

/**
 * Resolves the two endpoint reactions into the deck's current local axes.
 *
 * Planck reports the force on body B. Both revolute joints are created with
 * the deck as body B, so tension pulls the start end backward and the finish
 * end forward. The difference between those local axial reactions therefore
 * preserves the tension/compression sign.
 */
export function evaluateDeckStress(
  startReaction: Vec2Data,
  endReaction: Vec2Data,
  start: Vec2Data,
  end: Vec2Data,
  material: MaterialDefinition,
): DeckStressEvaluation {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) {
    return {
      utilization: 0,
      mode: "bending",
      componentUtilization: { axial: 0, shear: 0, bending: 0 },
      loads: { axialForce: 0, shearForce: 0, bendingMoment: 0 },
    };
  }

  const axis = { x: dx / length, y: dy / length };
  const normal = { x: -axis.y, y: axis.x };
  const axialForce = (dot(endReaction, axis) - dot(startReaction, axis)) / 2;
  const shearForce = Math.max(
    Math.abs(dot(startReaction, normal)),
    Math.abs(dot(endReaction, normal)),
  );
  const bendingMoment = (shearForce * length) / 4;
  const axialStrength = axialForce >= 0 ? material.tensileStrength : material.compressiveStrength;
  const componentUtilization = {
    axial: normalizeLoad(Math.abs(axialForce), axialStrength),
    shear: normalizeLoad(shearForce, material.shearStrength),
    bending: normalizeLoad(bendingMoment, material.bendingStrength),
  };

  let mode: StressMode = "bending";
  let utilization = componentUtilization.bending;
  if (componentUtilization.axial > utilization) {
    mode = axialForce >= 0 ? "tension" : "compression";
    utilization = componentUtilization.axial;
  }
  if (componentUtilization.shear > utilization) {
    mode = "shear";
    utilization = componentUtilization.shear;
  }

  return {
    utilization,
    mode,
    componentUtilization,
    loads: { axialForce, shearForce, bendingMoment },
  };
}

function memberEnds(runtime: RuntimeMember): [Vec2Data, Vec2Data] {
  if (runtime.definition.kind === "deck" && runtime.body) {
    const half = runtime.definition.length / 2;
    const start = runtime.body.getWorldPoint(Vec2(-half, 0));
    const end = runtime.body.getWorldPoint(Vec2(half, 0));
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];
  }
  const joint = runtime.joints[0];
  if (joint) {
    const start = joint.getAnchorA();
    const end = joint.getAnchorB();
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];
  }
  const start = runtime.startBody.getPosition();
  const end = runtime.endBody.getPosition();
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
  ];
}

export function updateStressState(
  state: MemberStress,
  utilization: number,
  mode: MemberStress["mode"],
  dt: number,
  componentUtilization: MemberStress["componentUtilization"] = state.componentUtilization,
): MemberStress {
  const alpha = 1 - Math.exp(-dt / 0.15);
  const smoothedUtilization =
    state.smoothedUtilization + (utilization - state.smoothedUtilization) * alpha;
  const overloadTime = utilization > 1 ? state.overloadTime + dt : 0;
  return {
    ...state,
    utilization,
    smoothedUtilization,
    overloadTime,
    mode,
    componentUtilization,
    broken: state.broken || utilization >= 1.5 || overloadTime >= 0.12,
  };
}

export class BridgeSimulation {
  readonly design: BridgeDesign;
  readonly world: World;
  private readonly level: LevelDefinition;
  private readonly nodeBodies = new Map<string, Body>();
  private readonly runtimeMembers = new Map<string, RuntimeMember>();
  private readonly chassis: Body;
  private readonly wheels: Body[] = [];
  private readonly wheelJoints: WheelJointType[] = [];
  private elapsedTime = 0;
  private result?: TestResult;
  private brokenCount = 0;
  private progressAnchor: number;
  private stallTime = 0;

  constructor(sourceDesign: BridgeDesign, level: LevelDefinition) {
    this.design = cloneDesign(sourceDesign);
    this.level = level;
    this.world = new World(Vec2(0, this.level.physics.gravity));
    this.createGround();
    this.createNodes();
    this.createMembers();
    const vehicle = this.createTruck();
    this.chassis = vehicle.chassis;
    this.wheels = vehicle.wheels;
    this.wheelJoints = vehicle.joints;
    this.progressAnchor = this.chassis.getPosition().x;
  }

  private createGround(): void {
    const left = this.world.createBody({ position: Vec2(-2.4, -0.45) });
    left.createFixture(Box(2.4, 0.45), {
      friction: 0.9,
      filterCategoryBits: GROUND_CATEGORY,
      filterMaskBits: TRUCK_CATEGORY | BRIDGE_CATEGORY,
    });
    const right = this.world.createBody({ position: Vec2(10.4, -0.45) });
    right.createFixture(Box(2.4, 0.45), {
      friction: 0.9,
      filterCategoryBits: GROUND_CATEGORY,
      filterMaskBits: TRUCK_CATEGORY | BRIDGE_CATEGORY,
    });
  }

  private createNodes(): void {
    for (const node of this.design.nodes) {
      const body = this.world.createBody({
        type: node.anchorId ? "static" : "dynamic",
        position: Vec2(node.x, node.y),
        linearDamping: 0.12,
        angularDamping: 0.12,
        allowSleep: false,
      });
      if (!node.anchorId) {
        body.createFixture(Circle(0.08), {
          density: 1,
          isSensor: true,
          filterCategoryBits: BRIDGE_CATEGORY,
          filterMaskBits: 0,
        });
        // Connection nodes need meaningful inertia. Leaving their mass derived
        // from a tiny marker fixture makes deck bodies overwhelm the solver.
        body.setMassData({
          mass: this.level.physics.nodeMass,
          center: Vec2(0, 0),
          I: 0.001,
        });
      }
      this.nodeBodies.set(node.id, body);
    }
  }

  private createMembers(): void {
    const nodeById = new Map(this.design.nodes.map((node) => [node.id, node]));
    for (const member of this.design.members) {
      const startNode = nodeById.get(member.startNodeId);
      const endNode = nodeById.get(member.endNodeId);
      const startBody = this.nodeBodies.get(member.startNodeId);
      const endBody = this.nodeBodies.get(member.endNodeId);
      if (!startNode || !endNode || !startBody || !endBody) {
        continue;
      }

      const joints: Joint[] = [];
      let body: Body | undefined;
      let deckJoints: RuntimeMember["deckJoints"];
      if (member.kind === "steel") {
        const joint = this.world.createJoint(
          new DistanceJoint(
            {
              collideConnected: false,
              dampingRatio: this.level.physics.steelDampingRatio,
              frequencyHz: this.level.physics.steelFrequencyHz,
              length: member.length,
            },
            startBody,
            endBody,
            Vec2(startNode.x, startNode.y),
            Vec2(endNode.x, endNode.y),
          ),
        );
        if (joint) {
          joints.push(joint);
        }
      } else {
        const center = Vec2((startNode.x + endNode.x) / 2, (startNode.y + endNode.y) / 2);
        const angle = Math.atan2(endNode.y - startNode.y, endNode.x - startNode.x);
        body = this.world.createBody({
          type: "dynamic",
          position: center,
          angle,
          linearDamping: 0.08,
          angularDamping: 0.1,
          allowSleep: false,
        });
        body.createFixture(Box(member.length / 2, 0.095), {
          density: this.level.materials.deck.density,
          friction: 0.95,
          filterCategoryBits: BRIDGE_CATEGORY,
          filterMaskBits: TRUCK_CATEGORY | GROUND_CATEGORY,
        });
        const jointA = this.world.createJoint(
          new RevoluteJoint(
            { collideConnected: false },
            startBody,
            body,
            Vec2(startNode.x, startNode.y),
          ),
        );
        const jointB = this.world.createJoint(
          new RevoluteJoint({ collideConnected: false }, endBody, body, Vec2(endNode.x, endNode.y)),
        );
        if (jointA) {
          joints.push(jointA);
        }
        if (jointB) {
          joints.push(jointB);
        }
        if (jointA && jointB) {
          deckJoints = { start: jointA, end: jointB };
        }
      }

      this.runtimeMembers.set(member.id, {
        definition: member,
        startBody,
        endBody,
        body,
        deckJoints,
        joints,
        stress: {
          memberId: member.id,
          utilization: 0,
          smoothedUtilization: 0,
          mode: member.kind === "steel" ? "tension" : "bending",
          componentUtilization: { axial: 0, shear: 0, bending: 0 },
          overloadTime: 0,
          broken: false,
        },
      });
    }
  }

  private createTruck(): { chassis: Body; wheels: Body[]; joints: WheelJointType[] } {
    const truck = this.level.truck;
    const { start } = truck;
    const chassis = this.world.createBody({
      type: "dynamic",
      position: Vec2(start.x, start.y),
      linearDamping: 0.02,
      angularDamping: 0.08,
      allowSleep: false,
    });
    chassis.createFixture(Box(truck.chassisHalfWidth, truck.chassisHalfHeight), {
      density: truck.chassisDensity,
      friction: 0.55,
      filterCategoryBits: TRUCK_CATEGORY,
      filterMaskBits: GROUND_CATEGORY | BRIDGE_CATEGORY,
    });

    const wheels: Body[] = [];
    const joints: WheelJointType[] = [];
    for (const offset of [-truck.wheelOffsetX, truck.wheelOffsetX]) {
      const anchor = Vec2(start.x + offset, start.y + truck.wheelOffsetY);
      const wheel = this.world.createBody({
        type: "dynamic",
        position: anchor,
        allowSleep: false,
      });
      wheel.createFixture(Circle(truck.wheelRadius), {
        density: truck.wheelDensity,
        friction: 1.35,
        restitution: 0.02,
        filterCategoryBits: TRUCK_CATEGORY,
        filterMaskBits: GROUND_CATEGORY | BRIDGE_CATEGORY,
      });
      const joint = this.world.createJoint(
        new WheelJoint(
          {
            enableMotor: true,
            maxMotorTorque: 0,
            motorSpeed: 0,
            frequencyHz: truck.suspensionFrequencyHz,
            dampingRatio: truck.suspensionDampingRatio,
            collideConnected: false,
          },
          chassis,
          wheel,
          anchor,
          Vec2(0, 1),
        ),
      );
      wheels.push(wheel);
      if (joint) {
        joints.push(joint);
      }
    }
    return { chassis, wheels, joints };
  }

  private calculateStress(runtime: RuntimeMember, dt: number): void {
    if (runtime.stress.broken || runtime.joints.length === 0) {
      return;
    }
    const material = this.level.materials[runtime.definition.kind];
    let utilization = 0;
    let mode: MemberStress["mode"] = "bending";
    let componentUtilization: MemberStress["componentUtilization"] = {
      axial: 0,
      shear: 0,
      bending: 0,
    };

    if (runtime.definition.kind === "steel") {
      const joint = runtime.joints[0];
      if (!joint) {
        return;
      }
      const force = joint.getReactionForce(1 / dt);
      const [start, end] = memberEnds(runtime);
      const direction = Vec2(end.x - start.x, end.y - start.y);
      direction.normalize();
      const signedForce = force.x * direction.x + force.y * direction.y;
      mode = signedForce < 0 ? "tension" : "compression";
      const strength = mode === "tension" ? material.tensileStrength : material.compressiveStrength;
      utilization = normalizeLoad(Math.abs(signedForce), strength);
      componentUtilization = { axial: utilization, shear: 0, bending: 0 };
    } else {
      if (!runtime.deckJoints) {
        return;
      }
      const [start, end] = memberEnds(runtime);
      const startReaction = runtime.deckJoints.start.getReactionForce(1 / dt);
      const endReaction = runtime.deckJoints.end.getReactionForce(1 / dt);
      const evaluation = evaluateDeckStress(startReaction, endReaction, start, end, material);
      utilization = evaluation.utilization;
      mode = evaluation.mode;
      componentUtilization = evaluation.componentUtilization;
    }

    runtime.stress = updateStressState(runtime.stress, utilization, mode, dt, componentUtilization);
    if (runtime.stress.broken) {
      for (const joint of runtime.joints) {
        this.world.destroyJoint(joint);
      }
      runtime.joints = [];
      this.brokenCount += 1;
    }
  }

  private finish(outcome: "success" | "failure", failureReason?: FailureReason): void {
    if (this.result) {
      return;
    }
    for (const joint of this.wheelJoints) {
      joint.setMaxMotorTorque(0);
      joint.setMotorSpeed(0);
    }
    this.result = {
      outcome,
      elapsedTime: this.elapsedTime,
      cost: designCost(this.design),
      brokenMemberCount: this.brokenCount,
      failureReason,
    };
  }

  step(): SimulationSnapshot {
    if (this.result) {
      return this.snapshot([]);
    }

    const dt = FIXED_STEP;
    const brokenBefore = new Set(
      [...this.runtimeMembers.values()]
        .filter((runtime) => runtime.stress.broken)
        .map((runtime) => runtime.definition.id),
    );
    this.elapsedTime += dt;
    if (this.elapsedTime >= this.level.truck.startDelay) {
      for (const joint of this.wheelJoints) {
        joint.setMaxMotorTorque(this.level.truck.maxMotorTorque);
        joint.setMotorSpeed(-this.level.truck.targetSpeed / this.level.truck.wheelRadius);
      }
    }

    this.world.step(dt, 8, 3);
    for (const runtime of this.runtimeMembers.values()) {
      this.calculateStress(runtime, dt);
    }

    const truckPosition = this.chassis.getPosition();
    if (truckPosition.x >= this.level.truck.finishX) {
      this.finish("success");
    } else if (truckPosition.y <= this.level.truck.fallY) {
      this.finish("failure", "fell");
    } else if (this.elapsedTime >= this.level.truck.timeout) {
      this.finish("failure", "timeout");
    } else if (this.elapsedTime > this.level.truck.startDelay) {
      if (truckPosition.x >= this.progressAnchor + this.level.truck.minimumProgress) {
        this.progressAnchor = truckPosition.x;
        this.stallTime = 0;
      } else {
        this.stallTime += dt;
        if (this.stallTime >= this.level.truck.stallWindow) {
          this.finish("failure", "stalled");
        }
      }
    }

    const newlyBroken = [...this.runtimeMembers.values()]
      .filter((runtime) => runtime.stress.broken && !brokenBefore.has(runtime.definition.id))
      .map((runtime) => runtime.definition.id);
    return this.snapshot(newlyBroken);
  }

  stop(): TestResult {
    this.finish("failure", "stopped");
    return this.result as TestResult;
  }

  snapshot(brokenMemberIds: string[] = []): SimulationSnapshot {
    const chassisPosition = this.chassis.getPosition();
    return {
      elapsedTime: this.elapsedTime,
      members: [...this.runtimeMembers.values()].map((runtime) => {
        const [start, end] = memberEnds(runtime);
        return {
          id: runtime.definition.id,
          kind: runtime.definition.kind,
          start,
          end,
          stress: {
            ...runtime.stress,
            componentUtilization: { ...runtime.stress.componentUtilization },
          },
        };
      }),
      nodes: this.design.nodes.map((node) => {
        const position = this.nodeBodies.get(node.id)?.getPosition() ?? node;
        return {
          id: node.id,
          x: position.x,
          y: position.y,
          anchored: Boolean(node.anchorId),
        };
      }),
      truck: {
        chassis: {
          x: chassisPosition.x,
          y: chassisPosition.y,
          angle: this.chassis.getAngle(),
        },
        wheels: this.wheels.map((wheel) => ({
          x: wheel.getPosition().x,
          y: wheel.getPosition().y,
          angle: wheel.getAngle(),
          radius: this.level.truck.wheelRadius,
        })),
      },
      brokenMemberIds,
      result: this.result ? { ...this.result } : undefined,
    };
  }
}

export const PHYSICS_STEP = FIXED_STEP;
