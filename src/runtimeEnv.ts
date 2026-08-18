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

/**
 * The shared secret this build presents to the studio (F21).
 *
 * Baked in at build time like the API URL. It is not a user credential and grants nothing but access
 * to the studio that issued it — its job is to stop a tunnelled URL becoming an open, unauthenticated
 * proxy to someone's OpenAI key. Empty when the studio is running open on a LAN.
 */
export const API_TOKEN = (process.env.EXPO_PUBLIC_API_TOKEN ?? "").trim();

/** Headers every studio request carries. Merge into fetch init rather than hand-rolling per call. */
export const apiHeaders = (extra: Record<string, string> = {}): Record<string, string> =>
  API_TOKEN ? { ...extra, Authorization: "Bearer " + API_TOKEN } : { ...extra };

/** The `?demo=` route on web, or null anywhere `window.location` is unavailable. Never throws. */
export function demoRoute(): string | null {
  const search = browserLocation()?.search;
  return typeof search === "string" ? new URLSearchParams(search).get("demo") : null;
}
