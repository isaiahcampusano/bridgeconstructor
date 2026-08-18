import "./styles.css";
import { BridgeGame, getInitialMessage } from "./game";
import { LEVELS } from "./levels";
import { isLevelUnlocked, loadProgress, recordCompletion } from "./progress";
import { loadState } from "./storage";
import { type LevelDefinition, MEMBER_KINDS, type MemberKind } from "./types";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Bridge Constructor could not find its application root.");
const appRoot: HTMLDivElement = root;

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function renderLevelSelect(): void {
  const progress = loadProgress();
  const cards = LEVELS.map((level, index) => {
    const unlocked = isLevelUnlocked(index, progress);
    const best = progress.bestCosts[level.id];
    return `<button class="level-card" data-level-id="${level.id}" ${unlocked ? "" : "disabled"}>
      <span class="level-number">Span ${String(index + 1).padStart(2, "0")}</span>
      <strong>${level.title}</strong><span>${level.canyonWidth} m canyon · ${currency(level.budget)} budget</span>
      <small>${unlocked ? (best === undefined ? "Ready to build" : `Best: ${currency(best)}`) : "Locked — pass the previous span"}</small>
    </button>`;
  }).join("");
  appRoot.innerHTML = `<main class="level-select-shell"><p class="eyebrow">Blueprint workshop</p>
    <h1>Bridge Constructor</h1><p class="level-select-intro">Choose a contract. Pass each load test to unlock the next span.</p>
    <section class="level-grid" aria-label="Choose a level">${cards}</section>
    <p class="engineering-note">Game simulation — not engineering advice</p></main>`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-level-id]")) {
    button.addEventListener("click", () => {
      const level = LEVELS.find((candidate) => candidate.id === button.dataset.levelId);
      if (level) renderGame(level);
    });
  }
}

function materialButton(level: LevelDefinition, kind: MemberKind, index: number): string {
  const material = level.materials[kind];
  return `<button class="tool-button ${kind === "deck" ? "is-selected" : ""}" data-tool="${kind}" aria-pressed="${kind === "deck"}">
    <span class="tool-swatch" style="--material-color:#${material.color.toString(16).padStart(6, "0")}" aria-hidden="true"></span>
    <span><strong>${material.label}</strong><small>${index + 1} · ${currency(material.costPerMeter)} / m</small></span></button>`;
}

function renderGame(level: LevelDefinition): void {
  const materialButtons = MEMBER_KINDS.map((kind, index) =>
    materialButton(level, kind, index),
  ).join("");
  appRoot.innerHTML = `<main class="game-shell">
    <header class="topbar"><div class="brand-block"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <div><p class="eyebrow">Blueprint workshop · ${level.title}</p><h1>Bridge Constructor</h1></div></div>
      <div class="phase-block"><span class="phase-pill" data-testid="phase" data-phase="BUILD">Build mode</span><p id="phase-description">Connect the gold road anchors, then brace the span.</p></div>
      <div class="topbar-actions"><button class="quiet-button" data-action="levels">Levels</button><button class="quiet-button sound-button" data-action="mute" aria-pressed="false">Sound on</button></div></header>
    <section class="control-rail" aria-label="Construction tools"><div class="tool-group" role="group" aria-label="Materials">${materialButtons}
      <button class="tool-button erase-button" data-tool="erase" aria-pressed="false"><span class="erase-glyph" aria-hidden="true">×</span><span><strong>Erase</strong><small>E · click member</small></span></button></div>
      <div class="history-group" role="group" aria-label="Edit history"><button class="icon-button" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button class="icon-button" data-action="redo" title="Redo (Ctrl+Y)" aria-label="Redo">↷</button><button class="quiet-button clear-button" data-action="clear">Clear</button></div>
      <div class="budget-block"><div class="budget-copy"><span>Project cost</span><strong data-testid="cost">$0</strong></div><div class="budget-track" aria-label="Budget usage"><span id="budget-fill"></span></div><small id="budget-remaining">${currency(level.budget)} remaining</small></div>
      <button class="test-button" data-action="test" data-mode="test">Run load test</button></section>
    <section class="workspace" aria-label="Bridge level"><div class="canvas-wrap" id="canvas-host">
      <div class="canvas-label canyon-label" aria-hidden="true"><span>${level.canyonWidth} m</span><i></i><span>canyon span</span></div><div class="canvas-label timer-label"><span>Test clock</span><strong id="timer">0.0 s</strong></div>
      <div class="stress-legend" aria-label="Stress legend"><span class="legend-title">Live stress</span><span><i class="stress-low"></i> Stable</span><span><i class="stress-mid"></i> Loaded</span><span><i class="stress-high"></i> Critical</span></div></div>
      <div class="workspace-status" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="build-message"></span><span class="crossing-note">Crossed lines do not connect without a node.</span></div></section>
    <footer class="help-strip"><p><kbd>Drag</kbd> between grid points to build</p><p><kbd>1–6</kbd> Materials <kbd>E</kbd> Erase</p><p><kbd>Ctrl Z</kbd> Undo <kbd>Space</kbd> Test / stop</p><p class="engineering-note">Game simulation — not engineering advice</p></footer></main>
    <div class="unlock-toast" id="unlock-toast" role="status" hidden>New level unlocked!</div>
    <dialog id="result-dialog" class="result-dialog"><div class="result-graphic" aria-hidden="true"><span></span><span></span><span></span></div><p class="eyebrow" id="result-eyebrow">Load test complete</p><h2 id="result-title">The span holds.</h2><p id="result-message"></p><div class="result-stats" id="result-stats"></div><div class="dialog-actions"><button class="test-button" data-action="result-reset">Retry level</button><button class="quiet-button" data-action="result-clear">Clear blueprint</button></div></dialog>`;

  const initialState = loadState(level);
  const message = document.querySelector<HTMLElement>("#build-message");
  if (message) message.textContent = getInitialMessage(initialState.design, level);
  document
    .querySelector("[data-action='levels']")
    ?.addEventListener("click", () => window.location.reload());
  const game = new BridgeGame(level, initialState.design, initialState.muted, (cost) => {
    const completion = recordCompletion(level.id, cost);
    const levelIndex = LEVELS.findIndex((candidate) => candidate.id === level.id);
    if (completion.unlocked && levelIndex < LEVELS.length - 1) {
      const toast = document.querySelector<HTMLElement>("#unlock-toast");
      if (toast) {
        toast.hidden = false;
        window.setTimeout(() => {
          toast.hidden = true;
        }, 4000);
      }
    }
  });
  void game.start();
}

renderLevelSelect();
