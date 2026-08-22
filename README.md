# RoomMuse

RoomMuse is an independent project. It has its own Git repository, npm dependency graph, Docker Compose project, container image, runtime configuration, API process, and persistent data volume. It does not use SavantLearn code, containers, networks, databases, or volumes.

RoomMuse is a camera-first interior design prototype for iPhone and iPad. It captures three guided room photos or a short room video, creates a style concept, and turns an accepted design into a room-grounded shopping plan with budget-specific alternatives.

## Start the app

Use the dedicated startup script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-roommuse.ps1
```

That script starts the RoomMuse API plus Expo/Metro and advertises a stable name on the local network. Users connected to the same Wi-Fi can open:

```text
http://roommuse.local:8081
```

For native camera testing in Expo Go, use `exp://roommuse.local:8081`. The startup output also prints the current IP-based addresses as fallbacks for networks that block multicast DNS. No router or per-device hosts-file changes are required on networks that permit standard mDNS traffic.

If you want tunnel mode instead of LAN mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-roommuse.ps1 -Tunnel
```

## Test on an iPhone without the App Store

This first build uses Expo Go so it can be tested from Windows without Xcode or App Store deployment.

1. Install **Expo Go** on the iPhone and use Node.js 22 (or Node.js 20.19.4+).
2. Connect the iPhone and computer to the same Wi-Fi network.
3. Run the startup script:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start-roommuse.ps1
   ```

4. In Expo Go, open `exp://roommuse.local:8081`. Use this native Expo URL for camera and video testing; the plain `http://roommuse.local:8081` web URL is intended for desktop viewing and mobile browsers may block camera access on non-HTTPS LAN pages.
5. If local-network discovery is blocked, rerun the script with `-Tunnel` and use the tunnel link printed by Expo.

Camera capture and the interface can be explored without an API key, but demo projects use clearly non-personalized sample data. A room-grounded design and shopping list require the local AI server configured below.

## Let someone else test it from their phone

Testers do not need to be on your Wi-Fi, but they do need the studio to be reachable — and the
studio holds your OpenAI key, so it must be locked before it is exposed. The script refuses to
tunnel without a token for exactly that reason.

1. **Set a token.** Add one long random value to `.env`:

   ```
   ROOMMUSE_API_TOKEN=<a long random string>
   ```

   It is a door key for the studio, not a user password. It is baked into the build the tester
   loads, sent as `Authorization: Bearer`, compared in constant time, and never logged.

2. **Expose the API over HTTPS.** In a second terminal:

   ```
   cloudflared tunnel --url http://localhost:3201
   ```

   HTTPS is not optional. Browsers only allow the camera, the share sheet and the clipboard in a
   secure context, which is why those appear broken when the app is opened over `http://` on a LAN
   address.

3. **Start everything, pointing the app at the tunnel:**

   ```
   powershell -ExecutionPolicy Bypass -File scripts\start-roommuse.ps1 -Tunnel -ApiPublicUrl https://<name>.trycloudflare.com
   ```

   Send the tester the Expo link the script prints. Your machine has to stay awake and online for
   the whole session: the tunnel and the studio both run on it.

**What the token does and does not do.** Every `/api` route requires it; `/health` stays open so a
tester can check the studio is up. The AI routes are additionally capped per device per hour
(`ROOMMUSE_HOURLY_LIMIT`, 40 by default), so a leaked link cannot run up a bill unattended. Restrict
browser origins with `ROOMMUSE_ALLOWED_ORIGINS` if you need to.

**Rotating or revoking access:** change `ROOMMUSE_API_TOKEN`, restart the server, and rebuild. Every
existing tester build stops working immediately.

**What this is not.** It is a good way to put the app in a few hands today, not a way to ship it. A
real distribution needs the API hosted rather than tunnelled from your desk, and a TestFlight or EAS
build rather than Expo Go. The prerequisites for that are not in place yet: there is no `eas.json`,
and `app.json` has no `owner`, no `extra.eas.projectId` and no `android` block.

## Enable AI room rendering

The phone never receives the OpenAI API key. A tiny local server performs the image edit.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. The startup script automatically uses the current LAN address and starts the local API server.
3. If the repo stays inside OneDrive, keep `ROOMMUSE_DATA_DIR` pointed at a local writable path such as `%LOCALAPPDATA%\RoomMuse\storage`.
4. Restart Expo after changing the environment variable.
5. The startup script already starts the API server for you.

The server uses GPT Image 2 to preserve the photographed room geometry while redesigning furnishings and finishes. API usage incurs OpenAI charges.

## Product notes

- Live shopping plans contain only retailer product pages whose price and availability passed the server's citation and direct-link verification gates. Unknown or unverifiable values remain absent rather than being estimated.
- Guided photos work on any iPhone supported by Expo Go. Apple RoomPlan provides true measured 3D scanning on LiDAR-equipped devices, but it requires a native Swift/Xcode development build and cannot run inside Expo Go.
- For a production iOS build, use an Expo development build or migrate the capture screen to a native RoomPlan module, then distribute privately through Xcode device install, Ad Hoc distribution, or TestFlight.

## Run the isolated container

From this directory, run `docker compose up --build`. Compose creates only the `roommuse-studio` container and the dedicated `roommuse_data` volume. The API listens on port 3201 and exposes `GET /health`. RoomMuse's current persistence is a private JSON/document store in that volume; it does not connect to SavantLearn PostgreSQL or any other database service.
