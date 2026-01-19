import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyColorSchemePreference, parseColorSchemePreference } from "./misc/colorScheme";
import { applyColorTheme, parseColorTheme } from "./misc/colorTheme";

// Apply theme before React renders to avoid "no-op" palette state on pages/tests.
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
    <App />
  </React.StrictMode>
);
