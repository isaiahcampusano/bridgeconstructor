import { describe, expect, it } from "vitest";
import { transitionPhase } from "./state";

describe("game phase transitions", () => {
  it("follows the build, test, result, reset lifecycle", () => {
    expect(transitionPhase("BUILD", "START_TEST")).toBe("TESTING");
    expect(transitionPhase("TESTING", "SUCCEED")).toBe("SUCCESS");
    expect(transitionPhase("SUCCESS", "RESET")).toBe("BUILD");
    expect(transitionPhase("TESTING", "FAIL")).toBe("FAILURE");
    expect(transitionPhase("FAILURE", "RESET")).toBe("BUILD");
  });

  it("ignores invalid transitions", () => {
    expect(transitionPhase("BUILD", "SUCCEED")).toBe("BUILD");
    expect(transitionPhase("SUCCESS", "START_TEST")).toBe("SUCCESS");
  });
});
