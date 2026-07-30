/**
 * Core type definitions for Bridge Constructor
 */

export type GameState = 'BUILD' | 'TESTING' | 'SUCCESS' | 'FAILURE';
export type MemberKind = 'deck' | 'steel';
export type TestOutcome = 'success' | 'failure_unsupported' | 'failure_broke' | 'failure_stalled' | 'failure_timeout';

/**
 * Material properties for structural members
 */
export interface MaterialDefinition {
  kind: MemberKind;
  density: number; // kg/m
  costPerMeter: number; // dollars
  maxTensile: number; // Newtons
  maxCompressive: number; // Newtons
  maxBendingMoment?: number; // N⋅m for deck
  color: number; // PIXI color int
  stressColor: { amber: number; red: number };
}

/**
 * Bridge node in the design (anchor point or joint)
 */
export interface BridgeNode {
  id: string;
  x: number; // meters
  y: number; // meters
  isAnchor: boolean;
  label?: string;
}

/**
 * Bridge member connecting two nodes
 */
export interface BridgeMember {
  id: string;
  kind: MemberKind;
  fromNodeId: string;
  toNodeId: string;
  length: number; // meters
  cost: number; // dollars
}

/**
 * Complete bridge design (independent of physics simulation)
 */
export interface BridgeDesign {
  nodes: BridgeNode[];
  members: BridgeMember[];
  totalCost: number;
}

/**
 * Truck configuration and state
 */
export interface TruckDefinition {
  wheelRadius: number; // meters
  chassisWidth: number; // meters
  chassisHeight: number; // meters
  mass: number; // kg
  motorPower: number; // watts/N
  maxVelocity: number; // m/s
}

/**
 * Result of a test run
 */
export interface TestResult {
  outcome: TestOutcome;
  elapsedTime: number; // seconds
  cost: number; // dollars
  brokenMemberCount: number;
  failureReason?: string;
  truckDistance?: number; // meters traveled
}

/**
 * Canyon and level parameters
 */
export interface LevelDefinition {
  canvasWidth: number; // pixels
  canvasHeight: number; // pixels
  canvasWidthMeters: number; // 8 meters
  gridSpacing: number; // 1 meter in pixels
  leftAnchorX: number; // meters
  rightAnchorX: number; // meters
  topY: number; // meters (roadway level)
  bottomY: number; // meters (cliff level)
  budget: number; // dollars
  maxMemberLength: { deck: number; steel: number }; // meters
  materials: { [key in MemberKind]: MaterialDefinition };
  truck: TruckDefinition;
  successTriggerX: number; // meters (right side)
  testTimeLimit: number; // seconds
  stallTimeLimit: number; // seconds
}

/**
 * Persistence data saved to localStorage
 */
export interface SavedGameState {
  version: number;
  design: BridgeDesign;
  muted: boolean;
  timestamp: number;
}

/**
 * Stress state for a member during physics simulation
 */
export interface MemberStress {
  memberId: string;
  utilization: number; // 0 to 1+
  kind: 'tension' | 'compression' | 'bending';
  isBroken: boolean;
}

/**
 * Physics body reference during simulation
 */
export interface PhysicsBodyRef {
  id: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  angularVelocity: number;
}

/**
 * Joint reaction force data
 */
export interface JointReaction {
  force: { x: number; y: number };
  torque: number;
}
