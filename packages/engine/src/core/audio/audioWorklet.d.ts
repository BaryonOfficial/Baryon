// Web Audio's rendering-global declarations are absent from TypeScript's DOM lib.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare const currentFrame: number;
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;
