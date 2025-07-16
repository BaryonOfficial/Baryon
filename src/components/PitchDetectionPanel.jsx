import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { setupPitchDetection, listAudioInputDevices } from "../audio/setupPitchDetection";

const panelStyle = {
  width: 320,
  minHeight: 120,
  background: "#23272f",
  color: "#fff",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
  padding: 20,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  position: "absolute",
  top: 32,
  left: 32,
  zIndex: 1000,
};

const collapsedButtonStyle = {
  position: "absolute",
  top: 40,
  left: 0,
  zIndex: 1001,
  background: "#23272f",
  color: "#fff",
  border: "none",
  borderRadius: "0 8px 8px 0",
  padding: "10px 14px",
  cursor: "pointer",
  boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
};

export default function PitchDetectionPanel({ style, className }) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [pitchData, setPitchData] = useState({ pitches: [], amplitudes: [] });
  const [detector, setDetector] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    listAudioInputDevices().then(setDevices);
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      if (detector && detector.setDevice) {
        detector.setDevice(selectedDevice.deviceId).then(setDetector);
      } else {
        setupPitchDetection({
          deviceId: selectedDevice.deviceId,
          onPitchData: setPitchData,
        }).then(setDetector);
      }
    }
    return () => {
      if (detector && detector.audioCtx) {
        detector.audioCtx.close();
      }
      if (detector && detector.stream) {
        detector.stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice]);

  if (collapsed) {
    return (
      <button style={collapsedButtonStyle} title="Show Pitch Detection Panel" onClick={() => setCollapsed(false)}>
        🎤
      </button>
    );
  }

  return (
    <div style={{ ...panelStyle, ...style }} className={className}>
      <button
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "none",
          color: "#fff",
          border: "none",
          fontSize: 18,
          cursor: "pointer",
        }}
        title="Collapse"
        onClick={() => setCollapsed(true)}
      >
        ←
      </button>
      <h3 style={{ margin: 0, fontSize: 18 }}>Audio Input Device</h3>
      <select
        value={selectedDevice ? selectedDevice.deviceId : ""}
        onChange={(e) => {
          const dev = devices.find((d) => d.deviceId === e.target.value);
          setSelectedDevice(dev);
        }}
        style={{
          padding: 6,
          borderRadius: 6,
          border: "1px solid #444",
          background: "#181b20",
          color: "#fff",
          marginTop: 8,
        }}
      >
        <option value="">Select device...</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Device ${device.deviceId}`}
          </option>
        ))}
      </select>
      <div style={{ marginTop: 10 }}>
        <strong>Detected Pitches (Hz):</strong>
        <div style={{ fontSize: 13, color: "#aaf", marginTop: 4, minHeight: 18 }}>
          {pitchData.pitches.length > 0
            ? pitchData.pitches
                .map((p, i) => `${p.toFixed(2)} Hz (amp: ${pitchData.amplitudes[i].toFixed(3)})`)
                .join(", ")
            : "None"}
        </div>
      </div>
    </div>
  );
}

PitchDetectionPanel.propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
};
