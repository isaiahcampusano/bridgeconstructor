import { createEmptyDesign, designCost, distance, pointKey } from "./model";
import {
  type BridgeDesign,
  type LevelDefinition,
  MEMBER_KINDS,
  type PersistedState,
} from "./types";

const STORAGE_PREFIX = "bridge-constructor:state:v1";
export const STORAGE_KEY = `${STORAGE_PREFIX}:blueprint-span-01`;

export function storageKeyFor(levelId: string): string {
  return `${STORAGE_PREFIX}:${levelId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBridgeDesign(value: unknown): value is BridgeDesign {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<BridgeDesign>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.members) &&
    candidate.nodes.every(
      (node) =>
        node &&
        typeof node.id === "string" &&
        isFiniteNumber(node.x) &&
        isFiniteNumber(node.y) &&
        (node.anchorId === undefined || typeof node.anchorId === "string"),
    ) &&
    candidate.members.every(
      (member) =>
        member &&
        typeof member.id === "string" &&
        MEMBER_KINDS.some((kind) => member.kind === kind) &&
        typeof member.startNodeId === "string" &&
        typeof member.endNodeId === "string" &&
        isFiniteNumber(member.length) &&
        isFiniteNumber(member.cost),
    )
  );
}

export function isCompatibleDesign(design: BridgeDesign, level: LevelDefinition): boolean {
  const nodeIds = new Set<string>();
  const memberIds = new Set<string>();
  const pointKeys = new Set<string>();
  const nodeById = new Map<string, BridgeDesign["nodes"][number]>();
  const bounds = level.buildBounds;

  for (const node of design.nodes) {
    const key = pointKey(node);
    if (
      nodeIds.has(node.id) ||
      pointKeys.has(key) ||
      node.x < bounds.minX ||
      node.x > bounds.maxX ||
      node.y < bounds.minY ||
      node.y > bounds.maxY
    ) {
      return false;
    }
    nodeIds.add(node.id);
    pointKeys.add(key);
    nodeById.set(node.id, node);
  }

  for (const anchor of level.anchors) {
    const node = nodeById.get(anchor.id);
    if (!node || node.anchorId !== anchor.id || node.x !== anchor.x || node.y !== anchor.y) {
      return false;
    }
  }
  if (
    design.nodes.some(
      (node) => node.anchorId && !level.anchors.some((anchor) => anchor.id === node.anchorId),
    )
  ) {
    return false;
  }

  const connections = new Set<string>();
  for (const member of design.members) {
    const start = nodeById.get(member.startNodeId);
    const end = nodeById.get(member.endNodeId);
    const connection = [member.startNodeId, member.endNodeId].sort().join(":");
    if (
      memberIds.has(member.id) ||
      connections.has(connection) ||
      !start ||
      !end ||
      start.id === end.id
    ) {
      return false;
    }
    const measuredLength = distance(start, end);
    const material = level.materials[member.kind];
    if (!material) {
      return false;
    }
    const expectedCost = Math.round(measuredLength * material.costPerMeter);
    if (
      Math.abs(member.length - measuredLength) > 0.001 ||
      member.cost !== expectedCost ||
      measuredLength > material.maxLength + 0.001
    ) {
      return false;
    }
    memberIds.add(member.id);
    connections.add(connection);
  }
  return designCost(design) <= level.budget;
}

export function parsePersistedState(raw: string | null, level: LevelDefinition): PersistedState {
  if (!raw) {
    return { version: 1, design: createEmptyDesign(level), muted: false };
  }
  try {
    const value = JSON.parse(raw) as Partial<PersistedState>;
    if (
      value.version === 1 &&
      isBridgeDesign(value.design) &&
      isCompatibleDesign(value.design, level) &&
      typeof value.muted === "boolean"
    ) {
      return { version: 1, design: value.design, muted: value.muted };
    }
  } catch {
    // Corrupt local data intentionally falls through to a clean design.
  }
  return { version: 1, design: createEmptyDesign(level), muted: false };
}

export function loadState(level: LevelDefinition): PersistedState {
  try {
    return parsePersistedState(localStorage.getItem(storageKeyFor(level.id)), level);
  } catch {
    return { version: 1, design: createEmptyDesign(level), muted: false };
  }
}

export function saveState(level: LevelDefinition, state: PersistedState): void {
  try {
    localStorage.setItem(storageKeyFor(level.id), JSON.stringify(state));
  } catch {
    // The game remains playable if storage is blocked or full.
  }
}
