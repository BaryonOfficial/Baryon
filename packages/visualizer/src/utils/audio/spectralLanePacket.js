export function readPackedQuad(source, offset) {
  return [
    source?.[offset] ?? 0,
    source?.[offset + 1] ?? 0,
    source?.[offset + 2] ?? 0,
    source?.[offset + 3] ?? 0,
  ];
}

export function writePackedQuad(target, offset, values) {
  if (!target) return;
  target[offset] = values?.[0] ?? 0;
  target[offset + 1] = values?.[1] ?? 0;
  target[offset + 2] = values?.[2] ?? 0;
  target[offset + 3] = values?.[3] ?? 0;
}

function readSpectralLaneWeight(source, index) {
  const value = source?.[index] ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeSpectralLanePacket(laneA, laneB) {
  const laneAValues = [
    readSpectralLaneWeight(laneA, 0),
    readSpectralLaneWeight(laneA, 1),
    readSpectralLaneWeight(laneA, 2),
    readSpectralLaneWeight(laneA, 3),
  ];
  const laneBValues = [
    readSpectralLaneWeight(laneB, 0),
    readSpectralLaneWeight(laneB, 1),
    readSpectralLaneWeight(laneB, 2),
    readSpectralLaneWeight(laneB, 3),
  ];
  const total =
    laneAValues[0] +
    laneAValues[1] +
    laneAValues[2] +
    laneAValues[3] +
    laneBValues[0] +
    laneBValues[1] +
    laneBValues[2] +
    laneBValues[3];
  if (!(total > 0)) {
    return {
      laneA: [0, 0, 0, 0],
      laneB: [0, 0, 0, 0],
    };
  }
  return {
    laneA: laneAValues.map((value) => value / total),
    laneB: laneBValues.map((value) => value / total),
  };
}
