# Repository Guidelines

## Project Structure & Module Organization
The app is a static single-page interface: `index.html` bootstraps the UI, `app.js` holds all logic, and `styles.css` defines the visual system. Keep new scripts modular by grouping helpers near related features inside `app.js` and add short comments for complex blocks. Store additional assets (icons, fonts, exports) in a new `assets/` directory at the repo root to keep the top level tidy.

## Build, Test, and Development Commands
- `open index.html` (macOS) or double-click the file to run the app locally—no build step required.
- `python3 -m http.server 8000` from the repo root serves the project for mobile testing; navigate to `http://<your-ip>:8000/index.html` on the device.
- `rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Local\ Storage` *(opt-in)* clears cached data between manual test cycles.

## Coding Style & Naming Conventions
JavaScript uses modern browser APIs, `const`/`let`, and 2-space indentation. Use camelCase for variables and functions, uppercase snake case for shared constants, and keep functions pure where possible. Guard new DOM selectors behind the `$`/`$$` helpers for consistency. In CSS, prefer existing custom properties, maintain 2-space indentation, and follow the utility-first naming already in `styles.css`.

## Testing Guidelines
No automated tests exist yet; rely on manual verification in a modern Chromium or WebKit browser. After each change, add a few entries, adjust start times, switch days, and confirm totals/export CSV output. Use DevTools > Application > Storage to inspect `localStorage` keys (`ts:YYYY-MM-DD`, `ts:meta`) and ensure migrations remain backward compatible.

## Commit & Pull Request Guidelines
Follow the imperative, title-case style seen in history (e.g., “Defer Start-Time Resorting”). Keep subjects under ~50 characters and expand details in the body if needed. PRs should describe the intent, list manual test steps, and include screenshots or short screen captures for UI changes. Link issues when available and call out data migrations or breaking changes explicitly.

## Local Storage & Configuration Tips
Avoid bundlers or service workers unless the offline workflow still functions without configuration. When introducing new stored values, namespace them under the `ts:` prefix and supply a migration path that preserves existing user data.
