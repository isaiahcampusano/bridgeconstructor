import * as Planck from 'planck-js';
import type {
  BridgeDesign,
  LevelDefinition,
  TestResult,
  MemberStress,
  PhysicsBodyRef,
} from '../types';

/**
 * Physics simulator for bridge testing
 */
export class PhysicsSimulator {
  private world: Planck.World;
  private bodies: Map<string, Planck.Body> = new Map();
  private joints: Map<string, Planck.Joint> = new Map();
  private timeStep: number = 1 / 120; // 120 Hz
  private elapsedTime: number = 0;
  private truckWheelMotors: Map<string, number> = new Map();
  private memberStress: Map<string, MemberStress> = new Map();
  private brokenMembers: Set<string> = new Set();
  private level: LevelDefinition;
  private design: BridgeDesign;

  constructor(level: LevelDefinition, design: BridgeDesign) {
    this.level = level;
    this.design = design;

    // Create world with gravity
    this.world = Planck.World({
      gravity: [0, 9.81],
    });
  }

  /**
   * Initialize physics bodies for the bridge and truck
   */
  initialize(): void {
    this.createBridgeBodies();
    this.createTruck();
  }

  private createBridgeBodies(): void {
    const nodeMap = new Map(this.design.nodes.map(n => [n.id, n]));

    // Create node bodies for steel members
    for (const node of this.design.nodes) {
      const isAnchor = node.isAnchor;
      const body = this.world.createBody({
        type: isAnchor ? 'static' : 'dynamic',
        position: [node.x, node.y],
      });

      if (!isAnchor) {
        // Add mass for dynamic nodes
        const fixtures: Planck.FixtureDef[] = [];
        const circle = Planck.Circle(0.05); // Small radius for node
        fixtures.push({ shape: circle });
        for (const fixture of fixtures) {
          body.createFixture(fixture);
        }
        body.setMassData({ mass: 1, center: [0, 0], I: 0.1 });
      }

      this.bodies.set(`node-${node.id}`, body);
    }

    // Create steel member distance joints
    for (const member of this.design.members) {
      if (member.kind === 'steel') {
        const fromBody = this.bodies.get(`node-${member.fromNodeId}`);
        const toBody = this.bodies.get(`node-${member.toNodeId}`);

        if (fromBody && toBody) {
          const joint = this.world.createJoint(
            Planck.DistanceJoint(
              {
                frequencyHz: 10,
                dampingRatio: 0.5,
              },
              fromBody,
              toBody,
              fromBody.getPosition(),
              toBody.getPosition()
            )
          );
          this.joints.set(`member-${member.id}`, joint);
        }
      }
    }

    // Create deck bodies and revolute joints
    for (const member of this.design.members) {
      if (member.kind === 'deck') {
        const fromNode = nodeMap.get(member.fromNodeId);
        const toNode = nodeMap.get(member.toNodeId);

        if (!fromNode || !toNode) continue;

        // Create deck body as a box
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const centerX = (fromNode.x + toNode.x) / 2;
        const centerY = (fromNode.y + toNode.y) / 2;
        const angle = Math.atan2(dy, dx);

        const deckBody = this.world.createBody({
          type: 'dynamic',
          position: [centerX, centerY],
          angle,
        });

        // Create box fixture
        const width = member.length;
        const height = 0.2;
        const polygon = Planck.Polygon([
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ]);

        deckBody.createFixture({
          shape: polygon,
          friction: 0.3,
          density: this.level.materials.deck.density / 100, // Scale for physics
        });

        this.bodies.set(`deck-${member.id}`, deckBody);

        // Create revolute joints at endpoints
        const fromBody = this.bodies.get(`node-${member.fromNodeId}`);
        const toBody = this.bodies.get(`node-${member.toNodeId}`);

        if (fromBody) {
          this.world.createJoint(
            Planck.RevoluteJoint(
              { collideConnected: false },
              fromBody,
              deckBody,
              [fromNode.x, fromNode.y]
            )
          );
        }

        if (toBody) {
          this.world.createJoint(
            Planck.RevoluteJoint(
              { collideConnected: false },
              toBody,
              deckBody,
              [toNode.x, toNode.y]
            )
          );
        }
      }
    }
  }

  private createTruck(): void {
    const truck = this.level.truck;
    const startX = this.level.leftAnchorX + 0.5;
    const startY = this.level.topY - 0.5;

    // Create chassis
    const chassisBody = this.world.createBody({
      type: 'dynamic',
      position: [startX, startY],
    });

    const chassisBox = Planck.Polygon([
      [-truck.chassisWidth / 2, -truck.chassisHeight / 2],
      [truck.chassisWidth / 2, -truck.chassisHeight / 2],
      [truck.chassisWidth / 2, truck.chassisHeight / 2],
      [-truck.chassisWidth / 2, truck.chassisHeight / 2],
    ]);

    chassisBody.createFixture({
      shape: chassisBox,
      friction: 0.3,
      density: truck.mass / ((truck.chassisWidth * truck.chassisHeight) * 100),
    });

    this.bodies.set('truck-chassis', chassisBody);

    // Create wheels
    for (let i = 0; i < 2; i++) {
      const wheelX = (i === 0 ? -1 : 1) * (truck.chassisWidth / 2 - truck.wheelRadius);
      const wheelY = truck.chassisHeight / 2 + truck.wheelRadius * 0.5;

      const wheelBody = this.world.createBody({
        type: 'dynamic',
        position: [startX + wheelX, startY + wheelY],
      });

      const wheelCircle = Planck.Circle(truck.wheelRadius);
      wheelBody.createFixture({
        shape: wheelCircle,
        friction: 1.0,
        density: 0.5,
        restitution: 0.3,
      });

      const wheelId = `truck-wheel-${i}`;
      this.bodies.set(wheelId, wheelBody);
      this.truckWheelMotors.set(wheelId, 0);

      // Create suspension joint
      this.world.createJoint(
        Planck.RevoluteJoint(
          {
            motorSpeed: 0,
            maxMotorTorque: 10000,
            enableMotor: true,
            collideConnected: false,
          },
          chassisBody,
          wheelBody,
          [startX + wheelX, startY + wheelY]
        )
      );
    }
  }

  /**
   * Step simulation
   */
  step(): void {
    // Apply wheel motor
    const chassis = this.bodies.get('truck-chassis');
    if (chassis) {
      for (let i = 0; i < 2; i++) {
        const wheelId = `truck-wheel-${i}`;
        const wheel = this.bodies.get(wheelId);
        if (wheel) {
          const motorSpeed = this.level.truck.motorPower * 50; // Arbitrary scaling
          wheel.setAngularVelocity(motorSpeed);
        }
      }
    }

    // Step physics
    this.world.step(this.timeStep);
    this.elapsedTime += this.timeStep;

    // Update stress calculations
    this.updateMemberStress();
  }

  private updateMemberStress(): void {
    // This is a simplified stress calculation
    // In a real implementation, you'd extract joint reaction forces from Planck.js
    // For now, we'll estimate stress based on member deformation

    for (const member of this.design.members) {
      const body1 = this.bodies.get(`node-${member.fromNodeId}`);
      const body2 = this.bodies.get(`node-${member.toNodeId}`);

      if (!body1 || !body2) continue;

      const pos1 = body1.getPosition();
      const pos2 = body2.getPosition();

      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const currentLength = Math.sqrt(dx * dx + dy * dy);
      const originalLength = member.length;
      const strain = Math.abs(currentLength - originalLength) / originalLength;
      const utilization = Math.max(0, Math.min(2, strain * 200)); // Scale for visibility

      const stress: MemberStress = {
        memberId: member.id,
        utilization: utilization,
        kind: currentLength > originalLength ? 'tension' : 'compression',
        isBroken: this.brokenMembers.has(member.id) || utilization > 1.5,
      };

      if (stress.isBroken) {
        this.brokenMembers.add(member.id);
      }

      this.memberStress.set(member.id, stress);
    }
  }

  /**
   * Get stress for a member
   */
  getMemberStress(memberId: string): MemberStress | null {
    return this.memberStress.get(memberId) || null;
  }

  /**
   * Get all member stresses
   */
  getAllStresses(): MemberStress[] {
    return Array.from(this.memberStress.values());
  }

  /**
   * Get truck chassis position
   */
  getTruckPosition(): PhysicsBodyRef | null {
    const chassis = this.bodies.get('truck-chassis');
    if (!chassis) return null;

    const pos = chassis.getPosition();
    const vel = chassis.getLinearVelocity();

    return {
      id: 'truck',
      x: pos.x,
      y: pos.y,
      angle: chassis.getAngle(),
      vx: vel.x,
      vy: vel.y,
      angularVelocity: chassis.getAngularVelocity(),
    };
  }

  /**
   * Get elapsed time
   */
  getElapsedTime(): number {
    return this.elapsedTime;
  }

  /**
   * Check if truck has failed (fell or stalled)
   */
  getTruckStatus(): {
    hasFallen: boolean;
    lastProgress: number;
    stallDuration: number;
  } {
    const truck = this.getTruckPosition();
    if (!truck) {
      return { hasFallen: true, lastProgress: 0, stallDuration: 0 };
    }

    // Check if truck fell
    if (truck.y > this.level.bottomY + 2) {
      return { hasFallen: true, lastProgress: truck.x, stallDuration: 0 };
    }

    return { hasFallen: false, lastProgress: truck.x, stallDuration: 0 };
  }

  /**
   * Check if truck reached goal
   */
  hasReachedGoal(): boolean {
    const truck = this.getTruckPosition();
    return truck ? truck.x >= this.level.successTriggerX : false;
  }

  /**
   * Get all bodies (for rendering)
   */
  getAllBodies(): Map<string, Planck.Body> {
    return this.bodies;
  }

  /**
   * Get broken member count
   */
  getBrokenMemberCount(): number {
    return this.brokenMembers.size;
  }
}
