import type { BridgeDesign, SavedGameState } from '../types';

const STORAGE_KEY = 'bridge-constructor-game';
const CURRENT_VERSION = 1;

/**
 * Create an empty bridge design
 */
export function createEmptyDesign(): BridgeDesign {
  return {
    nodes: [],
    members: [],
    totalCost: 0,
  };
}

/**
 * Save game state to localStorage
 */
export function saveGameState(design: BridgeDesign, muted: boolean): void {
  try {
    const gameState: SavedGameState = {
      version: CURRENT_VERSION,
      design,
      muted,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (error) {
    console.error('Failed to save game state:', error);
  }
}

/**
 * Load game state from localStorage
 * Returns null if no saved state or if state is corrupt/incompatible
 */
export function loadGameState(): SavedGameState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const gameState = JSON.parse(stored) as SavedGameState;

    // Version check
    if (gameState.version !== CURRENT_VERSION) {
      console.warn('Saved game state version mismatch, discarding');
      return null;
    }

    // Validate structure
    if (!gameState.design || !Array.isArray(gameState.design.nodes) || !Array.isArray(gameState.design.members)) {
      console.warn('Saved game state is corrupt, discarding');
      return null;
    }

    return gameState;
  } catch (error) {
    console.error('Failed to load game state:', error);
    return null;
  }
}

/**
 * Clear saved game state
 */
export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear game state:', error);
  }
}

/**
 * Save mute preference only
 */
export function saveMutePreference(muted: boolean): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const gameState = JSON.parse(stored) as SavedGameState;
      gameState.muted = muted;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    }
  } catch (error) {
    console.error('Failed to save mute preference:', error);
  }
}
