import { Application, Container, Graphics } from "pixi.js";
import { BridgeAudio } from "./audio";
import {
  addMember,
  cloneDesign,
  createEmptyDesign,
  designCost,
  previewMember,
  removeMember,
  snapPoint,
  validateDesign,
} from "./model";
import {
  BridgeSimulation,
  PHYSICS_STEP,
  type RuntimeSegment,
  type SimulationSnapshot,
} from "./simulator";
import { transitionPhase } from "./state";
import { saveState } from "./storage";
import {
  type BridgeDesign,
  type BridgeMember,
  type GamePhase,
  type LevelDefinition,
  MEMBER_KINDS,
  type MemberKind,
  type Vec2Data,
} from "./types";

type Tool = MemberKind | "erase";

interface GameElements {
  canvasHost: HTMLElement;
  phase: HTMLElement;
  phaseDescription: HTMLElement;
  cost: HTMLElement;
  budgetRemaining: HTMLElement;
  budgetFill: HTMLElement;
  message: HTMLElement;
  timer: HTMLElement;
  toolButtons: NodeListOf<HTMLButtonElement>;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  clear: HTMLButtonElement;
  test: HTMLButtonElement;
  mute: HTMLButtonElement;
  resultDialog: HTMLDialogElement;
  resultEyebrow: HTMLElement;
  resultTitle: HTMLElement;
  resultMessage: HTMLElement;
  resultStats: HTMLElement;
  resultReset: HTMLButtonElement;
  resultClear: HTMLButtonElement;
}

interface DragState {
  start: Vec2Data;
  end: Vec2Data;
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function mixColor(a: number, b: number, amount: number): number {
  const clamped = Math.max(0, Math.min(1, amount));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * clamped) << 16) |
    (Math.round(ag + (bg - ag) * clamped) << 8) |
    Math.round(ab + (bb - ab) * clamped)
  );
}

function stressColor(utilization: number): number {
  if (utilization <= 0.6) {
    return mixColor(0x54d6c0, 0xf2c14e, utilization / 0.6);
  }
  return mixColor(0xf2c14e, 0xff5a67, (utilization - 0.6) / 0.4);
}

export class BridgeGame {
  private readonly elements: GameElements;
  private readonly pixi = new Application();
  private readonly worldLayer = new Container();
  private readonly background = new Graphics();
  private readonly members = new Graphics();
  private readonly effects = new Graphics();
  private readonly audio: BridgeAudio;
  private readonly resizeObserver: ResizeObserver;
  private design: BridgeDesign;
  private tool: Tool = "deck";
  private phase: GamePhase = "BUILD";
  private history: BridgeDesign[] = [];
  private future: BridgeDesign[] = [];
  private drag?: DragState;
  private hoverPoint?: Vec2Data;
  private simulation?: BridgeSimulation;
  private snapshot?: SimulationSnapshot;
  private accumulator = 0;
  private lastFrame = performance.now();
  private muted: boolean;
  private messageTimer?: number;
  private brokenFlashes: Array<{ start: Vec2Data; end: Vec2Data; age: number }> = [];

  constructor(
    private readonly level: LevelDefinition,
    design: BridgeDesign,
    muted: boolean,
    private readonly onSuccess: (cost: number) => void = () => undefined,
  ) {
    this.design = cloneDesign(design);
    this.muted = muted;
    this.audio = new BridgeAudio(muted);
    this.elements = {
      canvasHost: query("#canvas-host"),
      phase: query("[data-testid='phase']"),
      phaseDescription: query("#phase-description"),
      cost: query("[data-testid='cost']"),
      budgetRemaining: query("#budget-remaining"),
      budgetFill: query("#budget-fill"),
      message: query("#build-message"),
      timer: query("#timer"),
      toolButtons: document.querySelectorAll<HTMLButtonElement>("[data-tool]"),
      undo: query("[data-action='undo']"),
      redo: query("[data-action='redo']"),
      clear: query("[data-action='clear']"),
      test: query("[data-action='test']"),
      mute: query("[data-action='mute']"),
      resultDialog: query("#result-dialog"),
      resultEyebrow: query("#result-eyebrow"),
      resultTitle: query("#result-title"),
      resultMessage: query("#result-message"),
      resultStats: query("#result-stats"),
      resultReset: query("[data-action='result-reset']"),
      resultClear: query("[data-action='result-clear']"),
    };
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  async start(): Promise<void> {
    await this.pixi.init({
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    this.pixi.canvas.setAttribute("aria-label", "Bridge construction workspace");
    this.pixi.canvas.setAttribute("data-testid", "game-canvas");
    this.pixi.canvas.tabIndex = 0;
    this.elements.canvasHost.appendChild(this.pixi.canvas);
    this.pixi.stage.addChild(this.worldLayer);
    this.worldLayer.addChild(this.background, this.members, this.effects);
    this.resizeObserver.observe(this.elements.canvasHost);
    this.bindControls();
    this.resize();
    this.updateUi();
    requestAnimationFrame(this.frame);
  }

  private bindControls(): void {
    for (const button of this.elements.toolButtons) {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool as Tool;
        this.selectTool(tool);
      });
    }
    this.elements.undo.addEventListener("click", () => this.undo());
    this.elements.redo.addEventListener("click", () => this.redo());
    this.elements.clear.addEventListener("click", () => this.clear());
    this.elements.test.addEventListener("click", () => {
      if (this.phase === "TESTING") {
        this.stopTest();
      } else {
        this.startTest();
      }
    });
    this.elements.mute.addEventListener("click", () => this.toggleMute());
    this.elements.resultReset.addEventListener("click", () => this.resetToBuild());
    this.elements.resultClear.addEventListener("click", () => {
      this.resetToBuild();
      this.clear();
    });

    const canvas = this.pixi.canvas;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("pointerleave", () => {
      if (!this.drag) {
        this.hoverPoint = undefined;
      }
    });

    window.addEventListener("keydown", this.keyDown);
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLButtonElement) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.phase === "TESTING" ? this.stopTest() : this.startTest();
      return;
    }
    if (this.phase !== "BUILD") {
      return;
    }
    const materialIndex = Number(event.key) - 1;
    const material = MEMBER_KINDS[materialIndex];
    if (material) {
      this.selectTool(material);
    } else if (event.key.toLowerCase() === "e") {
      this.selectTool("erase");
    }
  };

  private pointerDown = (event: PointerEvent): void => {
    if (this.phase !== "BUILD") {
      return;
    }
    this.pixi.canvas.setPointerCapture(event.pointerId);
    const worldPoint = snapPoint(this.pointerWorld(event), this.level.gridSpacing);
    if (this.tool === "erase") {
      const member = this.hitMember(event);
      if (member) {
        this.commit(removeMember(this.design, member.id));
        this.audio.remove();
        this.showMessage("Member removed. Undo is available.");
      } else {
        this.showMessage("Point at a member to remove it.");
      }
      return;
    }
    this.drag = { start: worldPoint, end: worldPoint };
  };

  private pointerMove = (event: PointerEvent): void => {
    const worldPoint = snapPoint(this.pointerWorld(event), this.level.gridSpacing);
    this.hoverPoint = worldPoint;
    if (this.drag) {
      this.drag.end = worldPoint;
      const preview = previewMember(
        this.design,
        this.level,
        this.tool as MemberKind,
        this.drag.start,
        this.drag.end,
      );
      this.setMessage(
        `${preview.reason}${preview.length > 0 ? ` · ${preview.length.toFixed(1)} m · ${currency(preview.cost)}` : ""}`,
      );
    } else if (this.tool === "erase" && this.phase === "BUILD") {
      const member = this.hitMember(event);
      this.pixi.canvas.style.cursor = member ? "not-allowed" : "crosshair";
    }
  };

  private pointerUp = (event: PointerEvent): void => {
    if (!this.drag || this.tool === "erase" || this.phase !== "BUILD") {
      this.drag = undefined;
      return;
    }
    const result = addMember(
      this.design,
      this.level,
      this.tool,
      this.drag.start,
      this.pointerWorld(event),
    );
    this.drag = undefined;
    if (result.ok) {
      this.commit(result.design);
      this.audio.place();
      this.showMessage(
        `${this.level.materials[this.tool].label} placed. Crossings only connect at visible nodes.`,
      );
    } else {
      this.showMessage(result.reason);
    }
  };

  private pointerCancel = (): void => {
    this.drag = undefined;
  };

  private pointerWorld(event: PointerEvent): Vec2Data {
    const rect = this.pixi.canvas.getBoundingClientRect();
    return this.screenToWorld({
      x: ((event.clientX - rect.left) / rect.width) * this.pixi.screen.width,
      y: ((event.clientY - rect.top) / rect.height) * this.pixi.screen.height,
    });
  }

  private selectTool(tool: Tool): void {
    if (this.phase !== "BUILD") {
      return;
    }
    this.tool = tool;
    this.pixi.canvas.style.cursor = tool === "erase" ? "not-allowed" : "crosshair";
    this.updateUi();
    this.showMessage(
      tool === "erase"
        ? "Erase selected · click a member"
        : `${this.level.materials[tool].label} selected · maximum span ${this.level.materials[tool].maxLength} m`,
    );
  }

  private commit(nextDesign: BridgeDesign): void {
    this.history.push(cloneDesign(this.design));
    if (this.history.length > 100) {
      this.history.shift();
    }
    this.design = cloneDesign(nextDesign);
    this.future = [];
    this.persist();
    this.updateUi();
  }

  private undo(): void {
    if (this.phase !== "BUILD") {
      return;
    }
    const previous = this.history.pop();
    if (!previous) {
      return;
    }
    this.future.push(cloneDesign(this.design));
    this.design = previous;
    this.persist();
    this.updateUi();
    this.showMessage("Undid the last edit.");
  }

  private redo(): void {
    if (this.phase !== "BUILD") {
      return;
    }
    const next = this.future.pop();
    if (!next) {
      return;
    }
    this.history.push(cloneDesign(this.design));
    this.design = next;
    this.persist();
    this.updateUi();
    this.showMessage("Restored the edit.");
  }

  private clear(): void {
    if (this.phase !== "BUILD" || this.design.members.length === 0) {
      return;
    }
    this.commit(createEmptyDesign(this.level));
    this.showMessage("Blueprint cleared. Undo restores it.");
  }

  private startTest(): void {
    if (this.phase === "SUCCESS" || this.phase === "FAILURE") {
      this.resetToBuild();
    }
    if (this.phase !== "BUILD") {
      return;
    }
    const validation = validateDesign(this.design, this.level);
    if (!validation.valid) {
      this.showMessage(validation.issues[0] ?? "The bridge is not ready.");
      return;
    }
    this.phase = transitionPhase(this.phase, "START_TEST");
    this.simulation = new BridgeSimulation(this.design, this.level);
    this.snapshot = this.simulation.snapshot();
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.audio.test();
    this.updateUi();
    this.showMessage("Load test underway. Watch the stress trace.");
  }

  private stopTest(): void {
    if (this.phase !== "TESTING") {
      return;
    }
    this.simulation?.stop();
    this.resetToBuild();
    this.showMessage("Test stopped. The intact blueprint has been restored.");
  }

  private resetToBuild(): void {
    if (this.elements.resultDialog.open) {
      this.elements.resultDialog.close();
    }
    this.phase = transitionPhase(this.phase, "RESET");
    this.simulation = undefined;
    this.snapshot = undefined;
    this.brokenFlashes = [];
    this.updateUi();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.persist();
    this.updateUi();
  }

  private persist(): void {
    saveState(this.level, { version: 1, design: this.design, muted: this.muted });
  }

  private finishTest(): void {
    const result = this.snapshot?.result;
    if (!result || (this.phase !== "TESTING" && this.phase !== "BUILD")) {
      return;
    }
    this.phase = transitionPhase(this.phase, result.outcome === "success" ? "SUCCEED" : "FAIL");
    if (result.outcome === "success") {
      this.onSuccess(result.cost);
      this.audio.success();
      this.elements.resultEyebrow.textContent = "Load test passed";
      this.elements.resultTitle.textContent = "The span holds.";
      this.elements.resultMessage.textContent =
        result.brokenMemberCount === 0
          ? "The truck crossed cleanly with every member intact."
          : "The truck made it across, though the structure took damage.";
    } else {
      this.audio.failure();
      this.elements.resultEyebrow.textContent = "Load test failed";
      this.elements.resultTitle.textContent =
        result.failureReason === "fell"
          ? "Gravity had the last word."
          : result.failureReason === "stalled"
            ? "The truck lost momentum."
            : "The crossing timed out.";
      this.elements.resultMessage.textContent =
        "Return to the blueprint, reinforce the red members, and test again.";
    }
    this.elements.resultStats.textContent = `${result.elapsedTime.toFixed(1)} s · ${currency(result.cost)} · ${result.brokenMemberCount} broken`;
    this.updateUi();
    if (!this.elements.resultDialog.open) {
      this.elements.resultDialog.showModal();
    }
  }

  private updateUi(): void {
    const validation = validateDesign(this.design, this.level);
    const total = designCost(this.design);
    const remaining = Math.max(0, this.level.budget - total);
    const ratio = total / this.level.budget;
    this.elements.cost.textContent = currency(total);
    this.elements.budgetRemaining.textContent = `${currency(remaining)} remaining`;
    this.elements.budgetFill.style.width = `${Math.min(100, ratio * 100)}%`;
    this.elements.budgetFill.dataset.warning = ratio > 0.85 ? "true" : "false";
    this.elements.undo.disabled = this.phase !== "BUILD" || this.history.length === 0;
    this.elements.redo.disabled = this.phase !== "BUILD" || this.future.length === 0;
    this.elements.clear.disabled = this.phase !== "BUILD" || this.design.members.length === 0;
    this.elements.test.disabled = this.phase === "BUILD" && !validation.valid;
    this.elements.test.textContent = this.phase === "TESTING" ? "Stop test" : "Run load test";
    this.elements.test.dataset.mode = this.phase === "TESTING" ? "stop" : "test";
    this.elements.mute.setAttribute("aria-pressed", String(this.muted));
    this.elements.mute.textContent = this.muted ? "Sound off" : "Sound on";

    for (const button of this.elements.toolButtons) {
      const selected = button.dataset.tool === this.tool;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = this.phase !== "BUILD";
    }

    this.elements.phase.textContent =
      this.phase === "BUILD"
        ? "Build mode"
        : this.phase === "TESTING"
          ? "Live test"
          : this.phase === "SUCCESS"
            ? "Passed"
            : "Failed";
    this.elements.phase.dataset.phase = this.phase;
    this.elements.phaseDescription.textContent =
      this.phase === "BUILD"
        ? validation.hasRoadPath
          ? "Road connected. Add triangles, then run the load test."
          : "Connect the gold road anchors, then brace the span."
        : this.phase === "TESTING"
          ? "The structure is live. Red and dashed means critical stress."
          : "Review the result, then restore the intact blueprint.";
  }

  private setMessage(message: string): void {
    this.elements.message.textContent = message;
  }

  private showMessage(message: string): void {
    this.setMessage(message);
    if (this.messageTimer) {
      window.clearTimeout(this.messageTimer);
    }
    this.messageTimer = window.setTimeout(() => {
      if (this.phase === "BUILD") {
        const validation = validateDesign(this.design, this.level);
        this.setMessage(
          validation.valid
            ? "Bridge ready for a load test."
            : (validation.issues[0] ?? "Draw between grid points to build."),
        );
      }
    }, 3000);
  }

  private resize(): void {
    const width = Math.max(320, this.elements.canvasHost.clientWidth);
    const height = Math.max(420, this.elements.canvasHost.clientHeight);
    this.pixi.renderer.resize(width, height);
  }

  private transform(): { scale: number; offsetX: number; offsetY: number } {
    const bounds = this.level.viewBounds;
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    const scale = Math.min(
      this.pixi.screen.width / worldWidth,
      this.pixi.screen.height / worldHeight,
    );
    const contentWidth = worldWidth * scale;
    const contentHeight = worldHeight * scale;
    return {
      scale,
      offsetX: (this.pixi.screen.width - contentWidth) / 2 - bounds.minX * scale,
      offsetY: (this.pixi.screen.height - contentHeight) / 2 + bounds.maxY * scale,
    };
  }

  private worldToScreen(point: Vec2Data): Vec2Data {
    const transform = this.transform();
    return {
      x: transform.offsetX + point.x * transform.scale,
      y: transform.offsetY - point.y * transform.scale,
    };
  }

  private screenToWorld(point: Vec2Data): Vec2Data {
    const transform = this.transform();
    return {
      x: (point.x - transform.offsetX) / transform.scale,
      y: (transform.offsetY - point.y) / transform.scale,
    };
  }

  private hitMember(event: PointerEvent): BridgeMember | undefined {
    const pointer = this.pointerWorld(event);
    const threshold = 0.2;
    const nodeById = new Map(this.design.nodes.map((node) => [node.id, node]));
    let closest: { member: BridgeMember; distance: number } | undefined;
    for (const member of this.design.members) {
      const start = nodeById.get(member.startNodeId);
      const end = nodeById.get(member.endNodeId);
      if (!start || !end) {
        continue;
      }
      const distanceToSegment = this.pointSegmentDistance(pointer, start, end);
      if (distanceToSegment <= threshold && (!closest || distanceToSegment < closest.distance)) {
        closest = { member, distance: distanceToSegment };
      }
    }
    return closest?.member;
  }

  private pointSegmentDistance(point: Vec2Data, start: Vec2Data, end: Vec2Data): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    const t = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
    );
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
  }

  private frame = (time: number): void => {
    const delta = Math.min(0.1, (time - this.lastFrame) / 1000);
    this.lastFrame = time;

    if (this.phase === "TESTING" && this.simulation) {
      this.accumulator += delta;
      while (this.accumulator >= PHYSICS_STEP) {
        this.snapshot = this.simulation.step();
        this.accumulator -= PHYSICS_STEP;
        if (this.snapshot.brokenMemberIds.length > 0) {
          this.audio.break();
          for (const id of this.snapshot.brokenMemberIds) {
            const member = this.snapshot.members.find((item) => item.id === id);
            if (member) {
              this.brokenFlashes.push({ start: member.start, end: member.end, age: 0 });
            }
          }
        }
        if (this.snapshot.result) {
          break;
        }
      }
      this.elements.timer.textContent = `${this.snapshot?.elapsedTime.toFixed(1) ?? "0.0"} s`;
      if (this.snapshot?.result) {
        this.finishTest();
      }
    } else {
      this.elements.timer.textContent = "0.0 s";
    }

    for (const flash of this.brokenFlashes) {
      flash.age += delta;
    }
    this.brokenFlashes = this.brokenFlashes.filter((flash) => flash.age < 0.7);
    this.render(time / 1000);
    requestAnimationFrame(this.frame);
  };

  private render(time: number): void {
    this.drawBackground();
    this.members.clear();
    this.effects.clear();

    if (this.snapshot && this.phase !== "BUILD") {
      this.drawRuntime(this.snapshot.members, time);
      this.drawNodes(this.snapshot.nodes);
      this.drawTruck(this.snapshot);
    } else {
      this.drawDesign();
      this.drawBuildPreview(time);
      this.drawParkedTruck();
    }
    this.drawEffects();
  }

  private drawBackground(): void {
    const graphics = this.background;
    graphics.clear();
    const { scale } = this.transform();
    const topLeft = this.worldToScreen({
      x: this.level.viewBounds.minX,
      y: this.level.viewBounds.maxY,
    });
    const bottomRight = this.worldToScreen({
      x: this.level.viewBounds.maxX,
      y: this.level.viewBounds.minY,
    });
    graphics.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    graphics.fill({ color: 0x07131f });

    for (
      let x = this.level.buildBounds.minX;
      x <= this.level.buildBounds.maxX;
      x += this.level.gridSpacing
    ) {
      const start = this.worldToScreen({ x, y: this.level.buildBounds.minY });
      const end = this.worldToScreen({ x, y: this.level.buildBounds.maxY });
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y);
    }
    for (
      let y = this.level.buildBounds.minY;
      y <= this.level.buildBounds.maxY;
      y += this.level.gridSpacing
    ) {
      const start = this.worldToScreen({ x: this.level.buildBounds.minX, y });
      const end = this.worldToScreen({ x: this.level.buildBounds.maxX, y });
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y);
    }
    graphics.stroke({ color: 0x315269, width: 1, alpha: 0.32 });

    const horizonLeft = this.worldToScreen({ x: this.level.viewBounds.minX, y: 0 });
    const cliffLeft = this.worldToScreen({ x: 0, y: 0 });
    const cliffBottomLeft = this.worldToScreen({ x: 0, y: this.level.viewBounds.minY });
    const bottomLeft = this.worldToScreen({
      x: this.level.viewBounds.minX,
      y: this.level.viewBounds.minY,
    });
    graphics
      .moveTo(horizonLeft.x, horizonLeft.y)
      .lineTo(cliffLeft.x, cliffLeft.y)
      .lineTo(cliffBottomLeft.x, cliffBottomLeft.y)
      .lineTo(bottomLeft.x, bottomLeft.y)
      .closePath()
      .fill({ color: 0x122a39 });
    const horizonRight = this.worldToScreen({ x: this.level.viewBounds.maxX, y: 0 });
    const cliffRight = this.worldToScreen({ x: this.level.canyonWidth, y: 0 });
    const cliffBottomRight = this.worldToScreen({
      x: this.level.canyonWidth,
      y: this.level.viewBounds.minY,
    });
    const bottomRightCliff = this.worldToScreen({
      x: this.level.viewBounds.maxX,
      y: this.level.viewBounds.minY,
    });
    graphics
      .moveTo(cliffRight.x, cliffRight.y)
      .lineTo(horizonRight.x, horizonRight.y)
      .lineTo(bottomRightCliff.x, bottomRightCliff.y)
      .lineTo(cliffBottomRight.x, cliffBottomRight.y)
      .closePath()
      .fill({ color: 0x122a39 });

    const roadLeftStart = this.worldToScreen({ x: this.level.viewBounds.minX, y: 0.04 });
    const roadLeftEnd = this.worldToScreen({ x: 0, y: 0.04 });
    const roadRightStart = this.worldToScreen({ x: this.level.canyonWidth, y: 0.04 });
    const roadRightEnd = this.worldToScreen({ x: this.level.viewBounds.maxX, y: 0.04 });
    graphics.moveTo(roadLeftStart.x, roadLeftStart.y).lineTo(roadLeftEnd.x, roadLeftEnd.y);
    graphics.moveTo(roadRightStart.x, roadRightStart.y).lineTo(roadRightEnd.x, roadRightEnd.y);
    graphics.stroke({ color: 0xf2b84b, width: Math.max(3, scale * 0.08), alpha: 0.85 });

    for (let y = -0.8; y >= this.level.viewBounds.minY; y -= 0.65) {
      const leftStart = this.worldToScreen({ x: this.level.viewBounds.minX, y });
      const leftEnd = this.worldToScreen({ x: 0, y: y - 0.65 });
      const rightStart = this.worldToScreen({ x: this.level.canyonWidth, y: y - 0.65 });
      const rightEnd = this.worldToScreen({ x: this.level.viewBounds.maxX, y });
      graphics.moveTo(leftStart.x, leftStart.y).lineTo(leftEnd.x, leftEnd.y);
      graphics.moveTo(rightStart.x, rightStart.y).lineTo(rightEnd.x, rightEnd.y);
    }
    graphics.stroke({ color: 0x29485a, width: 1, alpha: 0.45 });

    for (const anchor of this.level.anchors) {
      const point = this.worldToScreen(anchor);
      const radius = anchor.kind === "road" ? 9 : 7;
      graphics.circle(point.x, point.y, radius + 4).fill({ color: 0x07131f, alpha: 0.9 });
      graphics.circle(point.x, point.y, radius).fill({
        color: anchor.kind === "road" ? 0xf2b84b : 0x69c6d9,
      });
      graphics.circle(point.x, point.y, radius * 0.38).fill({ color: 0x07131f });
    }
  }

  private drawDesign(): void {
    const nodeById = new Map(this.design.nodes.map((node) => [node.id, node]));
    for (const kind of MEMBER_KINDS) {
      for (const member of this.design.members.filter((item) => item.kind === kind)) {
        const start = nodeById.get(member.startNodeId);
        const end = nodeById.get(member.endNodeId);
        if (start && end) {
          this.drawMember(start, end, kind, this.level.materials[kind].color, 0, false);
        }
      }
    }
    this.drawNodes(
      this.design.nodes.map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        anchored: Boolean(node.anchorId),
      })),
    );
  }

  private drawRuntime(runtimeMembers: RuntimeSegment[], time: number): void {
    for (const kind of MEMBER_KINDS) {
      for (const member of runtimeMembers.filter((item) => item.kind === kind)) {
        const utilization = member.stress.smoothedUtilization;
        const color = member.stress.broken ? 0x6d4250 : stressColor(utilization);
        this.drawMember(
          member.start,
          member.end,
          kind,
          color,
          utilization,
          member.stress.broken,
          time,
        );
      }
    }
  }

  private drawMember(
    startWorld: Vec2Data,
    endWorld: Vec2Data,
    kind: MemberKind,
    color: number,
    utilization: number,
    broken: boolean,
    time = 0,
  ): void {
    const start = this.worldToScreen(startWorld);
    const end = this.worldToScreen(endWorld);
    const { scale } = this.transform();
    const widths: Record<MemberKind, number> = {
      deck: 0.16,
      steel: 0.09,
      concrete: 0.2,
      wood: 0.13,
      aluminum: 0.075,
      cable: 0.045,
    };
    const baseWidth = Math.max(kind === "cable" ? 2 : 4, scale * widths[kind]);
    const width = baseWidth * (utilization > 0.9 ? 1 + Math.sin(time * 14) * 0.11 : 1);

    if (kind === "deck" || kind === "concrete" || kind === "wood") {
      this.members.moveTo(start.x, start.y).lineTo(end.x, end.y);
      this.members.stroke({ color: 0x081018, width: width + 5, alpha: broken ? 0.45 : 0.85 });
    }
    if (utilization > 0.9 && !broken) {
      this.drawDashedLine(start, end, color, width);
      this.drawStressTicks(start, end, color);
    } else {
      this.members.moveTo(start.x, start.y).lineTo(end.x, end.y);
      this.members.stroke({ color, width, alpha: broken ? 0.35 : 1 });
    }
    if ((kind === "steel" || kind === "aluminum") && !broken) {
      this.members.moveTo(start.x, start.y).lineTo(end.x, end.y);
      this.members.stroke({ color: 0xc7f4ef, width: 1, alpha: 0.34 });
    }
  }

  private drawDashedLine(start: Vec2Data, end: Vec2Data, color: number, width: number): void {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const dash = 10;
    const gap = 6;
    for (let distance = 0; distance < length; distance += dash + gap) {
      const from = distance / length;
      const to = Math.min(1, (distance + dash) / length);
      this.members
        .moveTo(start.x + (end.x - start.x) * from, start.y + (end.y - start.y) * from)
        .lineTo(start.x + (end.x - start.x) * to, start.y + (end.y - start.y) * to);
    }
    this.members.stroke({ color, width });
  }

  private drawStressTicks(start: Vec2Data, end: Vec2Data, color: number): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    for (const amount of [0.35, 0.65]) {
      const center = { x: start.x + dx * amount, y: start.y + dy * amount };
      this.members
        .moveTo(center.x - normal.x * 6, center.y - normal.y * 6)
        .lineTo(center.x + normal.x * 6, center.y + normal.y * 6);
    }
    this.members.stroke({ color: mixColor(color, 0xffffff, 0.45), width: 2 });
  }

  private drawNodes(nodes: Array<Vec2Data & { id: string; anchored: boolean }>): void {
    for (const node of nodes) {
      if (node.anchored) {
        continue;
      }
      const point = this.worldToScreen(node);
      this.members.circle(point.x, point.y, 4.5).fill({ color: 0xd7f1f3 });
      this.members.circle(point.x, point.y, 2).fill({ color: 0x0c2230 });
    }
  }

  private drawBuildPreview(time: number): void {
    if (this.drag && this.tool !== "erase") {
      const preview = previewMember(
        this.design,
        this.level,
        this.tool,
        this.drag.start,
        this.drag.end,
      );
      this.drawMember(
        preview.start,
        preview.end,
        this.tool,
        preview.valid ? 0x83f0db : 0xff5a67,
        preview.valid ? 0 : 1.1,
        false,
        time,
      );
    }
    if (this.hoverPoint) {
      const point = this.worldToScreen(this.hoverPoint);
      this.effects.circle(point.x, point.y, 7 + Math.sin(time * 5) * 1.5);
      this.effects.stroke({ color: 0xa9dce6, width: 1.5, alpha: 0.7 });
    }
  }

  private drawTruck(snapshot: SimulationSnapshot): void {
    const chassis = snapshot.truck.chassis;
    this.drawTruckBody(chassis.x, chassis.y, chassis.angle);
    for (const wheel of snapshot.truck.wheels) {
      this.drawWheel(wheel.x, wheel.y, wheel.angle, wheel.radius);
    }
  }

  private drawParkedTruck(): void {
    const { start, wheelOffsetX, wheelOffsetY, wheelRadius } = this.level.truck;
    this.drawTruckBody(start.x, start.y, 0);
    this.drawWheel(start.x - wheelOffsetX, start.y + wheelOffsetY, 0, wheelRadius);
    this.drawWheel(start.x + wheelOffsetX, start.y + wheelOffsetY, 0, wheelRadius);
  }

  private drawTruckBody(x: number, y: number, angle: number): void {
    const width = this.level.truck.chassisHalfWidth;
    const height = this.level.truck.chassisHalfHeight;
    const corners = [
      { x: -width, y: -height },
      { x: width, y: -height },
      { x: width * 0.93, y: height },
      { x: width * 0.27, y: height },
      { x: width * 0.03, y: height + 0.24 },
      { x: -width * 0.66, y: height + 0.24 },
      { x: -width * 0.93, y: height },
    ].map((point) => {
      const rotated = {
        x: x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
        y: y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
      };
      return this.worldToScreen(rotated);
    });
    this.members.moveTo(corners[0]?.x ?? 0, corners[0]?.y ?? 0);
    for (const corner of corners.slice(1)) {
      this.members.lineTo(corner.x, corner.y);
    }
    this.members.closePath().fill({ color: 0xe9684b });
    this.members.stroke({ color: 0xffc58f, width: 2 });
    if (corners[4] && corners[5]) {
      this.members.moveTo(corners[4].x, corners[4].y).lineTo(corners[5].x, corners[5].y);
      this.members.stroke({ color: 0x8fd2dc, width: 5 });
    }
  }

  private drawWheel(x: number, y: number, angle: number, radius: number): void {
    const center = this.worldToScreen({ x, y });
    const edge = this.worldToScreen({ x: x + radius, y });
    const screenRadius = Math.abs(edge.x - center.x);
    this.members.circle(center.x, center.y, screenRadius).fill({ color: 0x0a1017 });
    this.members.circle(center.x, center.y, screenRadius * 0.48).fill({ color: 0x778995 });
    const spoke = {
      x: center.x + Math.cos(angle) * screenRadius * 0.78,
      y: center.y - Math.sin(angle) * screenRadius * 0.78,
    };
    this.members.moveTo(center.x, center.y).lineTo(spoke.x, spoke.y);
    this.members.stroke({ color: 0xc4d3d9, width: 2 });
  }

  private drawEffects(): void {
    for (const flash of this.brokenFlashes) {
      const start = this.worldToScreen(flash.start);
      const end = this.worldToScreen(flash.end);
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const progress = flash.age / 0.7;
      this.effects.circle(center.x, center.y, 12 + progress * 42);
      this.effects.stroke({ color: 0xff655f, width: 4 - progress * 3, alpha: 1 - progress });
      for (let index = 0; index < 6; index += 1) {
        const angle = index * (Math.PI / 3) + 0.2;
        const inner = 8 + progress * 15;
        const outer = 15 + progress * 35;
        this.effects
          .moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner)
          .lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer);
      }
      this.effects.stroke({ color: 0xffb267, width: 2, alpha: 1 - progress });
    }
  }
}

export function getInitialMessage(design: BridgeDesign, level: LevelDefinition): string {
  const validation = validateDesign(design, level);
  return validation.valid
    ? "Bridge ready for a load test."
    : (validation.issues[0] ?? "Draw between grid points to build.");
}

export { currency, hexColor };
