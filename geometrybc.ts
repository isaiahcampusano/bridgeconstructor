import type { BridgeNode, BridgeDesign, BridgeMember, LevelDefinition } from '../types';

/**
 * Calculate distance between two points
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a point is within snap distance of a node
 */
export function isWithinSnapDistance(
  x: number,
  y: number,
  nodeX: number,
  nodeY: number,
  gridSpacing: number,
  snapDistance: number = 0.2 // meters
): boolean {
  return distance(x, y, nodeX, nodeY) <= snapDistance;
}

/**
 * Find nearest node within snap distance
 */
export function findNearestNode(
  x: number,
  y: number,
  nodes: BridgeNode[],
  gridSpacing: number,
  snapDistance: number = 0.2
): BridgeNode | null {
  let nearest: BridgeNode | null = null;
  let minDist = snapDistance;

  for (const node of nodes) {
    const dist = distance(x, y, node.x, node.y);
    if (dist < minDist) {
      nearest = node;
      minDist = dist;
    }
  }

  return nearest;
}

/**
 * Snap point to grid
 */
export function snapToGrid(value: number, gridSize: number = 1): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Check if two members cross (but don't share an endpoint)
 */
export function doMembersCross(
  member1: BridgeMember,
  member2: BridgeMember,
  nodeMap: Map<string, BridgeNode>
): boolean {
  // Members that share an endpoint are connected, not crossed
  if (
    member1.fromNodeId === member2.fromNodeId ||
    member1.fromNodeId === member2.toNodeId ||
    member1.toNodeId === member2.fromNodeId ||
    member1.toNodeId === member2.toNodeId
  ) {
    return false;
  }

  const n1 = nodeMap.get(member1.fromNodeId);
  const n2 = nodeMap.get(member1.toNodeId);
  const n3 = nodeMap.get(member2.fromNodeId);
  const n4 = nodeMap.get(member2.toNodeId);

  if (!n1 || !n2 || !n3 || !n4) return false;

  return segmentsIntersect(n1.x, n1.y, n2.x, n2.y, n3.x, n3.y, n4.x, n4.y);
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };

  return ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
         ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
}

/**
 * Check if there is a continuous road from left to right anchor
 */
export function hasRoadContinuity(design: BridgeDesign, level: LevelDefinition): boolean {
  // Find left and right anchor nodes
  const leftAnchor = design.nodes.find(n => n.isAnchor && Math.abs(n.x - level.leftAnchorX) < 0.1);
  const rightAnchor = design.nodes.find(n => n.isAnchor && Math.abs(n.x - level.rightAnchorX) < 0.1);

  if (!leftAnchor || !rightAnchor) return false;

  // Build adjacency graph of deck members only
  const graph = new Map<string, Set<string>>();
  for (const node of design.nodes) {
    graph.set(node.id, new Set());
  }

  for (const member of design.members) {
    if (member.kind === 'deck') {
      graph.get(member.fromNodeId)?.add(member.toNodeId);
      graph.get(member.toNodeId)?.add(member.fromNodeId);
    }
  }

  // BFS from left anchor to right anchor
  const visited = new Set<string>();
  const queue = [leftAnchor.id];
  visited.add(leftAnchor.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (nodeId === rightAnchor.id) return true;

    for (const neighbor of graph.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Calculate total cost of a design
 */
export function calculateTotalCost(design: BridgeDesign): number {
  return design.members.reduce((sum, member) => sum + member.cost, 0);
}

/**
 * Validate member length against limit
 */
export function isValidMemberLength(
  memberLength: number,
  memberKind: 'deck' | 'steel',
  level: LevelDefinition
): boolean {
  return memberLength <= level.maxMemberLength[memberKind];
}

/**
 * Get all nodes that are connected to a given node by road decks
 */
export function getConnectedRoadNodes(nodeId: string, design: BridgeDesign): Set<string> {
  const connected = new Set<string>();
  const queue = [nodeId];
  connected.add(nodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const member of design.members) {
      if (member.kind === 'deck') {
        if (member.fromNodeId === current && !connected.has(member.toNodeId)) {
          connected.add(member.toNodeId);
          queue.push(member.toNodeId);
        } else if (member.toNodeId === current && !connected.has(member.fromNodeId)) {
          connected.add(member.fromNodeId);
          queue.push(member.fromNodeId);
        }
      }
    }
  }

  return connected;
}
