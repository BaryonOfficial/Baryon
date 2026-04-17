import React from "react";

import "./App.css";

export function AppFrame({ children }) {
  return <div className="app-shell">{children}</div>;
}
