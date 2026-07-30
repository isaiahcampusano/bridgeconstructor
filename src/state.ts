import type { GamePhase } from "./types";

export type GameEvent = "START_TEST" | "STOP_TEST" | "SUCCEED" | "FAIL" | "RESET";

export function transitionPhase(phase: GamePhase, event: GameEvent): GamePhase {
  if (event === "RESET" || event === "STOP_TEST") {
    return "BUILD";
  }
  if (phase === "BUILD" && event === "START_TEST") {
    return "TESTING";
  }
  if (phase === "TESTING" && event === "SUCCEED") {
    return "SUCCESS";
  }
  if (phase === "TESTING" && event === "FAIL") {
    return "FAILURE";
  }
  return phase;
}
