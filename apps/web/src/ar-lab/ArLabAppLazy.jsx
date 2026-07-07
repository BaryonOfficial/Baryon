import React from "react";

// Lazy entry so the main app bundle never pays for the XR stack.
export default React.lazy(() => import("./ArLabApp.jsx"));
