import type { BridgeNode, LevelDefinition } from '../types';

export type MemberKind = 'deck' | 'steel';

type InputListener = (event: InputEvent) => void;

export interface InputEvent {
  type:
    | 'start_draw'
    | 'draw_preview'
    | 'finish_draw'
    | 'erase'
    | 'undo'
    | 'redo'
    | 'test'
    | 'stop'
    | 'clear'
    | 'reset'
    | 'toggle_mute'
    | 'tool_changed';
  tool?: MemberKind;
  startNode?: BridgeNode;
  endNode?: BridgeNode;
  x?: number;
  y?: number;
  position?: { x: number; y: number };
}

/**
 * Input handler for mouse, keyboard, and touch
 */
export class InputHandler {
  private canvas: HTMLCanvasElement;
  private level: LevelDefinition;
  private currentTool: MemberKind = 'deck';
  private isDrawing: boolean = false;
  private listeners: InputListener[] = [];
  private pixelsToMeters: number;

  constructor(canvas: HTMLCanvasElement, level: LevelDefinition) {
    this.canvas = canvas;
    this.level = level;
    this.pixelsToMeters = 1 / level.gridSpacing;

    this.setupMouseListeners();
    this.setupKeyboardListeners();
  }

  private setupMouseListeners(): void {
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', e => this.onMouseUp(e));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', e => this.onKeyDown(e));
  }

  private getCanvasCoordinates(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Scale to logical coordinates
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: canvasX * scaleX * this.pixelsToMeters,
      y: canvasY * scaleY * this.pixelsToMeters,
    };
  }

  private onMouseDown(event: MouseEvent): void {
    const coords = this.getCanvasCoordinates(event);

    if (event.button === 0) {
      // Left click - start drawing
      this.isDrawing = true;
      this.emit({
        type: 'start_draw',
        tool: this.currentTool,
        position: coords,
      });
    } else if (event.button === 2) {
      // Right click - erase
      this.emit({
        type: 'erase',
        position: coords,
      });
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isDrawing) return;

    const coords = this.getCanvasCoordinates(event);
    this.emit({
      type: 'draw_preview',
      position: coords,
    });
  }

  private onMouseUp(event: MouseEvent): void {
    if (!this.isDrawing) return;

    this.isDrawing = false;
    const coords = this.getCanvasCoordinates(event);
    this.emit({
      type: 'finish_draw',
      position: coords,
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Check for focus on input elements
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.code) {
      case 'KeyD':
        this.setTool('deck');
        break;
      case 'KeyS':
        this.setTool('steel');
        break;
      case 'KeyZ':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (event.shiftKey) {
            this.emit({ type: 'redo' });
          } else {
            this.emit({ type: 'undo' });
          }
        }
        break;
      case 'KeyT':
        this.emit({ type: 'test' });
        break;
      case 'KeyC':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.emit({ type: 'clear' });
        }
        break;
      case 'KeyR':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.emit({ type: 'reset' });
        }
        break;
      case 'KeyM':
        this.emit({ type: 'toggle_mute' });
        break;
      case 'Escape':
        this.emit({ type: 'stop' });
        break;
    }
  }

  private setTool(tool: MemberKind): void {
    this.currentTool = tool;
    this.emit({
      type: 'tool_changed',
      tool,
    });
  }

  getCurrentTool(): MemberKind {
    return this.currentTool;
  }

  /**
   * Subscribe to input events
   */
  on(listener: InputListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private emit(event: InputEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Destroy input handler
   */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.onMouseUp.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
  }
}
