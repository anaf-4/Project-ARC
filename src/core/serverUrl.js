// Single source of truth for the multiplayer server's address — used both
// for the Colyseus websocket connection (ui/lobby.js) and for the plain
// HTTP /config endpoint (main.js's boot-time live-balance fetch).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';
export const CONFIG_URL = SERVER_URL.replace(/^ws/, 'http') + '/config';
