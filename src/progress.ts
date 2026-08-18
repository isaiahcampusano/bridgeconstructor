export interface LevelProgress {
  completedLevelIds: string[];
  bestCosts: Record<string, number>;
}

export const PROGRESS_KEY = "bridge-constructor:progress:v1";

const emptyProgress = (): LevelProgress => ({ completedLevelIds: [], bestCosts: {} });

export function parseProgress(raw: string | null): LevelProgress {
  if (!raw) {
    return emptyProgress();
  }
  try {
    const value = JSON.parse(raw) as Partial<LevelProgress>;
    if (!Array.isArray(value.completedLevelIds) || !value.bestCosts) {
      return emptyProgress();
    }
    const completedLevelIds = value.completedLevelIds.filter(
      (id): id is string => typeof id === "string",
    );
    const bestCosts = Object.fromEntries(
      Object.entries(value.bestCosts).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    );
    return { completedLevelIds: [...new Set(completedLevelIds)], bestCosts };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(): LevelProgress {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return emptyProgress();
  }
}

export function recordCompletion(levelId: string, cost: number): { unlocked: boolean } {
  const progress = loadProgress();
  const unlocked = !progress.completedLevelIds.includes(levelId);
  if (unlocked) {
    progress.completedLevelIds.push(levelId);
  }
  progress.bestCosts[levelId] = Math.min(
    progress.bestCosts[levelId] ?? Number.POSITIVE_INFINITY,
    cost,
  );
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Progress persistence is optional when storage is unavailable.
  }
  return { unlocked };
}

export function isLevelUnlocked(levelIndex: number, progress: LevelProgress): boolean {
  return levelIndex === 0 || progress.completedLevelIds.length >= levelIndex;
}
