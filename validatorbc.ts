import type { BridgeDesign, BridgeMember, LevelDefinition } from '../types';
import {
  hasRoadContinuity,
  calculateTotalCost,
  isValidMemberLength,
  doMembersCross,
} from '../utils/geometry';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a complete bridge design
 */
export function validateDesign(design: BridgeDesign, level: LevelDefinition): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if design has any members
  if (design.members.length === 0) {
    errors.push('No bridge members constructed');
  }

  // Create node map for lookups
  const nodeMap = new Map(design.nodes.map(n => [n.id, n]));

  // Check for invalid members
  for (const member of design.members) {
    if (!nodeMap.has(member.fromNodeId)) {
      errors.push(`Member ${member.id}: invalid from node`);
    }
    if (!nodeMap.has(member.toNodeId)) {
      errors.push(`Member ${member.id}: invalid to node`);
    }
    if (!isValidMemberLength(member.length, member.kind, level)) {
      errors.push(`${member.kind} member exceeds max length of ${level.maxMemberLength[member.kind]}m`);
    }
  }

  // Check for member crossings
  for (let i = 0; i < design.members.length; i++) {
    for (let j = i + 1; j < design.members.length; j++) {
      if (doMembersCross(design.members[i], design.members[j], nodeMap)) {
        warnings.push(`Members ${design.members[i].id} and ${design.members[j].id} cross without shared node`);
      }
    }
  }

  // Check road continuity
  if (!hasRoadContinuity(design, level)) {
    errors.push('No continuous road deck from left to right anchor');
  }

  // Check budget
  const totalCost = calculateTotalCost(design);
  if (totalCost > level.budget) {
    errors.push(`Total cost $${totalCost} exceeds budget of $${level.budget}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick validation for UI feedback (no full checks)
 */
export function validateMember(
  member: BridgeMember,
  level: LevelDefinition,
  design: BridgeDesign
): ValidationResult {
  const errors: string[] = [];

  if (!isValidMemberLength(member.length, member.kind, level)) {
    errors.push(`Member length ${member.length.toFixed(2)}m exceeds maximum ${level.maxMemberLength[member.kind]}m`);
  }

  const totalCost = calculateTotalCost(design) + member.cost;
  if (totalCost > level.budget) {
    errors.push(`Adding this member would exceed budget ($${totalCost} > $${level.budget})`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Check if a member can be placed between two nodes
 */
export function canPlaceMember(
  fromNodeId: string,
  toNodeId: string,
  kind: 'deck' | 'steel',
  level: LevelDefinition,
  design: BridgeDesign,
  nodeMap: Map<string, { x: number; y: number }>
): boolean {
  const fromNode = nodeMap.get(fromNodeId);
  const toNode = nodeMap.get(toNodeId);

  if (!fromNode || !toNode) return false;

  // Same node
  if (fromNodeId === toNodeId) return false;

  // Check for duplicate members
  const exists = design.members.some(
    m =>
      (m.fromNodeId === fromNodeId && m.toNodeId === toNodeId) ||
      (m.fromNodeId === toNodeId && m.toNodeId === fromNodeId)
  );

  if (exists) return false;

  // Calculate length
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Check length limit
  if (length > level.maxMemberLength[kind]) return false;

  return true;
}
