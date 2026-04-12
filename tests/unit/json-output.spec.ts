import { extractJsonObject } from "../../apps/api/src/lib/analysis";

describe("extractJsonObject", () => {
  it("extracts a JSON object wrapped by markdown fences", () => {
    const input = [
      "下面是结果：",
      "```json",
      '{ "summary": "中文摘要", "keyPoints": ["a", "b"] }',
      "```"
    ].join("\n");

    expect(extractJsonObject(input)).toBe('{ "summary": "中文摘要", "keyPoints": ["a", "b"] }');
  });

  it("extracts the outermost JSON object from mixed text", () => {
    const input = '说明文字\n{"a":1,"nested":{"b":2}}\n后续说明';
    expect(extractJsonObject(input)).toBe('{"a":1,"nested":{"b":2}}');
  });
});
