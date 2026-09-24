import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GptGlyph from "./GptGlyph";

describe("GptGlyph", () => {
  it.each([
    ["Luxury Prompt", "m3.8 7.5"],
    ["Kling Director", "M7 5.3"],
    ["iPhone Look", "M10.6 17.9"],
    ["UGC Models", "M16.3 4.8"],
  ])("renders Martin's icon for %s", (name, pathFragment) => {
    const markup = renderToStaticMarkup(
      createElement(GptGlyph, { gpt: { name, category: "General", icon_url: null } }),
    );

    expect(markup).toContain(pathFragment);
  });
});
