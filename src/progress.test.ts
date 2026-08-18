import { describe, expect, it } from "vitest";
import { isLevelUnlocked, parseProgress } from "./progress";

describe("level progression", () => {
  it("starts with only the first level unlocked", () => {
    const progress = parseProgress(null);
    expect(isLevelUnlocked(0, progress)).toBe(true);
    expect(isLevelUnlocked(1, progress)).toBe(false);
  });

  it("sanitizes persisted completion and best-cost data", () => {
    const progress = parseProgress(
      JSON.stringify({
        completedLevelIds: ["blueprint-span-01", "blueprint-span-01", 42],
        bestCosts: { "blueprint-span-01": 8784, invalid: "cheap" },
      }),
    );
    expect(progress.completedLevelIds).toEqual(["blueprint-span-01"]);
    expect(progress.bestCosts).toEqual({ "blueprint-span-01": 8784 });
    expect(isLevelUnlocked(1, progress)).toBe(true);
  });
});
