// Runtime environment access shared by every client module.
//
// React Native defines `window` but does NOT define `window.location`, so the common
// `typeof window !== "undefined"` guard is not sufficient: reading `window.location.search`
// throws on device. Every access to browser-only globals goes through this module.

const DEFAULT_API_PORT = "3201";

type BrowserLocation = { protocol?: string; hostname?: string; search?: string };

function browserLocation(): BrowserLocation | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { location?: BrowserLocation }).location;
}

function detectedApiBaseUrl(): string {
  const location = browserLocation();
  if (!location?.protocol || !location.hostname) return "";
  return `${location.protocol}//${location.hostname}:${DEFAULT_API_PORT}`;
}

/** Base URL of the RoomMuse API, or "" when it cannot be determined. Never throws. */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? detectedApiBaseUrl()).replace(/\/+$/, "");

/** The `?demo=` route on web, or null anywhere `window.location` is unavailable. Never throws. */
export function demoRoute(): string | null {
  const search = browserLocation()?.search;
  return typeof search === "string" ? new URLSearchParams(search).get("demo") : null;
}
