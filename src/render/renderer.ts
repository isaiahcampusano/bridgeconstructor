/**
 * RENDERER UPDATES - update src/render/renderer.ts with these methods
 */

/**
 * Add this method to Renderer class to draw line styles
 */
private drawMemberLine(
  graphics: PIXI.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  material: MaterialDefinition,
  color: number
): void {
  const lineStyle = material.lineStyle || 'solid';
  const width = material.lineWidth || 2;

  // Set stroke with width
  graphics.stroke({ color, width });

  // Apply line style via dash pattern
  if (lineStyle === 'dashed') {
    graphics.setLineDash([8, 4]); // 8px dash, 4px gap
  } else if (lineStyle === 'dotted') {
    graphics.setLineDash([3, 3]); // 3px dot, 3px gap
  } else {
    graphics.setLineDash([]); // solid - no dash
  }

  // Draw the line
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);

  // Reset line dash
  graphics.setLineDash([]);
}

/**
 * Add this method to draw the middle support pillar for Level 2
 */
private drawMiddlePillar(): void {
  const pillarAnchor = this.level.anchors.find(a => a.isSupport);
  if (!pillarAnchor) return; // Level 1 has no pillar

  const metersToPixels = (m: number) => m * this.level.gridSpacing;

  const pillarX = metersToPixels(pillarAnchor.x);
  const topY = metersToPixels(2); // roadway level
  const bottomY = metersToPixels(4.5); // partway down (not all the way)
  const pillarWidth = metersToPixels(0.3); // 30cm wide

  const pillarGraphics = new PIXI.Graphics();
  pillarGraphics.fill({ color: 0x2c3e50 }); // dark gray (part of canyon)
  pillarGraphics.rect(pillarX - pillarWidth / 2, topY, pillarWidth, bottomY - topY);
  pillarGraphics.fill();

  // Add anchor circle at top
  const anchorCircle = new PIXI.Graphics();
  anchorCircle.fill({ color: 0xf39c12 }); // gold
  anchorCircle.circle(pillarX, topY, 8);
  anchorCircle.fill();

  this.canyonLayer.addChild(pillarGraphics);
  this.canyonLayer.addChild(anchorCircle);
}

/**
 * Update renderDesign() to use drawMemberLine and include middle pillar
 */
renderDesign(): void {
  // Clear previous bridge rendering
  this.bridgeLayer.removeChildren();
  this.canyonLayer.removeChildren();

  // Redraw canyon
  this.drawCanyon();

  // Draw middle pillar if Level 2
  this.drawMiddlePillar();

  const metersToPixels = (meters: number) => meters * this.level.gridSpacing;
  const nodeMap = new Map(this.design.nodes.map(n => [n.id, n]));

  // Draw members with material-specific line styles
  for (const member of this.design.members) {
    const fromNode = nodeMap.get(member.fromNodeId);
    const toNode = nodeMap.get(member.toNodeId);

    if (!fromNode || !toNode) continue;

    const x1 = metersToPixels(fromNode.x);
    const y1 = metersToPixels(fromNode.y);
    const x2 = metersToPixels(toNode.x);
    const y2 = metersToPixels(toNode.y);

    const graphics = new PIXI.Graphics();
    const material = this.level.materials[member.material];

    if (!material) continue;

    // Get stress color
    const stress = this.memberStress.get(member.id);
    const displayColor = this.getStressColor(material.color, stress);

    // Draw with appropriate line style
    this.drawMemberLine(graphics, x1, y1, x2, y2, material, displayColor);

    this.bridgeLayer.addChild(graphics);
    this.stressIndicators.set(member.id, graphics);
  }

  // Draw nodes
  for (const node of this.design.nodes) {
    const x = metersToPixels(node.x);
    const y = metersToPixels(node.y);

    const circle = new PIXI.Graphics();
    circle.fill({ color: node.isAnchor ? 0xf39c12 : 0x95a5a6 });
    circle.circle(x, y, 4);
    circle.fill();

    this.bridgeLayer.addChild(circle);
  }
}

/**
 * Update getStressColor to handle cable compression
 */
private getStressColor(baseColor: number, stress?: MemberStress): number {
  if (!stress) return baseColor;

  // Cable compression is immediate failure (bright red)
  if (stress.kind === 'cable_compressed') {
    return 0xff0000; // bright red
  }

  if (stress.isBroken) return 0xff0000; // red
  if (stress.utilization > 0.8) return 0xf39c12; // amber
  return baseColor; // green (default)
}
