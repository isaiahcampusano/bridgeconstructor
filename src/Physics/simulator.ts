/**
 * SIMULATOR UPDATES - add these methods to src/physics/simulator.ts
 * This handles cable compression detection and multi-component stress
 */

/**
 * In the PhysicsSimulator class, replace/update the stress calculation:
 */

private updateMemberStress(): void {
  for (const member of this.design.members) {
    const body1 = this.bodies.get(`node-${member.fromNodeId}`);
    const body2 = this.bodies.get(`node-${member.toNodeId}`);
    const joint = this.joints.get(`member-${member.id}`);

    if (!body1 || !body2) continue;

    const pos1 = body1.getPosition();
    const pos2 = body2.getPosition();
    const material = this.level.materials[member.material];

    if (!material) continue;

    // Calculate current member length
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy);
    const strain = (currentLength - member.length) / member.length;

    // Get reaction force from joint (if available)
    let axialForce = 0;
    let shearForce = 0;
    let bendingMoment = 0;
    let forceKind: 'tension' | 'compression' = strain > 0 ? 'tension' : 'compression';

    // Simplified stress from joint reaction (scales with strain)
    const maxForce = forceKind === 'tension' ? material.maxTensile : material.maxCompressive;
    axialForce = Math.abs(strain * maxForce);

    // Calculate utilization per component
    let axialUtil = maxForce > 0 ? axialForce / maxForce : 0;
    let shearUtil = 0;
    let bendingUtil = 0;

    // For deck-like materials, estimate shear and bending
    if (member.material === 'asphalt') {
      // Approximate shear as 30% of total load
      shearForce = axialForce * 0.3;
      shearUtil = material.maxShear ? shearForce / material.maxShear : 0;

      // Approximate bending as remaining load
      bendingMoment = axialForce * 0.4;
      bendingUtil = material.maxBendingMoment ? bendingMoment / material.maxBendingMoment : 0;
    }

    const totalUtil = Math.max(axialUtil, shearUtil, bendingUtil);

    // SPECIAL: Cable cannot be compressed
    let isBroken = this.brokenMembers.has(member.id);
    if (member.material === 'cable') {
      if (forceKind === 'compression') {
        // Cable snaps immediately on compression
        isBroken = true;
        this.brokenMembers.add(member.id);
        // Destroy the joint
        if (joint) {
          this.world.destroyJoint(joint);
          this.joints.delete(`member-${member.id}`);
        }
      }
    } else {
      // Normal materials break after 120ms above 100% or immediately above 150%
      if (totalUtil > 1.5) {
        isBroken = true;
      } else if (totalUtil > 1.0) {
        // Track time above threshold
        if (!this.overloadTimers) this.overloadTimers = new Map();
        const currentTime = (this.overloadTimers.get(member.id) || 0) + this.timeStep;
        this.overloadTimers.set(member.id, currentTime);

        if (currentTime > 0.12) {
          // 120ms threshold
          isBroken = true;
        }
      } else {
        // Reset overload timer
        if (this.overloadTimers) this.overloadTimers.delete(member.id);
      }

      // Destroy joint if broken
      if (isBroken && !this.brokenMembers.has(member.id)) {
        this.brokenMembers.add(member.id);
        if (joint) {
          this.world.destroyJoint(joint);
          this.joints.delete(`member-${member.id}`);
        }
      }
    }

    const stress: MemberStress = {
      memberId: member.id,
      material: member.material,
      utilization: totalUtil,
      axial: axialUtil,
      shear: shearUtil,
      bending: bendingUtil,
      kind: isBroken && member.material === 'cable' ? 'cable_compressed' : forceKind,
      isBroken,
    };

    this.memberStress.set(member.id, stress);
  }
}

/**
 * Add this to PhysicsSimulator class constructor:
 */
private overloadTimers: Map<string, number> = new Map();

/**
 * Update return type of updateMemberStress and stress retrieval:
 */
getMemberStress(memberId: string): MemberStress | null {
  return this.memberStress.get(memberId) || null;
}

getAllStresses(): MemberStress[] {
  return Array.from(this.memberStress.values());
}

/**
 * Update TestResult detection to include cable failures:
 */
getTruckStatus(): {
  hasFallen: boolean;
  hasFailedCable: boolean;
  lastProgress: number;
  stallDuration: number;
} {
  const truck = this.getTruckPosition();
  if (!truck) {
    return { hasFallen: true, hasFailedCable: false, lastProgress: 0, stallDuration: 0 };
  }

  // Check if truck fell
  if (truck.y > this.level.bottomY + 2) {
    return { hasFallen: true, hasFailedCable: false, lastProgress: truck.x, stallDuration: 0 };
  }

  // Check if cable failed
  const hasFailedCable = Array.from(this.memberStress.values()).some(
    s => s.material === 'cable' && s.kind === 'cable_compressed'
  );

  return { hasFallen: false, hasFailedCable, lastProgress: truck.x, stallDuration: 0 };
}
