import { describe, expect, it } from "vitest";
import { mount } from "../src/mount.js";

interface FakeElement {
  dataset: Record<string, string>;
  children: FakeElement[];
  append(...children: FakeElement[]): void;
  replaceChildren(): void;
}

function fakeMake(): (tagName: string, className?: string) => HTMLElement {
  return (tagName: string, className?: string) => {
    void tagName; void className;
    const element: FakeElement = {
      dataset: {},
      children: [],
      append(...children: FakeElement[]) {
        this.children.push(...children);
      },
      replaceChildren() {
        this.children = [];
      },
    };
    return element as unknown as HTMLElement;
  };
}

describe("Rhythm Garden mount contract", () => {
  it("returns the contract shape and disposes idempotently", () => {
    const result = mount({
      signal: new AbortController().signal,
      ui: {
        make: fakeMake(),
        textButton: () => document.createElement("button"),
        appInput: () => document.createElement("input"),
      },
      storage: {
        signedInSubject: () => "test",
        mirrorFileContext: async () => { throw Error("unused"); },
        pickFile: async () => null,
        pickFolder: async () => null,
      },
    }, { autostart: false });
    expect(result.element).toBeDefined();
    result.dispose();
    result.dispose();
  });
});
