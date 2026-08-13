import { describe, it, expect } from "vitest";
import { isDirectorData } from "../../src/pages/detail/nodes/types";
import type { NodeData } from "../../src/pages/detail/nodes/types";

describe("isDirectorData", () => {
  it("returns true for valid director node data", () => {
    const data: NodeData = {
      type: "director",
      content: "",
      models: [],
      cameraTracks: [],
      sceneSettings: {
        backgroundColor: "#000000",
        ambientLight: 0.5,
        gridVisible: true,
      },
      sourceImageNodeIds: [],
    };
    expect(isDirectorData(data)).toBe(true);
  });

  it("returns false for non-director type", () => {
    const data: NodeData = {
      type: "image-upload",
      content: "",
    };
    expect(isDirectorData(data)).toBe(false);
  });

  it("returns false when models is not an array", () => {
    const data = {
      type: "director",
      content: "",
      cameraTracks: [],
      sceneSettings: { backgroundColor: "#000", ambientLight: 0, gridVisible: false },
    } as unknown as NodeData;
    expect(isDirectorData(data)).toBe(false);
  });

  it("returns false when cameraTracks is not an array", () => {
    const data = {
      type: "director",
      content: "",
      models: [],
      sceneSettings: { backgroundColor: "#000", ambientLight: 0, gridVisible: false },
    } as unknown as NodeData;
    expect(isDirectorData(data)).toBe(false);
  });

  it("returns false when sceneSettings is null", () => {
    const data: NodeData = {
      type: "director",
      content: "",
      models: [],
      cameraTracks: [],
    };
    expect(isDirectorData(data)).toBe(false);
  });
});
