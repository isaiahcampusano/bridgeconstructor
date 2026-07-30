import * as PIXI from 'pixi.js';
import type { BridgeDesign, LevelDefinition, MemberStress } from '../types';

/**
 * Main renderer for bridge constructor using PixiJS
 */
export class Renderer {
  private app: PIXI.Application;
  private level: LevelDefinition;
  private design: BridgeDesign;
  private container: PIXI.Container;
  private gridLayer: PIXI.Container;
  private canyonLayer: PIXI.Container;
  private bridgeLayer: PIXI.Container;
  private stressIndicators: Map<string, PIXI.Graphics> = new Map();
  private memberStress: Map<string, MemberStress> = new Map();

  constructor(
    canvas: HTMLCanvasElement,
    level: LevelDefinition,
    design: BridgeDesign
  ) {
    this.level = level;
    this.design = design;

    // Create PIXI application
    this.app = new PIXI.Application({
      canvas,
      width: level.canvasWidth,
      height: level.canvasHeight,
      backgroundColor: 0x1a1a1a, // Dark background
      antialias: true,
    });

    // Main container
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    // Layer structure
    this.gridLayer = new PIXI.Container();
    this.canyonLayer = new PIXI.Container();
    this.bridgeLayer = new PIXI.Container();

    this.container.addChild(this.gridLayer);
    this.container.addChild(this.canyonLayer);
    this.container.addChild(this.bridgeLayer);

    this.drawGrid();
    this.drawCanyon();
  }

  private drawGrid(): void {
    const gridGraphics = new PIXI.Graphics();
    gridGraphics.stroke({ color: 0x444444, width: 1 });

    const gridSize = this.level.gridSpacing;
    const canvasWidth = this.level.canvasWidth;
    const canvasHeight = this.level.canvasHeight;

    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += gridSize) {
      gridGraphics.moveTo(x, 0);
      gridGraphics.lineTo(x, canvasHeight);
    }

    // Horizontal lines
    for (let y = 0; y <= canvasHeight; y += gridSize) {
      gridGraphics.moveTo(0, y);
      gridGraphics.lineTo(canvasWidth, y);
    }

    this.gridLayer.addChild(gridGraphics);
  }

  private drawCanyon(): void {
    const metersToPixels = (meters: number) => meters * this.level.gridSpacing;

    // Left cliff
    const leftCliff = new PIXI.Graphics();
    leftCliff.fill({ color: 0x2c3e50 });
    leftCliff.rect(0, metersToPixels(this.level.topY), metersToPixels(this.level.leftAnchorX), metersToPixels(this.level.bottomY - this.level.topY));
    leftCliff.fill();
    this.canyonLayer.addChild(leftCliff);

    // Right cliff
    const rightCliff = new PIXI.Graphics();
    rightCliff.fill({ color: 0x2c3e50 });
    rightCliff.rect(
      metersToPixels(this.level.rightAnchorX),
      metersToPixels(this.level.topY),
      metersToPixels(this.level.canvasWidthMeters - this.level.rightAnchorX),
      metersToPixels(this.level.bottomY - this.level.topY)
    );
    rightCliff.fill();
    this.canyonLayer.addChild(rightCliff);

    // Anchor points markers
    const leftAnchor = new PIXI.Graphics();
    leftAnchor.fill({ color: 0xf39c12 });
    const leftAnchorX = metersToPixels(this.level.leftAnchorX);
    const leftAnchorY = metersToPixels(this.level.topY);
    leftAnchor.circle(leftAnchorX, leftAnchorY, 8);
    leftAnchor.fill();
    this.canyonLayer.addChild(leftAnchor);

    const rightAnchor = new PIXI.Graphics();
    rightAnchor.fill({ color: 0xf39c12 });
    const rightAnchorX = metersToPixels(this.level.rightAnchorX);
    const rightAnchorY = metersToPixels(this.level.topY);
    rightAnchor.circle(rightAnchorX, rightAnchorY, 8);
    rightAnchor.fill();
    this.canyonLayer.addChild(rightAnchor);
  }

  /**
   * Render the current bridge design
   */
  renderDesign(): void {
    // Clear previous bridge rendering
    this.bridgeLayer.removeChildren();
    this.stressIndicators.clear();

    const metersToPixels = (meters: number) => meters * this.level.gridSpacing;
    const nodeMap = new Map(this.design.nodes.map(n => [n.id, n]));

    // Draw members
    for (const member of this.design.members) {
      const fromNode = nodeMap.get(member.fromNodeId);
      const toNode = nodeMap.get(member.toNodeId);

      if (!fromNode || !toNode) continue;

      const x1 = metersToPixels(fromNode.x);
      const y1 = metersToPixels(fromNode.y);
      const x2 = metersToPixels(toNode.x);
      const y2 = metersToPixels(toNode.y);

      const graphics = new PIXI.Graphics();
      const color = this.level.materials[member.kind].color;

      // Get stress for this member
      const stress = this.memberStress.get(member.id);
      const displayColor = this.getStressColor(color, stress);

      graphics.stroke({ color: displayColor, width: member.kind === 'deck' ? 4 : 2 });
      graphics.moveTo(x1, y1);
      graphics.lineTo(x2, y2);

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

  private getStressColor(baseColor: number, stress?: MemberStress): number {
    if (!stress) return baseColor;
    if (stress.isBroken) return 0xff0000; // Red for broken
    if (stress.utilization > 0.8) return 0xf39c12; // Amber
    return baseColor; // Green (default)
  }

  /**
   * Update stress visualization
   */
  updateStress(stresses: Map<string, MemberStress>): void {
    this.memberStress = stresses;
    this.renderDesign(); // Re-render with new stress colors
  }

  /**
   * Render truck
   */
  renderTruck(x: number, y: number, angle: number): void {
    // This would be called from the physics update
    // For now, this is a placeholder for truck rendering
  }

  /**
   * Get PIXI app for additional rendering
   */
  getApp(): PIXI.Application {
    return this.app;
  }

  /**
   * Resize canvas
   */
  resize(width: number, height: number): void {
    this.app.canvas.width = width;
    this.app.canvas.height = height;
    this.app.renderer.resize(width, height);
  }

  /**
   * Clear all
   */
  clear(): void {
    this.bridgeLayer.removeChildren();
    this.stressIndicators.clear();
  }
}
