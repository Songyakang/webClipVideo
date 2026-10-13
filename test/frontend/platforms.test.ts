import { describe, expect, it } from "vitest";
import { endpointUrl, validatePlatform, parseParams, platformOptions, platformRequest, type Platform } from "../../src/lib/platforms";
const platform = (): Platform => ({ id: "local", name: "Local", platformType: "text", location: "local", authType: "none", baseEndpoint: "http://localhost:1234/v1/", endpoints: [{ key: "chat", name: "对话", path: "chat/completions", model: "test" }] });
describe("自定义平台配置", () => {
  it("规范化地址并保留 v1", () => {
    expect(endpointUrl(" https://example.com/v1/ ", " /chat/completions ")).toBe("https://example.com/v1/chat/completions");
    for (const base of ["bad", "file:///tmp", "https://user:secret@example.com", "https://example.com?key=x"]) expect(() => endpointUrl(base, "/chat")).toThrow();
    expect(() => endpointUrl("https://example.com", "https://other.com")).toThrow();
  });
  it("本地无认证、Bearer 密钥及模型校验", () => {
    expect(validatePlatform(platform()).endpoints[0].path).toBe("/chat/completions");
    expect(() => validatePlatform({ ...platform(), authType: "bearer" })).toThrow("API Key");
    const p = platform(); p.endpoints[0].model = " ";
    expect(() => validatePlatform(p)).toThrow("模型");
    const duplicate = platform(); duplicate.endpoints.push(duplicate.endpoints[0]);
    expect(() => validatePlatform(duplicate)).toThrow("重复");
  });
  it("参数保留数字、布尔值及嵌套结构并保护关键字段", () => {
    expect(parseParams('{"temperature":0.2,"thinking":false,"extra":{"enabled":true}}')).toEqual({ temperature: 0.2, thinking: false, extra: { enabled: true } });
    for (const input of ['[]', 'null', '{', '{"stream":true}', '{"temperature":"0.7"}', '{"max_tokens":0}', '{"max_tokens":100,"max_completion_tokens":200}']) expect(() => parseParams(input)).toThrow();
  });
  it("按能力筛选并传递平台 ID", () => {
    expect(platformOptions([platform()], "chat").map((p) => p.value)).toContain("platform:local");
    expect(platformOptions([platform()], "reverse-prompt").map((p) => p.value)).not.toContain("platform:local");
    expect(platformRequest("platform:local")).toEqual({ provider: "custom", platformId: "local" });
    expect(platformRequest("deepseek")).toEqual({ provider: "deepseek", platformId: undefined });
  });
});
