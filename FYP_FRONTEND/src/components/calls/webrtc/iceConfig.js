// The ICE (network path) settings of every call.
//
// NO TURN SERVER on purpose. With an empty list the two browsers connect directly through their own "host" addresses, which works on one computer
// and on one Wi-Fi / LAN (the way this project is tested). Two people on different networks behind strict firewalls would need a TURN relay;
// that can be added later in this one file (see README.md in this folder) and nothing else changes.
//
// Optional: VITE_STUN_URLS="stun:host:3478,stun:other:3478" in FYP_FRONTEND/.env adds STUN servers (they only discover the public address; they
// relay nothing). Left empty by default.

export function getIceServers() {
  const raw = import.meta.env?.VITE_STUN_URLS ?? ''
  const urls = String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('stun:'))
  return urls.length ? [{ urls }] : []
}

export const peerConfiguration = () => ({ iceServers: getIceServers() })
