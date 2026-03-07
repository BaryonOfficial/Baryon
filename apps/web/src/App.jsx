import React from "react";

import "./App.css";
import ThreeScene from "./components/ThreeScene.jsx";
import { AudioProvider } from "./context/AudioProvider";

function App() {
  return (
    <AudioProvider>
      <ThreeScene />
    </AudioProvider>
  );
}

export default App;
