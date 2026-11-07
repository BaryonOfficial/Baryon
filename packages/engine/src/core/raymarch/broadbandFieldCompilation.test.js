import { beforeEach, expect, it, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "../../utils/audio/audioFeaturePacketCodec.js";

const passes = vi.hoisted(() =>
  Array.from({ length: 3 }, () => ({
    compile: vi.fn(),
    update: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    textureBytes: 0,
  })),
);
vi.mock("./broadbandSpectralExpansion.js", () => ({
  createBroadbandSpectralExpansion: () => passes[0],
}));
vi.mock("./broadbandSpectralProjection.js", () => ({
  createBroadbandSpectralProjection: () => passes[1],
}));
vi.mock("./broadbandMomentField.js", () => ({
  createBroadbandMomentField: () => passes[2],
}));
import { createBroadbandFieldSource } from "./broadbandFieldSource.js";

beforeEach(() => {
  for (const pass of passes) {
    pass.compile.mockReset().mockResolvedValue();
    pass.update.mockClear();
    pass.render.mockClear();
    pass.dispose.mockClear();
  }
});
function source() {
  const fixture = createAudioFeaturePacketFixture();
  const field = createBroadbandFieldSource({ getApertureRadius: () => 3 });
  field.upload(createRendererFeatureView(fixture.model()));
  return field;
}

it("awaits spectral compute compilation before field readiness without drawing or changing admission", async () => {
  const field = source(),
    renderer = {};
  const before = field.read();
  let finish;
  passes[1].compile.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const ready = field.compile(renderer);
  await Promise.resolve();
  expect(passes[1].compile).toHaveBeenCalledWith(renderer);
  expect(passes[2].compile).not.toHaveBeenCalled();
  finish();
  await ready;
  expect(passes[2].compile).toHaveBeenCalledWith(renderer);
  expect(field.read()).toEqual(before);
  for (const pass of passes) expect(pass.render).not.toHaveBeenCalled();
  field.dispose();
});

it("does not continue warming a retired field when compute compilation completes", async () => {
  const field = source();
  let finish;
  passes[1].compile.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const ready = field.compile({});
  await Promise.resolve();
  field.dispose();
  finish();
  await ready;
  expect(passes[2].compile).not.toHaveBeenCalled();
  for (const pass of passes) expect(pass.dispose).toHaveBeenCalledOnce();
});

it("propagates a failed compute compilation instead of declaring the field ready", async () => {
  const field = source();
  passes[1].compile.mockRejectedValue(new Error("compute compilation failed"));
  await expect(field.compile({})).rejects.toThrow("compute compilation failed");
  expect(passes[2].compile).not.toHaveBeenCalled();
  field.dispose();
});
