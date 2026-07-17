export const AUDIO_FEATURE_PROTOCOL_VERSION = 1;

const TOPOLOGY_SLOT_ARRAY_KEYS = Object.freeze([
  "modalFieldColorSlots",
  "modalFieldSpectralLaneA",
  "modalFieldSpectralLaneB",
  "modalFieldSpectralMeta",
  "modalFieldMetadataSlots",
]);

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isFloat32ArrayOfLength(value, length) {
  return value instanceof Float32Array && value.length === length;
}

function hasValidTopologyShape(packet) {
  const activeModeCount = packet?.activeModeCount;
  const committedModeCount = packet?.committedModeCount;
  if (
    !isNonNegativeInteger(activeModeCount) ||
    !isNonNegativeInteger(committedModeCount) ||
    activeModeCount > committedModeCount ||
    !isFloat32ArrayOfLength(packet?.modalIdentitySlots, activeModeCount * 3) ||
    !isFloat32ArrayOfLength(
      packet?.committedModeIdentitySlots,
      committedModeCount * 3,
    ) ||
    !isFloat32ArrayOfLength(
      packet?.committedModeFrequenciesHz,
      committedModeCount,
    ) ||
    !(packet?.modalRoleMetadata instanceof Uint8Array) ||
    packet.modalRoleMetadata.length !== activeModeCount ||
    !(packet?.committedModeRoleMetadata instanceof Uint8Array) ||
    packet.committedModeRoleMetadata.length !== committedModeCount ||
    !(packet?.fastProbeModeIndices instanceof Uint16Array)
  ) {
    return false;
  }
  for (let index = 0; index < activeModeCount * 3; index += 1) {
    if (
      packet.modalIdentitySlots[index] !==
      packet.committedModeIdentitySlots[index]
    ) {
      return false;
    }
  }
  for (const key of TOPOLOGY_SLOT_ARRAY_KEYS) {
    if (!isFloat32ArrayOfLength(packet[key], activeModeCount * 4)) {
      return false;
    }
  }
  for (const probeModeIndex of packet.fastProbeModeIndices) {
    if (probeModeIndex >= committedModeCount) {
      return false;
    }
  }
  return true;
}

function hasValidDriveShape(packet) {
  const activeModeCount = packet?.activeModeCount;
  const committedModeCount = packet?.committedModeCount;
  return (
    isNonNegativeInteger(activeModeCount) &&
    isNonNegativeInteger(committedModeCount) &&
    activeModeCount <= committedModeCount &&
    isFloat32ArrayOfLength(packet?.modalCoefficients, committedModeCount) &&
    isFloat32ArrayOfLength(packet?.phaseSlots, committedModeCount * 4) &&
    isFloat32ArrayOfLength(packet?.bandEnergies, 4) &&
    isFloat32ArrayOfLength(packet?.spectralBandEnergies, 4) &&
    packet?.renderState !== null &&
    typeof packet?.renderState === "object" &&
    !Array.isArray(packet.renderState)
  );
}

function driveMatchesTopologyShape(drive, topology) {
  return (
    hasValidDriveShape(drive) &&
    hasValidTopologyShape(topology) &&
    drive.activeModeCount === topology.activeModeCount &&
    drive.committedModeCount === topology.committedModeCount
  );
}

function freezePacket(packet) {
  return packet && typeof packet === "object" && !Object.isFrozen(packet)
    ? Object.freeze(packet)
    : packet;
}

function matchesGeneration(packet, sourceGeneration, workerGeneration) {
  return (
    packet?.protocolVersion === AUDIO_FEATURE_PROTOCOL_VERSION &&
    packet?.sourceGeneration === sourceGeneration &&
    packet?.workerGeneration === workerGeneration
  );
}

/**
 * Mechanically joins immutable topology and drive wire packets. This owner does
 * not derive audio semantics and never copies packet arrays.
 */
export function createAudioFeaturePacketJoiner({
  sourceGeneration = 1,
  workerGeneration = 1,
} = {}) {
  let currentSourceGeneration = sourceGeneration;
  let currentWorkerGeneration = workerGeneration;
  let topologyPacket = null;
  let heldFutureDrivePacket = null;
  let latestModel = null;
  let latestAcceptedFrameId = 0;
  let rejectedPacketCount = 0;

  const reject = (reason) => {
    rejectedPacketCount += 1;
    return { accepted: false, published: false, reason };
  };

  const publish = (drivePacket) => {
    const topology = topologyPacket;
    const drive = freezePacket(drivePacket);
    latestAcceptedFrameId = drive.frameId;
    latestModel = Object.freeze({ topology, drive });
    return { accepted: true, published: true, model: latestModel };
  };

  const clearPackets = () => {
    topologyPacket = null;
    heldFutureDrivePacket = null;
    latestModel = null;
    latestAcceptedFrameId = 0;
  };

  return {
    setGenerations(nextSourceGeneration, nextWorkerGeneration) {
      if (
        nextSourceGeneration === currentSourceGeneration &&
        nextWorkerGeneration === currentWorkerGeneration
      ) {
        return false;
      }

      currentSourceGeneration = nextSourceGeneration;
      currentWorkerGeneration = nextWorkerGeneration;
      clearPackets();
      return true;
    },

    acceptTopology(packet) {
      if (
        !matchesGeneration(
          packet,
          currentSourceGeneration,
          currentWorkerGeneration,
        )
      ) {
        return reject("generation-mismatch");
      }
      if (!isPositiveInteger(packet.topologyRevision)) {
        return reject("invalid-topology-revision");
      }
      if (
        topologyPacket &&
        packet.topologyRevision <= topologyPacket.topologyRevision
      ) {
        return reject("non-increasing-topology-revision");
      }
      if (!hasValidTopologyShape(packet)) {
        return reject("invalid-topology-shape");
      }

      topologyPacket = freezePacket(packet);
      if (
        heldFutureDrivePacket &&
        heldFutureDrivePacket.topologyRevision < packet.topologyRevision
      ) {
        heldFutureDrivePacket = null;
        rejectedPacketCount += 1;
      }
      if (heldFutureDrivePacket?.topologyRevision === packet.topologyRevision) {
        const heldDrive = heldFutureDrivePacket;
        heldFutureDrivePacket = null;
        if (!driveMatchesTopologyShape(heldDrive, topologyPacket)) {
          rejectedPacketCount += 1;
          return {
            accepted: true,
            published: false,
            reason: "discarded-mismatched-held-drive",
          };
        }
        if (heldDrive.frameId > latestAcceptedFrameId) {
          return publish(heldDrive);
        }
      }

      return { accepted: true, published: false, reason: "awaiting-drive" };
    },

    acceptDrive(packet) {
      if (
        !matchesGeneration(
          packet,
          currentSourceGeneration,
          currentWorkerGeneration,
        )
      ) {
        return reject("generation-mismatch");
      }
      if (
        !isPositiveInteger(packet.topologyRevision) ||
        !isPositiveInteger(packet.frameId)
      ) {
        return reject("invalid-drive-packet");
      }
      if (!hasValidDriveShape(packet)) {
        return reject("invalid-drive-shape");
      }
      if (packet.frameId <= latestAcceptedFrameId) {
        return reject("non-monotonic-frame");
      }

      const topologyRevision = topologyPacket?.topologyRevision ?? 0;
      if (packet.topologyRevision === topologyRevision) {
        if (!driveMatchesTopologyShape(packet, topologyPacket)) {
          return reject("drive-topology-shape-mismatch");
        }
        return publish(packet);
      }
      if (packet.topologyRevision < topologyRevision) {
        return reject("older-drive-revision");
      }

      if (
        !heldFutureDrivePacket ||
        packet.topologyRevision > heldFutureDrivePacket.topologyRevision ||
        (packet.topologyRevision === heldFutureDrivePacket.topologyRevision &&
          packet.frameId > heldFutureDrivePacket.frameId)
      ) {
        heldFutureDrivePacket = freezePacket(packet);
        return {
          accepted: true,
          published: false,
          reason: "awaiting-topology",
        };
      }

      return reject("superseded-future-drive");
    },

    readLatestModel() {
      return latestModel;
    },

    clear() {
      clearPackets();
    },

    getStatus() {
      return {
        sourceGeneration: currentSourceGeneration,
        workerGeneration: currentWorkerGeneration,
        topologyRevision: topologyPacket?.topologyRevision ?? 0,
        latestAcceptedFrameId,
        heldFutureTopologyRevision:
          heldFutureDrivePacket?.topologyRevision ?? 0,
        rejectedPacketCount,
        hasCompleteModel: Boolean(latestModel),
      };
    },
  };
}

/**
 * Producer-side bounded input transport. Acknowledgement is the only event
 * that releases the in-flight slot. Pending fast data coalesces to the newest
 * capture while the newest unsent structural payload remains sticky.
 */
/**
 * @param {{
 *   send: (frame: any) => void,
 *   sourceGeneration?: number,
 *   workerGeneration?: number,
 * }} options
 */
export function createBoundedAudioInputTransport({
  send,
  sourceGeneration = 1,
  workerGeneration = 1,
}) {
  if (typeof send !== "function") {
    throw new TypeError("createBoundedAudioInputTransport requires send");
  }

  let currentSourceGeneration = sourceGeneration;
  let currentWorkerGeneration = workerGeneration;
  let nextFrameId = 1;
  let inFlight = null;
  let pending = null;
  let replacementCount = 0;
  let staleAcknowledgementCount = 0;
  let sentCount = 0;

  const stamp = (input) => ({
    ...input,
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: currentSourceGeneration,
    workerGeneration: currentWorkerGeneration,
    frameId: nextFrameId++,
  });

  const dispatch = (input) => {
    inFlight = stamp(input);
    sentCount += 1;
    send(inFlight);
    return inFlight.frameId;
  };

  return {
    offer(input) {
      if (!input) {
        return { sent: false, reason: "empty-input" };
      }
      if (!inFlight) {
        return { sent: true, frameId: dispatch(input) };
      }

      if (pending) {
        replacementCount += 1;
      }
      pending = {
        ...input,
        structuralPayload:
          input.structuralPayload ?? pending?.structuralPayload ?? null,
        structuralRequested:
          input.structuralRequested === true ||
          pending?.structuralRequested === true ||
          input.structuralPayload != null ||
          pending?.structuralPayload != null,
      };
      return { sent: false, reason: "coalesced" };
    },

    /** @param {{ sourceGeneration?: number, workerGeneration?: number, frameId?: number }} [acknowledgement] */
    acknowledge(
      {
        sourceGeneration: acknowledgedSourceGeneration,
        workerGeneration: acknowledgedWorkerGeneration,
        frameId,
      } = /** @type {{ sourceGeneration?: number, workerGeneration?: number, frameId?: number }} */ ({}),
    ) {
      if (
        !inFlight ||
        acknowledgedSourceGeneration !== currentSourceGeneration ||
        acknowledgedWorkerGeneration !== currentWorkerGeneration ||
        frameId !== inFlight.frameId
      ) {
        staleAcknowledgementCount += 1;
        return false;
      }

      inFlight = null;
      if (pending) {
        const next = pending;
        pending = null;
        dispatch(next);
      }
      return true;
    },

    resetGenerations(nextSourceGeneration, nextWorkerGeneration) {
      currentSourceGeneration = nextSourceGeneration;
      currentWorkerGeneration = nextWorkerGeneration;
      nextFrameId = 1;
      inFlight = null;
      pending = null;
    },

    clear() {
      inFlight = null;
      pending = null;
    },

    getStatus() {
      return {
        sourceGeneration: currentSourceGeneration,
        workerGeneration: currentWorkerGeneration,
        inFlightFrameId: inFlight?.frameId ?? 0,
        pending: Boolean(pending),
        queueDepth: Number(Boolean(inFlight)) + Number(Boolean(pending)),
        replacementCount,
        staleAcknowledgementCount,
        sentCount,
      };
    },
  };
}
