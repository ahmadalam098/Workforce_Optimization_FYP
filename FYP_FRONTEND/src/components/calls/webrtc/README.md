# Calls: audio / video with WebRTC

How a call works (read in this order):

1. `services/calls/callsService.js` - the REST API: who I may call, start a call, history. The API (`CallService.cs`) decides every rule
   (an employee may only call an organization they are allocated to, its manager and so on).
2. `FYP_CHAT/src/calls.js` - the socket server: ringing (`call:invite`, `call:answer`, `call:end`, the manager's `call:cut`) and the opaque
   relay `call:signal` that carries the WebRTC offer / answer / ICE candidates between the two people of a call.
3. `../CallProvider.jsx` - one socket per portal; keeps the incoming call, the current call and hands each accepted call to a peer session.
4. `peerSession.js` (here) - the real `RTCPeerConnection`: offer / answer / ICE, mute, camera, hang up.
5. `localMedia.js` (here) - `getUserMedia` with fallbacks (no camera -> sound only -> watch only).
6. `iceConfig.js` (here) - the network settings. **No TURN server** (works on one computer or one Wi-Fi). To add TURN later, add the
   `{ urls, username, credential }` entry in `getIceServers()`; nothing else changes.
7. `../CallOverlay.jsx` - incoming / calling / connected screens with the remote and local `<video>`.
8. `../ServeNowPanel.jsx` - the employee's "Serving now" panel: one button per allocated organization that turns the video on.
9. `monitorLink.js` (here) - a manager watching a live call: the employee browser opens a second connection and sends both sides to the manager (chat events `call:watch`, `call:watch-signal`); shown side by side (employee | organization) in Performance Monitoring > Session viewer > Watch live. Watch only. If the direct connection fails within 8 s, still pictures are sent through the chat server instead (`call:watch-frame`).

Pages that start calls: employee Calls ("Serving now" + contacts), organization Live Team, manager Calls, manager Performance Monitoring
(live calls, cut a call).

Browsers only give the camera / microphone to `https://` pages and `http://localhost`. To test on two devices over Wi-Fi, serve the site
over https (for example Vite with a self-signed certificate) or use two browser windows on one computer.
