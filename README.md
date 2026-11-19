# Dillo Dash: Austin

A one-button party runner through Austin. The game goes on a big screen, and up to 4 players join by
scanning a QR code with their phone camera. **No app, no account, no sign-in.**
Spots nobody scans are run by the computer.

## Run it on a laptop (same Wi-Fi)

1. Install Node.js 18 or newer: https://nodejs.org
2. In this folder, run:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000** on the computer that's connected to the TV/projector, then go full screen.
4. Players scan the QR codes. Their phones must be on the **same Wi-Fi** as the computer.

The QR codes automatically use the computer's Wi-Fi address, so phones can reach it.

> If phones can't connect: some guest/corporate Wi-Fi blocks devices from talking to each other.
> Use a phone hotspot or a home router, or deploy online (below).

## Put it online (phones can use cellular data)

Any host that runs Node.js and supports WebSockets will work. Example with **Render**:

1. Put this folder in a GitHub repo.
2. In Render: **New → Web Service** → pick the repo.
3. Build command `npm install`, start command `npm start`.
4. Open the URL Render gives you on the big screen. The QR codes will use that URL.

Railway, Fly.io, Heroku, or your own server work the same way. If you use a custom domain or a proxy
that hides the real address, set the environment variable `PUBLIC_URL` (for example `https://dillo.example.com`).

## Playing

- **Join:** scan the one QR code on the screen. You're randomly given a free armadillo (Brisket, Queso, Tex or Pecan).
  If all four are taken, your phone waits in line and you're put in as soon as someone leaves.
- **Start:** the next race starts 30 seconds after the first player joins. If everyone taps **READY**, it starts in 5.
- **Race:** tap the phone button to hop, hold it for a bigger jump. Cones, scooters and robotaxis trip you up, pits
  send you back, food trucks are platforms, and tacos give you a boost.
- **Between races:** results show for 10 seconds, then the QR screen comes back with a fresh 30-second countdown —
  players can leave or join. Stay on the phone page to keep racing.
- **No keyboard needed** on the TV. Click the screen once after opening it to turn the sound on
  (browsers block sound until someone clicks). Double-click for full screen. **M** mutes.

## Files

- `server.js` — serves the game and relays phone taps to the big screen (WebSockets).
- `public/index.html` (or `index.html`) — the whole game: the big-screen view and the phone controller.
