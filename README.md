# RoomMuse

RoomMuse is an independent project. It has its own Git repository, npm dependency graph, Docker Compose project, container image, runtime configuration, API process, and persistent data volume. It does not use SavantLearn code, containers, networks, databases, or volumes.

RoomMuse is a camera-first interior design prototype for iPhone. It captures three guided room angles, creates a style concept, and turns an accepted design into a checkable shopping plan with estimated prices and retailer links.

## Test on an iPhone without the App Store

This first build uses Expo Go so it can be tested from Windows without Xcode or App Store deployment.

1. Install **Expo Go** on the iPhone and use Node.js 22 (or Node.js 20.19.4+).
2. Connect the iPhone and computer to the same Wi-Fi network.
3. In PowerShell:

   ```powershell
   cd roommuse
   npm install
   npm start
   ```

4. Scan the QR code with the iPhone camera and open it in Expo Go. If local-network discovery is blocked, run `npm run start:tunnel` instead.

The complete capture, style, acceptance, shopping-list, retailer-link, and saved-plan flow works in demo mode with no API key.

## Enable AI room rendering

The phone never receives the OpenAI API key. A tiny local server performs the image edit.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Find the computer's LAN address with `ipconfig` and set `EXPO_PUBLIC_API_URL`, for example `http://192.168.1.25:8787`.
3. Restart Expo after changing the environment variable.
4. Run the studio in a second terminal with `npm run server`.

The server uses GPT Image 2 to preserve the photographed room geometry while redesigning furnishings and finishes. API usage incurs OpenAI charges.

## Product notes

- Prices in this prototype are clearly labeled estimates and retailer links open current searches; a production release should integrate licensed retailer/catalog APIs for live stock and final prices.
- Guided photos work on any iPhone supported by Expo Go. Apple RoomPlan provides true measured 3D scanning on LiDAR-equipped devices, but it requires a native Swift/Xcode development build and cannot run inside Expo Go.
- For a production iOS build, use an Expo development build or migrate the capture screen to a native RoomPlan module, then distribute privately through Xcode device install, Ad Hoc distribution, or TestFlight.

## Run the isolated container

From this directory, run `docker compose up --build`. Compose creates only the `roommuse-studio` container and the dedicated `roommuse_data` volume. The API listens on port 8787 and exposes `GET /health`. RoomMuse's current persistence is a private JSON/document store in that volume; it does not connect to SavantLearn PostgreSQL or any other database service.


