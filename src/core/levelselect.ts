/**
 * Level selection and progression
 * NEW FILE - add to src/core/levelSelect.ts
 */

import type { LevelDefinition } from '../types';
import { LEVEL_1, LEVEL_2 } from '../config/level';

type LevelProgressionListener = (level: LevelDefinition, canUnlock: boolean) => void;

export class LevelProgression {
  private level1Beaten: boolean = false;
  private level2Beaten: boolean = false;
  private currentLevel: LevelDefinition = LEVEL_1;
  private listeners: LevelProgressionListener[] = [];

  constructor() {
    this.loadProgress();
  }

  /**
   * Get current level
   */
  getCurrentLevel(): LevelDefinition {
    return this.currentLevel;
  }

  /**
   * Check if a level is unlocked
   */
  isLevelUnlocked(levelId: string): boolean {
    if (levelId === 'level-1') return true; // Always unlocked
    if (levelId === 'level-2') return this.level1Beaten;
    return false;
  }

  /**
   * Switch to a level (if unlocked)
   */
  setCurrentLevel(levelId: string): boolean {
    if (!this.isLevelUnlocked(levelId)) {
      console.warn(`Level ${levelId} is not unlocked`);
      return false;
    }

    const level = levelId === 'level-1' ? LEVEL_1 : LEVEL_2;
    this.currentLevel = level;
    return true;
  }

  /**
   * Mark a level as beaten (unlocks next level)
   */
  beatLevel(levelId: string): void {
    if (levelId === 'level-1') {
      this.level1Beaten = true;
      console.log('✅ Level 1 beaten! Level 2 unlocked.');
      this.notifyListeners();
      this.saveProgress();
    } else if (levelId === 'level-2') {
      this.level2Beaten = true;
      console.log('✅ Level 2 beaten! Campaign complete!');
      this.notifyListeners();
      this.saveProgress();
    }
  }

  /**
   * Get level by ID
   */
  getLevel(levelId: string): LevelDefinition | null {
    if (levelId === 'level-1') return LEVEL_1;
    if (levelId === 'level-2') return LEVEL_2;
    return null;
  }

  /**
   * Get all levels with unlock status
   */
  getAllLevels(): Array<{ level: LevelDefinition; unlocked: boolean }> {
    return [
      { level: LEVEL_1, unlocked: true },
      { level: LEVEL_2, unlocked: this.level1Beaten },
    ];
  }

  /**
   * Subscribe to progression changes
   */
  onProgressChange(listener: LevelProgressionListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentLevel, this.isLevelUnlocked('level-2'));
    }
  }

  /**
   * Save progress to localStorage
   */
  private saveProgress(): void {
    try {
      const progress = {
        level1Beaten: this.level1Beaten,
        level2Beaten: this.level2Beaten,
        timestamp: Date.now(),
      };
      localStorage.setItem('bridge-constructor-progress', JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }

  /**
   * Load progress from localStorage
   */
  private loadProgress(): void {
    try {
      const stored = localStorage.getItem('bridge-constructor-progress');
      if (stored) {
        const progress = JSON.parse(stored);
        this.level1Beaten = progress.level1Beaten || false;
        this.level2Beaten = progress.level2Beaten || false;
      }
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  }

  /**
   * Reset all progress (for testing)
   */
  resetProgress(): void {
    this.level1Beaten = false;
    this.level2Beaten = false;
    localStorage.removeItem('bridge-constructor-progress');
    this.notifyListeners();
  }
}
