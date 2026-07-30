import type {
  BridgeDesign,
  BridgeMember,
  BridgeNode,
  DesignValidation,
  LevelDefinition,
  MemberKind,
  Vec2Data,
} from "./types";

const EPSILON = 1e-6;

export interface EditResult {
  ok: boolean;
  design: BridgeDesign;
  reason: string;
  memberId?: string;
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function snapPoint(point: Vec2Data, spacing: number): Vec2Data {
  return {
    x: roundCoordinate(Math.round(point.x / spacing) * spacing),
    y: roundCoordinate(Math.round(point.y / spacing) * spacing),
  };
}

export function distance(a: Vec2Data, b: Vec2Data): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointKey(point: Vec2Data): string {
  return `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`;
}

export function createEmptyDesign(level: LevelDefinition): BridgeDesign {
  return {
    version: 1,
    nodes: level.anchors.map((anchor) => ({
      id: anchor.id,
      x: anchor.x,
      y: anchor.y,
      anchorId: anchor.id,
    })),
    members: [],
  };
}

export function designCost(design: BridgeDesign): number {
  return design.members.reduce((total, member) => total + member.cost, 0);
}

export function findNodeAt(design: BridgeDesign, point: Vec2Data): BridgeNode | undefined {
  const key = pointKey(point);
  return design.nodes.find((node) => pointKey(node) === key);
}

function nextId(prefix: string, values: Array<{ id: string }>): string {
  const used = new Set(values.map((value) => value.id));
  let index = 1;
  while (used.has(`${prefix}-${index}`)) {
    index += 1;
  }
  return `${prefix}-${index}`;
}

function pointInBounds(point: Vec2Data, level: LevelDefinition): boolean {
  const bounds = level.buildBounds;
  return (
    point.x >= bounds.minX - EPSILON &&
    point.x <= bounds.maxX + EPSILON &&
    point.y >= bounds.minY - EPSILON &&
    point.y <= bounds.maxY + EPSILON
  );
}

export function previewMember(
  design: BridgeDesign,
  level: LevelDefinition,
  kind: MemberKind,
  rawStart: Vec2Data,
  rawEnd: Vec2Data,
): {
  valid: boolean;
  reason: string;
  start: Vec2Data;
  end: Vec2Data;
  length: number;
  cost: number;
} {
  const start = snapPoint(rawStart, level.gridSpacing);
  const end = snapPoint(rawEnd, level.gridSpacing);
  const memberLength = distance(start, end);
  const cost = Math.round(memberLength * level.materials[kind].costPerMeter);

  if (!pointInBounds(start, level) || !pointInBounds(end, level)) {
    return {
      valid: false,
      reason: "Keep both endpoints inside the build grid.",
      start,
      end,
      length: memberLength,
      cost,
    };
  }
  if (memberLength < EPSILON) {
    return {
      valid: false,
      reason: "Drag to a different grid point.",
      start,
      end,
      length: memberLength,
      cost,
    };
  }
  if (memberLength > level.materials[kind].maxLength + EPSILON) {
    return {
      valid: false,
      reason: `${level.materials[kind].label} spans are limited to ${level.materials[kind].maxLength} m.`,
      start,
      end,
      length: memberLength,
      cost,
    };
  }
  if (kind === "deck" && Math.abs(end.y - start.y) > level.gridSpacing + EPSILON) {
    return {
      valid: false,
      reason: "Road deck can rise or fall by at most one grid step.",
      start,
      end,
      length: memberLength,
      cost,
    };
  }

  const startNode = findNodeAt(design, start);
  const endNode = findNodeAt(design, end);
  if (startNode && endNode) {
    const duplicate = design.members.some(
      (member) =>
        (member.startNodeId === startNode.id && member.endNodeId === endNode.id) ||
        (member.startNodeId === endNode.id && member.endNodeId === startNode.id),
    );
    if (duplicate) {
      return {
        valid: false,
        reason: "A member already connects these points.",
        start,
        end,
        length: memberLength,
        cost,
      };
    }
  }

  if (designCost(design) + cost > level.budget) {
    return {
      valid: false,
      reason: "That member would exceed the budget.",
      start,
      end,
      length: memberLength,
      cost,
    };
  }

  return { valid: true, reason: "Release to place", start, end, length: memberLength, cost };
}

export function addMember(
  design: BridgeDesign,
  level: LevelDefinition,
  kind: MemberKind,
  rawStart: Vec2Data,
  rawEnd: Vec2Data,
): EditResult {
  const preview = previewMember(design, level, kind, rawStart, rawEnd);
  if (!preview.valid) {
    return { ok: false, design, reason: preview.reason };
  }

  const nodes = design.nodes.map((node) => ({ ...node }));
  let startNode = findNodeAt(design, preview.start);
  let endNode = findNodeAt(design, preview.end);

  if (!startNode) {
    startNode = { id: nextId("node", nodes), ...preview.start };
    nodes.push(startNode);
  }
  if (!endNode) {
    endNode = { id: nextId("node", nodes), ...preview.end };
    nodes.push(endNode);
  }

  const member: BridgeMember = {
    id: nextId("member", design.members),
    kind,
    startNodeId: startNode.id,
    endNodeId: endNode.id,
    length: roundCoordinate(preview.length),
    cost: preview.cost,
  };

  return {
    ok: true,
    design: {
      version: 1,
      nodes,
      members: [...design.members.map((item) => ({ ...item })), member],
    },
    reason: "",
    memberId: member.id,
  };
}

export function removeMember(design: BridgeDesign, memberId: string): BridgeDesign {
  const members = design.members.filter((member) => member.id !== memberId);
  const usedNodes = new Set<string>();
  for (const member of members) {
    usedNodes.add(member.startNodeId);
    usedNodes.add(member.endNodeId);
  }
  const nodes = design.nodes.filter((node) => node.anchorId || usedNodes.has(node.id));
  return {
    version: 1,
    nodes: nodes.map((node) => ({ ...node })),
    members: members.map((member) => ({ ...member })),
  };
}

export function hasContinuousRoad(design: BridgeDesign): boolean {
  const graph = new Map<string, string[]>();
  for (const member of design.members) {
    if (member.kind !== "deck") {
      continue;
    }
    graph.set(member.startNodeId, [...(graph.get(member.startNodeId) ?? []), member.endNodeId]);
    graph.set(member.endNodeId, [...(graph.get(member.endNodeId) ?? []), member.startNodeId]);
  }

  const queue = ["road-left"];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === "road-right") {
      return true;
    }
    for (const neighbor of graph.get(node ?? "") ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

export function validateDesign(design: BridgeDesign, level: LevelDefinition): DesignValidation {
  const totalCost = designCost(design);
  const hasRoadPath = hasContinuousRoad(design);
  const issues: string[] = [];
  if (!hasRoadPath) {
    issues.push("Build a continuous road between the two road anchors.");
  }
  if (totalCost > level.budget) {
    issues.push("The bridge is over budget.");
  }
  if (design.members.length === 0) {
    issues.push("Place at least one bridge member.");
  }
  return { valid: issues.length === 0, totalCost, hasRoadPath, issues };
}

export function segmentsCrossWithoutNode(
  a1: Vec2Data,
  a2: Vec2Data,
  b1: Vec2Data,
  b2: Vec2Data,
): boolean {
  if ([a1, a2].some((a) => [b1, b2].some((b) => pointKey(a) === pointKey(b)))) {
    return false;
  }
  const orientation = (p: Vec2Data, q: Vec2Data, r: Vec2Data) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function cloneDesign(design: BridgeDesign): BridgeDesign {
  return {
    version: 1,
    nodes: design.nodes.map((node) => ({ ...node })),
    members: design.members.map((member) => ({ ...member })),
  };
}
