import { describe, expect, it } from "vitest";

import {
  canonicalizeTranslationBasis,
  computeTranslationBasisHash,
} from "../app/domain/translation-basis";

const basis = {
  representation: "scratchblocks" as const,
  representationVersion: 1,
  scripts: [
    { key: "main", source: "when green flag clicked\nsay [hello]" },
    { key: "helper", source: "define helper\nmove (10) steps" },
  ],
  units: [
    {
      key: "script:main:title",
      kind: "script-title" as const,
      sourceText: "Main",
    },
    {
      key: "procedure:helper",
      kind: "procedure" as const,
      sourceText: "helper",
    },
  ],
};

describe("translation basis", () => {
  it("is stable across input ordering and line endings", async () => {
    const reordered = {
      ...basis,
      scripts: [
        { key: "helper", source: "define helper\r\nmove (10) steps" },
        basis.scripts[0],
      ],
      units: [...basis.units].reverse(),
    };

    expect(await computeTranslationBasisHash(reordered)).toBe(
      await computeTranslationBasisHash(basis),
    );
  });

  it("changes when translation-sensitive code changes", async () => {
    const changed = {
      ...basis,
      scripts: basis.scripts.map((script) =>
        script.key === "helper"
          ? { ...script, source: "define helper\nmove (20) steps" }
          : script,
      ),
    };

    expect(await computeTranslationBasisHash(changed)).not.toBe(
      await computeTranslationBasisHash(basis),
    );
  });

  it("normalizes canonically equivalent Unicode", () => {
    const composed = {
      ...basis,
      units: [
        { key: "comment:1", kind: "comment" as const, sourceText: "café" },
      ],
    };
    const decomposed = {
      ...basis,
      units: [
        {
          key: "comment:1",
          kind: "comment" as const,
          sourceText: "cafe\u0301",
        },
      ],
    };

    expect(canonicalizeTranslationBasis(composed)).toBe(
      canonicalizeTranslationBasis(decomposed),
    );
  });

  it("rejects duplicate stable keys", () => {
    expect(() =>
      canonicalizeTranslationBasis({
        ...basis,
        scripts: [basis.scripts[0], basis.scripts[0]],
      }),
    ).toThrow(/duplicate key/);
  });
});
