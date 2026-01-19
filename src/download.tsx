import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { applyColorSchemePreference, parseColorSchemePreference } from "./misc/colorScheme";
import { applyColorTheme, parseColorTheme } from "./misc/colorTheme";

import { Download } from "./DownloadPage";

// Apply theme before React renders (download page doesn't render AppHeader).
try {
  applyColorSchemePreference(
    parseColorSchemePreference(localStorage.getItem("colorScheme"))
  );
  applyColorTheme(parseColorTheme(localStorage.getItem("colorTheme")));
} catch (_e) {
  // Ignore (e.g. localStorage not available)
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Download />
  </React.StrictMode>,
);
