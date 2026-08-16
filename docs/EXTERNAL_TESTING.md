# RoomMuse external mobile testing

These instructions are only for RoomMuse. Testers do not need to be on the same Wi-Fi network as the RoomMuse computer.

## Start RoomMuse for external testers

On the RoomMuse computer:

1. Keep the computer connected to the internet and prevent it from sleeping.
2. Double-click `start-roommuse-external.cmd` in the RoomMuse folder.
3. Alternatively, open PowerShell and run:

   ```powershell
   cd "C:\Users\nnett\OneDrive\Documents\New project\roommuse"
   npm run start:external
   ```

4. Wait for `ROOMMUSE IS READY FOR EXTERNAL MOBILE TESTING`.
5. Send testers the printed `exp://...` Expo Go URL or its QR code.

The launcher starts or verifies the RoomMuse API, starts Expo on RoomMuse's dedicated port `8085`, opens the Expo tunnel, verifies the public app manifest and API health endpoint, and prints the mobile URL. The API is securely proxied through the same Expo tunnel, so testers need only the Expo Go URL.

The RoomMuse computer must remain powered on, awake, connected to the internet, and running the started processes throughout the test. The Expo URL normally remains stable on this computer and port, but always send the URL printed by the current session.

## Instructions to send each tester

1. Install **Expo Go** from the Apple App Store or Google Play Store.
2. Open Expo Go once and allow any requested permissions.
3. Open the complete RoomMuse `exp://...` link sent by the test coordinator.
4. On iPhone or iPad:
   - Tap the link and choose **Open in Expo Go**, or
   - Open the Camera app, scan the supplied QR code, and tap the banner.
5. On Android:
   - Tap the link and choose Expo Go, or
   - In Expo Go, select **Scan QR code** and scan the supplied code.
6. If Expo Go offers **Enter URL manually**, paste the complete `exp://...` link there.
7. Wait for the JavaScript bundle to download. The first launch can take a minute.
8. When RoomMuse asks, allow camera, microphone, and photo-library access.
9. Keep Expo Go open while RoomMuse generates a room design.

## If RoomMuse does not open

1. Confirm the link begins with `exp://` and use the latest link from the coordinator.
2. Force-close Expo Go, reopen it, and enter the link again.
3. Switch between Wi-Fi and cellular data if the current network blocks development tunnels.
4. Confirm with the coordinator that the RoomMuse computer is awake and the external session is still running.
5. Send the coordinator a screenshot, device model, operating-system version, and approximate failure time.

## Testing limitations

- This is a development session, not an App Store or TestFlight installation.
- The coordinator's computer is acting as the RoomMuse server and must remain available.
- Testers should use only the current RoomMuse URL. No SavantLearn, toto-ai-platform, or KasaSavant-public URL is involved.
