// Expo entry point. The application itself lives in src/RoomMuseApp.tsx.
//
// This file previously also contained a complete second, unrendered copy of the UI
// (Home/Capture/StylePicker/Generating/Result/Shopping plus its own stylesheet). It was dead
// from the moment this re-export was added, and was a standing risk of edits being made to the
// wrong screen. Removed in WS-0; recoverable from tag baseline/pre-v2 if ever needed.
export { default } from "./src/RoomMuseApp";
