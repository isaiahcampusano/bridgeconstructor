import type { BridgeDesign } from '../types';

type ChangeListener = () => void;

/**
 * Undo/redo manager for bridge designs
 */
export class UndoRedoManager {
  private history: BridgeDesign[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;
  private listeners: ChangeListener[] = [];

  constructor(initialDesign: BridgeDesign) {
    this.history = [this.cloneDesign(initialDesign)];
    this.currentIndex = 0;
  }

  /**
   * Push a new design state onto the history
   */
  push(design: BridgeDesign): void {
    // Remove any states after current index (discarding redo history)
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add new state
    this.history.push(this.cloneDesign(design));
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }

    this.notifyListeners();
  }

  /**
   * Undo to previous state
   */
  undo(): BridgeDesign | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notifyListeners();
      return this.cloneDesign(this.history[this.currentIndex]);
    }
    return null;
  }

  /**
   * Redo to next state
   */
  redo(): BridgeDesign | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.notifyListeners();
      return this.cloneDesign(this.history[this.currentIndex]);
    }
    return null;
  }

  /**
   * Get current state
   */
  getCurrentState(): BridgeDesign {
    return this.cloneDesign(this.history[this.currentIndex]);
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Subscribe to changes
   */
  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  /**
   * Reset history
   */
  reset(initialDesign: BridgeDesign): void {
    this.history = [this.cloneDesign(initialDesign)];
    this.currentIndex = 0;
    this.notifyListeners();
  }

  private cloneDesign(design: BridgeDesign): BridgeDesign {
    return {
      nodes: design.nodes.map(n => ({ ...n })),
      members: design.members.map(m => ({ ...m })),
      totalCost: design.totalCost,
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
