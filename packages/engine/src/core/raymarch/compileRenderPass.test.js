import { describe, expect, it, vi } from "vitest";
import { compileRenderPass } from "./compileRenderPass.js";

describe("render pass compilation ownership", () => {
  it.each([false, true])(
    "retains attachments across yields and restores on failure=%s",
    async (fail) => {
      const originalTarget = {},
        originalMrt = {},
        target = {},
        mrt = {};
      let activeTarget = originalTarget,
        activeMrt = originalMrt,
        finish;
      const renderer = {
        initialized: true,
        getRenderTarget: () => activeTarget,
        setRenderTarget: (value) => {
          activeTarget = value;
        },
        getMRT: () => activeMrt,
        setMRT: (value) => {
          activeMrt = value;
        },
        compileAsync: vi.fn(async () => {
          await new Promise((resolve) => {
            finish = resolve;
          });
          expect(activeTarget).toBe(target);
          expect(activeMrt).toBe(mrt);
          if (fail) throw new Error("compilation failed");
        }),
      };
      const pending = compileRenderPass(renderer, {
        scene: {},
        camera: {},
        target,
        mrt,
      });
      await Promise.resolve();
      expect(activeTarget).toBe(target);
      expect(activeMrt).toBe(mrt);
      finish();
      if (fail) await expect(pending).rejects.toThrow("compilation failed");
      else await pending;
      expect(activeTarget).toBe(originalTarget);
      expect(activeMrt).toBe(originalMrt);
    },
  );
});
