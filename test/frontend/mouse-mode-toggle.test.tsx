import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MouseModeToggle from "../../src/pages/detail/MouseModeToggle";

describe("MouseModeToggle", () => {
  it("抓手模式：aria-label 为平移模式，点击触发 onToggle", () => {
    const onToggle = vi.fn();
    render(<MouseModeToggle mode="hand" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "平移模式" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("箭头模式：aria-label 为框选模式", () => {
    render(<MouseModeToggle mode="select" onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "框选模式" })).toBeTruthy();
  });
});
