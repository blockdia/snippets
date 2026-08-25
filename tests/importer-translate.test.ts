import { describe, expect, it } from "vitest";

import { translateLegacyScratchblocks } from "../app/importer/translate";

describe("translateLegacyScratchblocks", () => {
  it("translates blocks and comments nested in a diff glow", () => {
    expect(
      translateLegacyScratchblocks(
        "+ say [hello] // note\n+ say [world]",
        "zh-CN",
        { comments: { note: "备注" } },
      ),
    ).toBe("+ 说 [hello] // 备注\n+ 说 [world]");
  });
});
