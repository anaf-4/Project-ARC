import { Client } from 'colyseus.js';

export async function connect(serverUrl, cls, name) {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate('game', { cls, name });
  return { room, state: room.state };
}

export function sendMove(room, x, y) {
  room.send('move', { x, y });
}
