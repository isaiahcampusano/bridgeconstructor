import type {
  BridgeDesign,
  BridgeNode,
  BridgeMember,
  LevelDefinition,
  TestResult,
  MemberStress,
} from '../types';
import { DEFAULT_LEVEL } from '../config/level';
import { GameStateManager } from './gameState';
import { UndoRedoManager } from './undoRedo';
import { validateDesign, validateMember, canPlaceMember } from './validator';
import { findNearestNode, snapToGrid, distance, calculateTotalCost, doMembersCross } from '../utils/geometry';
import { saveGameState, loadGameState, createEmptyDesign, saveMutePreference } from '../utils/storage';
import { getSoundManager } from '../utils/sound';
import { PhysicsSimulator } from '../physics/simulator';
import { Renderer } from '../render/renderer';
import { InputHandler, type InputEvent } from '../input/inputHandler';

/**
 * Main game controller
 */
export class GameController {
  private level: LevelDefinition;
  private gameState: GameStateManager;
  private undoRedo: UndoRedoManager;
  private renderer: Renderer;
  private inputHandler: InputHandler;
  private soundManager = getSoundManager();
  private physicsSimulator: PhysicsSimulator | null = null;
  private animationFrameId: number | null = null;
  private previewMember: BridgeMember | null = null;
  private lastTruckX: number = this.level.leftAnchorX + 0.5;
  private stallTimer: number = 0;

  constructor(canvas: HTMLCanvasElement, level: LevelDefinition = DEFAULT_LEVEL) {
    this.level = level;

    // Initialize game state
    const savedState = loadGameState();
    const initialDesign = savedState?.design || createEmptyDesign();
    const initialMuted = savedState?.muted || false;

    this.gameState = new GameStateManager(initialDesign);
    this.undoRedo = new UndoRedoManager(initialDesign);

    // Initialize renderer
    this.renderer = new Renderer(canvas, this.level, this.gameState.getDesign());

    // Initialize input
    this.inputHandler = new InputHandler(canvas, this.level);
    this.inputHandler.on(e => this.handleInput(e));

    // Set initial sound state
    this.soundManager.setMuted(initialMuted);

    // Start rendering loop
    this.startRenderLoop();
  }

  private startRenderLoop(): void {
    const update = () => {
      if (this.gameState.getState() === 'TESTING' && this.physicsSimulator) {
        this.stepPhysics();
      }

      this.renderer.renderDesign();
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private stepPhysics(): void {
    if (!this.physicsSimulator) return;

    this.physicsSimulator.step();

    // Update stress visualization
    const stresses = new Map(this.physicsSimulator.getAllStresses().map(s => [s.memberId, s]));
    this.renderer.updateStress(stresses);

    const truckPos = this.physicsSimulator.getTruckPosition();
    if (truckPos) {
      this.renderer.renderTruck(truckPos.x, truckPos.y, truckPos.angle);
    }

    const elapsedTime = this.physicsSimulator.getElapsedTime();
    const status = this.physicsSimulator.getTruckStatus();

    // Check for failure conditions
    if (status.hasFallen) {
      this.endTest({
        outcome: 'failure_unsupported',
        elapsedTime,
        cost: calculateTotalCost(this.gameState.getDesign()),
        brokenMemberCount: this.physicsSimulator.getBrokenMemberCount(),
        failureReason: 'Truck fell off bridge',
      });
      return;
    }

    if (elapsedTime > this.level.testTimeLimit) {
      this.endTest({
        outcome: 'failure_timeout',
        elapsedTime,
        cost: calculateTotalCost(this.gameState.getDesign()),
        brokenMemberCount: this.physicsSimulator.getBrokenMemberCount(),
        failureReason: 'Test time limit exceeded',
      });
      return;
    }

    // Check for stalling
    if (truckPos) {
      if (Math.abs(truckPos.vx) < 0.1 && Math.abs(truckPos.vy) < 0.1) {
        this.stallTimer += 1 / 120;
        if (this.stallTimer > this.level.stallTimeLimit) {
          this.endTest({
            outcome: 'failure_stalled',
            elapsedTime,
            cost: calculateTotalCost(this.gameState.getDesign()),
            brokenMemberCount: this.physicsSimulator.getBrokenMemberCount(),
            failureReason: 'Truck stalled',
          });
          return;
        }
      } else {
        this.stallTimer = 0;
        this.lastTruckX = truckPos.x;
      }
    }

    // Check for success
    if (this.physicsSimulator.hasReachedGoal()) {
      this.endTest({
        outcome: 'success',
        elapsedTime,
        cost: calculateTotalCost(this.gameState.getDesign()),
        brokenMemberCount: this.physicsSimulator.getBrokenMemberCount(),
        truckDistance: truckPos?.x || 0,
      });
      return;
    }
  }

  private endTest(result: TestResult): void {
    if (!this.physicsSimulator) return;

    this.physicsSimulator = null;

    if (result.outcome === 'success') {
      this.soundManager.playSuccess();
      this.gameState.toSuccess(result);
    } else {
      this.soundManager.playFailure();
      this.gameState.toFailure(result);
    }
  }

  private handleInput(event: InputEvent): void {
    const state = this.gameState.getState();
    switch (state) {
      case 'BUILD':
        this.handleBuildInput(event);
        break;
      case 'TESTING':
        if (event.type === 'stop') {
          this.stopTest();
        }
        break;
      case 'SUCCESS':
      case 'FAILURE':
        if (event.type === 'reset') {
          this.resetDesign();
        }
        break;
    }
  }

  private handleBuildInput(event: InputEvent): void {
    if (event.type === 'tool_changed') {
      this.soundManager.playClick();
    } else if (event.type === 'start_draw') {
      this.startDrawing(event);
    } else if (event.type === 'draw_preview') {
      this.updatePreview(event);
    } else if (event.type === 'finish_draw') {
      this.finishDrawing(event);
    } else if (event.type === 'erase') {
      this.eraseMember(event);
    } else if (event.type === 'undo') {
      this.undo();
    } else if (event.type === 'redo') {
      this.redo();
    } else if (event.type === 'test') {
      this.startTest();
    } else if (event.type === 'clear') {
      this.clearDesign();
    } else if (event.type === 'toggle_mute') {
      this.toggleMute();
    }
  }

  private startDrawing(event: InputEvent): void {
    if (!event.position) return;

    const design = this.gameState.getDesign();
    const nodeMap = new Map(design.nodes.map(n => [n.id, n]));
    const nearestNode = findNearestNode(event.position.x, event.position.y, design.nodes, this.level.gridSpacing);

    if (!nearestNode) return;

    this.previewMember = {
      id: `preview-${Date.now()}`,
      kind: this.inputHandler.getCurrentTool(),
      fromNodeId: nearestNode.id,
      toNodeId: nearestNode.id,
      length: 0,
      cost: 0,
    };
  }

  private updatePreview(event: InputEvent): void {
    if (!event.position || !this.previewMember) return;

    const design = this.gameState.getDesign();
    const fromNode = design.nodes.find(n => n.id === this.previewMember!.fromNodeId);

    if (!fromNode) return;

    const snappedX = snapToGrid(event.position.x, this.level.materials[this.previewMember.kind].density);
    const snappedY = snapToGrid(event.position.y, this.level.materials[this.previewMember.kind].density);

    const dx = snappedX - fromNode.x;
    const dy = snappedY - fromNode.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    this.previewMember.length = length;
    this.previewMember.cost = Math.ceil(length * this.level.materials[this.previewMember.kind].costPerMeter);
  }

  private finishDrawing(event: InputEvent): void {
    if (!event.position || !this.previewMember) return;

    const design = this.gameState.getDesign();
    const nearestNode = findNearestNode(event.position.x, event.position.y, design.nodes, this.level.gridSpacing);

    if (!nearestNode || nearestNode.id === this.previewMember.fromNodeId) {
      this.previewMember = null;
      return;
    }

    // Try to place member
    const nodeMap = new Map(design.nodes.map(n => [n.id, n]));
    if (!canPlaceMember(this.previewMember.fromNodeId, nearestNode.id, this.previewMember.kind, this.level, design, nodeMap)) {
      this.soundManager.playFailure();
      this.previewMember = null;
      return;
    }

    // Add member to design
    const newMember: BridgeMember = {
      ...this.previewMember,
      id: `member-${Date.now()}`,
      toNodeId: nearestNode.id,
    };

    const updatedDesign: BridgeDesign = {
      ...design,
      members: [...design.members, newMember],
      totalCost: calculateTotalCost({
        ...design,
        members: [...design.members, newMember],
      }),
    };

    this.gameState.setDesign(updatedDesign);
    this.undoRedo.push(updatedDesign);
    this.soundManager.playBeep(600, 0.1);
    this.previewMember = null;
  }

  private eraseMember(event: InputEvent): void {
    if (!event.position) return;

    const design = this.gameState.getDesign();
    // Find member near click position and remove it
    // This is a simplified version - in production you'd check proximity to member lines

    this.previewMember = null;
  }

  private startTest(): void {
    const design = this.gameState.getDesign();
    const validation = validateDesign(design, this.level);

    if (!validation.isValid) {
      this.soundManager.playFailure();
      return;
    }

    this.soundManager.playBeep(800, 0.2);
    this.gameState.toTesting();

    // Create physics simulator
    this.physicsSimulator = new PhysicsSimulator(this.level, design);
    this.physicsSimulator.initialize();
    this.stallTimer = 0;
  }

  private stopTest(): void {
    this.physicsSimulator = null;
    this.gameState.toBuild();
    this.soundManager.playClick();
  }

  private resetDesign(): void {
    this.gameState.toBuild();
    this.undoRedo.reset(this.gameState.getDesign());
    this.soundManager.playClick();
  }

  private clearDesign(): void {
    const emptyDesign = createEmptyDesign();
    this.gameState.setDesign(emptyDesign);
    this.undoRedo.reset(emptyDesign);
    this.soundManager.playClick();
  }

  private undo(): void {
    const previousDesign = this.undoRedo.undo();
    if (previousDesign) {
      this.gameState.setDesign(previousDesign);
      this.soundManager.playClick();
    }
  }

  private redo(): void {
    const nextDesign = this.undoRedo.redo();
    if (nextDesign) {
      this.gameState.setDesign(nextDesign);
      this.soundManager.playClick();
    }
  }

  private toggleMute(): void {
    const currentMuted = this.soundManager.isMuted_();
    this.soundManager.setMuted(!currentMuted);
    saveMutePreference(!currentMuted);
  }

  /**
   * Destroy game
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.inputHandler.destroy();
  }
}
