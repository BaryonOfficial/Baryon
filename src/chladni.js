// chladni.js
const pi = Math.PI;

export const chladni = (x, y, z, parameters) => {
  let sum = 0;
  for (let i = 0; i < parameters.N; i++) {
    const components = parameters.waveComponents[i];
    const Ai = components[`A${i}`];
    const ui = components[`u${i}`];
    const vi = components[`v${i}`];
    const wi = components[`w${i}`];
    sum +=
      Ai *
      Math.sin(ui * pi * x) *
      Math.sin(vi * pi * y) *
      Math.sin(wi * pi * z);
  }
  return sum;
};
