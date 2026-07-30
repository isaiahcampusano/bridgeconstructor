import { describe, expect, it } from "vitest";
import { createReferenceDesign, LEVEL } from "./level";
import { parsePersistedState } from "./storage";

describe("local persistence", () => {
  it("round-trips a valid versioned design", () => {
    const source = {
      version: 1 as const,
      design: createReferenceDesign(),
      muted: true,
    };
    expect(parsePersistedState(JSON.stringify(source), LEVEL)).toEqual(source);
  });

  it("ignores corrupt and incompatible local data", () => {
    const corrupt = parsePersistedState("{nope", LEVEL);
    const incompatible = parsePersistedState(
      JSON.stringify({ version: 9, design: {}, muted: "yes" }),
      LEVEL,
    );
    expect(corrupt.design.members).toHaveLength(0);
    expect(incompatible.design.members).toHaveLength(0);
    expect(corrupt.design.nodes).toHaveLength(LEVEL.anchors.length);
  });

  it("rejects dangling references and tampered member measurements", () => {
    const reference = createReferenceDesign();
    const dangling = {
      version: 1,
      muted: false,
      design: {
        ...reference,
        members: reference.members.map((member, index) =>
          index === 0 ? { ...member, endNodeId: "missing-node" } : member,
        ),
      },
    };
    const tampered = {
      version: 1,
      muted: false,
      design: {
        ...reference,
        members: reference.members.map((member, index) =>
          index === 0 ? { ...member, cost: 1 } : member,
        ),
      },
    };
    expect(parsePersistedState(JSON.stringify(dangling), LEVEL).design.members).toHaveLength(0);
    expect(parsePersistedState(JSON.stringify(tampered), LEVEL).design.members).toHaveLength(0);
  });
});
