import "./styles.css";
import { BridgeGame, getInitialMessage } from "./game";
import { LEVEL } from "./level";
import { loadState } from "./storage";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Bridge Constructor could not find its application root.");
}

appRoot.innerHTML = `
  <main class="game-shell">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <p class="eyebrow">Blueprint workshop · Span 01</p>
          <h1>Bridge Constructor</h1>
        </div>
      </div>
      <div class="phase-block">
        <span class="phase-pill" data-testid="phase" data-phase="BUILD">Build mode</span>
        <p id="phase-description">Connect the gold road anchors, then brace the span.</p>
      </div>
      <button class="quiet-button sound-button" data-action="mute" aria-pressed="false">
        Sound on
      </button>
    </header>

    <section class="control-rail" aria-label="Construction tools">
      <div class="tool-group" role="group" aria-label="Materials">
        <button class="tool-button is-selected" data-tool="deck" aria-pressed="true">
          <span class="tool-icon deck-icon" aria-hidden="true"></span>
          <span><strong>Road deck</strong><small>1 · $500 / m</small></span>
        </button>
        <button class="tool-button" data-tool="steel" aria-pressed="false">
          <span class="tool-icon steel-icon" aria-hidden="true"></span>
          <span><strong>Steel truss</strong><small>2 · $300 / m</small></span>
        </button>
        <button class="tool-button erase-button" data-tool="erase" aria-pressed="false">
          <span class="erase-glyph" aria-hidden="true">×</span>
          <span><strong>Erase</strong><small>E · click member</small></span>
        </button>
      </div>

      <div class="history-group" role="group" aria-label="Edit history">
        <button class="icon-button" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">
          ↶
        </button>
        <button class="icon-button" data-action="redo" title="Redo (Ctrl+Y)" aria-label="Redo">
          ↷
        </button>
        <button class="quiet-button clear-button" data-action="clear">Clear</button>
      </div>

      <div class="budget-block">
        <div class="budget-copy">
          <span>Project cost</span>
          <strong data-testid="cost">$0</strong>
        </div>
        <div class="budget-track" aria-label="Budget usage">
          <span id="budget-fill"></span>
        </div>
        <small id="budget-remaining">$10,000 remaining</small>
      </div>

      <button class="test-button" data-action="test" data-mode="test">
        Run load test
      </button>
    </section>

    <section class="workspace" aria-label="Bridge level">
      <div class="canvas-wrap" id="canvas-host">
        <div class="canvas-label canyon-label" aria-hidden="true">
          <span>8 m</span>
          <i></i>
          <span>canyon span</span>
        </div>
        <div class="canvas-label timer-label">
          <span>Test clock</span>
          <strong id="timer">0.0 s</strong>
        </div>
        <div class="stress-legend" aria-label="Stress legend">
          <span class="legend-title">Live stress</span>
          <span><i class="stress-low"></i> Stable</span>
          <span><i class="stress-mid"></i> Loaded</span>
          <span><i class="stress-high"></i> Critical</span>
        </div>
      </div>
      <div class="workspace-status" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <span id="build-message"></span>
        <span class="crossing-note">Crossed lines do not connect without a node.</span>
      </div>
    </section>

    <footer class="help-strip">
      <p><kbd>Drag</kbd> between grid points to build</p>
      <p><kbd>1</kbd> Road <kbd>2</kbd> Steel <kbd>E</kbd> Erase</p>
      <p><kbd>Ctrl Z</kbd> Undo <kbd>Space</kbd> Test / stop</p>
      <p class="engineering-note">Game simulation — not engineering advice</p>
    </footer>
  </main>

  <dialog id="result-dialog" class="result-dialog">
    <div class="result-graphic" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <p class="eyebrow" id="result-eyebrow">Load test complete</p>
    <h2 id="result-title">The span holds.</h2>
    <p id="result-message"></p>
    <div class="result-stats" id="result-stats"></div>
    <div class="dialog-actions">
      <button class="test-button" data-action="result-reset">Reset design</button>
      <button class="quiet-button" data-action="result-clear">Clear blueprint</button>
    </div>
  </dialog>
`;

const initialState = loadState(LEVEL);
const message = document.querySelector<HTMLElement>("#build-message");
if (message) {
  message.textContent = getInitialMessage(initialState.design);
}
const game = new BridgeGame(initialState.design, initialState.muted);
void game.start();
