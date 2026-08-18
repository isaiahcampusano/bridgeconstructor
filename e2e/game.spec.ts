import { expect, type Page, test } from "@playwright/test";
import { createReferenceDesign, LEVEL } from "../src/level";
import { LEVELS } from "../src/levels";
import { PROGRESS_KEY } from "../src/progress";
import { STORAGE_KEY } from "../src/storage";
import type { LevelDefinition } from "../src/types";

type Point = { x: number; y: number };

async function canvasPoint(
  page: Page,
  point: Point,
  level: LevelDefinition = LEVEL,
): Promise<Point> {
  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas is not visible.");
  }
  const bounds = level.viewBounds;
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(box.width / worldWidth, box.height / worldHeight);
  const contentWidth = worldWidth * scale;
  const contentHeight = worldHeight * scale;
  const offsetX = (box.width - contentWidth) / 2 - bounds.minX * scale;
  const offsetY = (box.height - contentHeight) / 2 + bounds.maxY * scale;
  return {
    x: box.x + offsetX + point.x * scale,
    y: box.y + offsetY - point.y * scale,
  };
}

async function dragMember(
  page: Page,
  start: Point,
  end: Point,
  level: LevelDefinition = LEVEL,
): Promise<void> {
  const from = await canvasPoint(page, start, level);
  const to = await canvasPoint(page, end, level);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function drawUnsupportedRoad(page: Page): Promise<void> {
  const roadSegments: Array<[Point, Point]> = [
    [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ],
    [
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ],
    [
      { x: 4, y: 0 },
      { x: 6, y: 0 },
    ],
    [
      { x: 6, y: 0 },
      { x: 8, y: 0 },
    ],
  ];
  for (const [start, end] of roadSegments) {
    await dragMember(page, start, end);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("", { waitUntil: "domcontentloaded" });
});

async function chooseFirstLevel(page: Page): Promise<void> {
  await page.getByRole("button", { name: /The Eight-Meter Test/ }).click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
}

test("selects a level, builds, validates, edits, persists, and tests", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Bridge Constructor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /The Twelve-Meter Divide/ })).toBeDisabled();
  await chooseFirstLevel(page);
  await expect(page.getByTestId("phase")).toHaveText("Build mode");
  await expect(page.getByTestId("cost")).toHaveText("$0");
  await expect(page.getByRole("button", { name: "Run load test" })).toBeDisabled();

  await dragMember(page, { x: 0, y: 0 }, { x: 3, y: 0 });
  await expect(page.getByRole("status")).toContainText("limited to 2 m");
  await expect(page.getByTestId("cost")).toHaveText("$0");

  await drawUnsupportedRoad(page);
  await expect(page.getByTestId("cost")).toHaveText("$4,000");
  await expect(page.getByRole("button", { name: "Run load test" })).toBeEnabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("cost")).toHaveText("$3,000");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("cost")).toHaveText("$4,000");

  await page.reload({ waitUntil: "domcontentloaded" });
  await chooseFirstLevel(page);
  await expect(page.getByTestId("cost")).toHaveText("$4,000");

  await page.getByRole("button", { name: "Run load test" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Live test");
  await page.getByRole("button", { name: "Stop test" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Build mode");
  await expect(page.getByTestId("cost")).toHaveText("$4,000");
});

test("shows the failure result for an unsupported deck", async ({ page }) => {
  await chooseFirstLevel(page);
  await drawUnsupportedRoad(page);
  await page.getByRole("button", { name: "Run load test" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText("Load test failed");
  await expect(dialog).toContainText("Gravity had the last word");
  await dialog.getByRole("button", { name: "Retry level" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Build mode");
});

test("shows the success result for the documented reference truss", async ({ page }) => {
  const persisted = {
    version: 1 as const,
    design: createReferenceDesign(),
    muted: true,
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: STORAGE_KEY,
    value: JSON.stringify(persisted),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await chooseFirstLevel(page);
  await expect(page.getByTestId("cost")).toHaveText("$8,784");
  await page.getByRole("button", { name: "Run load test" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText("Load test passed");
  await expect(dialog).toContainText("The span holds");
});

test("fits the supported minimum desktop viewport without document scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 650 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await chooseFirstLevel(page);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight);
  await expect(page.getByTestId("game-canvas")).toBeVisible();
});

test("opens the unlocked second level and starts its load test", async ({ page }) => {
  const secondLevel = LEVELS[1];
  if (!secondLevel) throw new Error("Second level is missing.");
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: PROGRESS_KEY,
    value: JSON.stringify({ completedLevelIds: [LEVEL.id], bestCosts: { [LEVEL.id]: 8784 } }),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /The Twelve-Meter Divide/ }).click();
  for (let x = 0; x < secondLevel.canyonWidth; x += 2) {
    await dragMember(page, { x, y: 0 }, { x: x + 2, y: 0 }, secondLevel);
  }
  await expect(page.getByTestId("cost")).toHaveText("$6,000");
  await page.getByRole("button", { name: "Run load test" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Live test");
});
