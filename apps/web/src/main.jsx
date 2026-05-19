import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Baryon web root element #root is missing.");
}

ReactDOM.createRoot(rootElement).render(<App />);
