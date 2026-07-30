export type MemberKind = "deck" | "steel";
export type GamePhase = "BUILD" | "TESTING" | "SUCCESS" | "FAILURE";
export type FailureReason = "fell" | "stalled" | "timeout" | "stopped";
export type StressMode = "tension" | "compression" | "shear" | "bending";

export interface Vec2Data {
  x: number;
  y: number;
}

export interface AnchorDefinition extends Vec2Data {
  id: string;
  kind: "road" | "foundation";
  label: string;
}

export interface MaterialDefinition {
  kind: MemberKind;
  label: string;
  costPerMeter: number;
  density: number;
  maxLength: number;
  tensileStrength: number;
  compressiveStrength: number;
  shearStrength: number;
  bendingStrength: number;
  color: number;
}

export interface TruckDefinition {
  start: Vec2Data;
  chassisHalfWidth: number;
  chassisHalfHeight: number;
  chassisDensity: number;
  wheelRadius: number;
  wheelOffsetX: number;
  wheelOffsetY: number;
  wheelDensity: number;
  suspensionFrequencyHz: number;
  suspensionDampingRatio: number;
  targetSpeed: number;
  maxMotorTorque: number;
  startDelay: number;
  finishX: number;
  fallY: number;
  timeout: number;
  stallWindow: number;
  minimumProgress: number;
}

export interface LevelDefinition {
  id: string;
  title: string;
  canyonWidth: number;
  gridSpacing: number;
  budget: number;
  buildBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  viewBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  anchors: AnchorDefinition[];
  materials: Record<MemberKind, MaterialDefinition>;
  physics: {
    gravity: number;
    nodeMass: number;
    steelFrequencyHz: number;
    steelDampingRatio: number;
  };
  truck: TruckDefinition;
}

export interface BridgeNode extends Vec2Data {
  id: string;
  anchorId?: string;
}

export interface BridgeMember {
  id: string;
  kind: MemberKind;
  startNodeId: string;
  endNodeId: string;
  length: number;
  cost: number;
}

export interface BridgeDesign {
  version: 1;
  nodes: BridgeNode[];
  members: BridgeMember[];
}

export interface DesignValidation {
  valid: boolean;
  totalCost: number;
  hasRoadPath: boolean;
  issues: string[];
}

export interface TestResult {
  outcome: "success" | "failure";
  elapsedTime: number;
  cost: number;
  brokenMemberCount: number;
  failureReason?: FailureReason;
}

export interface MemberStress {
  memberId: string;
  utilization: number;
  smoothedUtilization: number;
  mode: StressMode;
  componentUtilization: {
    axial: number;
    shear: number;
    bending: number;
  };
  overloadTime: number;
  broken: boolean;
}

export interface PersistedState {
  version: 1;
  design: BridgeDesign;
  muted: boolean;
}
