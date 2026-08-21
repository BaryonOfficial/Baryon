import { beforeEach } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
