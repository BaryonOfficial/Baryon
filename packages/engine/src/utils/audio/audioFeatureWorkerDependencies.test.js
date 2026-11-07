import { execFileSync } from "node:child_process";
import process from "node:process";
import { it } from "vitest";

it("loads the audio worker without Three.js or GPU shader dependencies", () => {
  // A fresh loader follows the real transitive imports, without Vitest mocks
  // or a renderer's module cache hiding accidental GPU dependencies.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { registerHooks } from "node:module";
        registerHooks({
          resolve(specifier, context, nextResolve) {
            if (specifier === "three" || specifier.startsWith("three/")) {
              throw new Error("Audio worker must not load rendering code: " +
                specifier + " imported by " + context.parentURL);
            }
            return nextResolve(specifier, context);
          },
        });
        await import(process.argv[1]);
      `,
      new URL("./audioFeatureEngine.worker.js", import.meta.url).href,
    ],
    { stdio: "pipe" },
  );
});
