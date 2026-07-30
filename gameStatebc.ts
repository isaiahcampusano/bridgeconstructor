import type { GameState, BridgeDesign, TestResult } from '../types';
import { createEmptyDesign } from '../utils/storage';

type StateChangeListener = (state: GameState, data?: unknown) => void;

/**
 * Game state manager handling transitions and listeners
 */
export class GameStateManager {
  private currentState: GameState = 'BUILD';
  private currentDesign: BridgeDesign = createEmptyDesign();
  private lastTestResult: TestResult | null = null;
  private listeners: StateChangeListener[] = [];

  constructor(initialDesign?: BridgeDesign) {
    if (initialDesign) {
      this.currentDesign = initialDesign;
    }
  }

  getState(): GameState {
    return this.currentState;
  }

  getDesign(): BridgeDesign {
    return this.currentDesign;
  }

  setDesign(design: BridgeDesign): void {
    this.currentDesign = design;
  }

  getLastTestResult(): TestResult | null {
    return this.lastTestResult;
  }

  /**
   * Transition to BUILD state
   */
  toBuild(): void {
    this.currentState = 'BUILD';
    this.lastTestResult = null;
    this.notifyListeners();
  }

  /**
   * Transition to TESTING state
   */
  toTesting(): void {
    this.currentState = 'TESTING';
    this.notifyListeners();
  }

  /**
   * Transition to SUCCESS state
   */
  toSuccess(testResult: TestResult): void {
    this.currentState = 'SUCCESS';
    this.lastTestResult = testResult;
    this.notifyListeners({ testResult });
  }

  /**
   * Transition to FAILURE state
   */
  toFailure(testResult: TestResult): void {
    this.currentState = 'FAILURE';
    this.lastTestResult = testResult;
    this.notifyListeners({ testResult });
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private notifyListeners(data?: unknown): void {
    for (const listener of this.listeners) {
      listener(this.currentState, data);
    }
  }

  /**
   * Reset game state
   */
  reset(): void {
    this.currentState = 'BUILD';
    this.currentDesign = createEmptyDesign();
    this.lastTestResult = null;
    this.notifyListeners();
  }
}
