# RoomMuse

RoomMuse is an independent project. It has its own Git repository, npm dependency graph, Docker Compose project, container image, runtime configuration, API process, and persistent data volume. It does not use SavantLearn code, containers, networks, databases, or volumes.

RoomMuse is a camera-first interior design prototype for iPhone and iPad. It captures three guided room photos or a short room video, creates a style concept, and turns an accepted design into a room-grounded shopping plan with budget-specific alternatives.

## Start the app

Use the dedicated startup script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-roommuse.ps1
```

That script starts the RoomMuse API plus Expo/Metro and advertises a stable mDNS name on the local network. Users connected to the same Wi-Fi can use:

```text
http://roommuse.local:8081
```

For native camera testing in Expo Go, use:

```text
exp://roommuse.local:8081
```

The startup output also prints the current IP-based URLs as fallbacks for networks that block multicast DNS. No router or per-device hosts-file changes are required on networks that permit standard mDNS traffic.

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

## Enable AI room rendering

The phone never receives the OpenAI API key. A tiny local server performs the image edit.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. The startup script automatically uses the current LAN address and starts the local API server.
3. If the repo stays inside OneDrive, keep `ROOMMUSE_DATA_DIR` pointed at a local writable path such as `%LOCALAPPDATA%\RoomMuse\storage`.
4. Restart Expo after changing the environment variable.
5. The startup script already starts the API server for you.

The server uses GPT Image 2 to preserve the photographed room geometry while redesigning furnishings and finishes. API usage incurs OpenAI charges.

## Product notes

- Prices in this prototype are clearly labeled estimates and retailer links open current searches; a production release should integrate licensed retailer/catalog APIs for live stock and final prices.
- Guided photos work on any iPhone supported by Expo Go. Apple RoomPlan provides true measured 3D scanning on LiDAR-equipped devices, but it requires a native Swift/Xcode development build and cannot run inside Expo Go.
- For a production iOS build, use an Expo development build or migrate the capture screen to a native RoomPlan module, then distribute privately through Xcode device install, Ad Hoc distribution, or TestFlight.

## Run the isolated container

From this directory, run `docker compose up --build`. Compose creates only the `roommuse-studio` container and the dedicated `roommuse_data` volume. The API listens on port 3201 and exposes `GET /health`. RoomMuse's current persistence is a private JSON/document store in that volume; it does not connect to SavantLearn PostgreSQL or any other database service.
