import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  audioFeatureObservationMatchesTopology,
  isAudioFeatureObservationPacket,
  isAudioFeatureTopologyPacket,
  isPositiveProtocolInteger,
} from "../../contracts/audioFeatureProtocol.js";

const EPOCH_KEYS = [
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
];

function epochOf({
  sourceGeneration = 1,
  workerGeneration = 0,
  timelineRevision = 0,
  processingRevision = 0,
} = {}) {
  const epoch = {
    sourceGeneration,
    workerGeneration,
    timelineRevision,
    processingRevision,
  };
  if (
    !isPositiveProtocolInteger(sourceGeneration) ||
    [workerGeneration, timelineRevision, processingRevision].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    )
  )
    throw new RangeError("invalid audio feature epoch");
  return epoch;
}

/**
 * Joins one immutable topology/observation pair, without deriving physics,
 * sending commands, restarting capture or allocating replacement packet arrays.
 * Unknown topology retains only its newest observation. Explicit clear revokes
 * the epoch; cached reads or packets cannot reactivate it.
 */
export function createAudioFeaturePacketJoiner(configuration = {}) {
  let epoch = epochOf(configuration);
  let revoked = false;
  let topology = null,
    held = null,
    latestModel = null;
  let latestAcceptedFrameId = 0,
    rejectedPacketCount = 0;
  const reject = (reason) => {
    rejectedPacketCount++;
    return { accepted: false, published: false, reason };
  };
  const matchesEpoch = (packet) =>
    !revoked &&
    packet?.protocolVersion === AUDIO_FEATURE_PROTOCOL_VERSION &&
    EPOCH_KEYS.every((key) => packet[key] === epoch[key]);
  const publish = (observation) => {
    latestAcceptedFrameId = observation.frameId;
    latestModel = Object.freeze({
      topology,
      observation: Object.freeze(observation),
    });
    return { accepted: true, published: true, model: latestModel };
  };
  return {
    setEpoch(configuration) {
      const next = epochOf(configuration);
      const changed = EPOCH_KEYS.find((key) => next[key] !== epoch[key]);
      if (!changed) return false;
      if (next[changed] < epoch[changed])
        throw new RangeError("audio feature epoch cannot move backward");
      epoch = next;
      revoked = false;
      topology = held = latestModel = null;
      latestAcceptedFrameId = 0;
      return true;
    },
    acceptTopology(packet) {
      if (!matchesEpoch(packet)) return reject("generation-mismatch");
      if (!isAudioFeatureTopologyPacket(packet))
        return reject("invalid-topology-shape");
      if (topology && packet.topologyRevision <= topology.topologyRevision)
        return reject("non-increasing-topology-revision");
      topology = Object.freeze(packet);
      latestModel = null;
      if (held && held.topologyRevision < topology.topologyRevision) {
        held = null;
        rejectedPacketCount++;
      }
      if (held?.topologyRevision === topology.topologyRevision) {
        const pending = held;
        held = null;
        if (
          pending.frameId <= latestAcceptedFrameId ||
          !audioFeatureObservationMatchesTopology(pending, topology)
        )
          return reject("invalid-held-observation");
        return publish(pending);
      }
      return {
        accepted: true,
        published: false,
        reason: "awaiting-observation",
      };
    },
    acceptObservation(packet) {
      if (!matchesEpoch(packet)) return reject("generation-mismatch");
      if (
        !isPositiveProtocolInteger(packet.frameId) ||
        packet.frameId <= latestAcceptedFrameId
      )
        return reject("non-monotonic-frame");
      if (packet.topologyRevision < (topology?.topologyRevision ?? 0))
        return reject("older-observation-revision");
      if (packet.topologyRevision === topology?.topologyRevision) {
        if (!audioFeatureObservationMatchesTopology(packet, topology))
          return reject("observation-topology-shape-mismatch");
        return publish(packet);
      }
      if (!isAudioFeatureObservationPacket(packet))
        return reject("invalid-observation-shape");
      if (
        held &&
        (packet.topologyRevision < held.topologyRevision ||
          (packet.topologyRevision === held.topologyRevision &&
            packet.frameId <= held.frameId))
      )
        return reject("superseded-future-observation");
      held = Object.freeze(packet);
      return { accepted: true, published: false, reason: "awaiting-topology" };
    },
    readLatestModel: () => latestModel,
    clear() {
      topology = held = latestModel = null;
      revoked = true;
    },
    getStatus() {
      return {
        ...epoch,
        revoked,
        topologyRevision: topology?.topologyRevision ?? 0,
        latestAcceptedFrameId,
        heldFutureTopologyRevision: held?.topologyRevision ?? 0,
        rejectedPacketCount,
        hasCompleteModel: latestModel !== null,
      };
    },
  };
}
