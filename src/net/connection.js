import { Client } from 'colyseus.js';

export async function createRoom(serverUrl, cls, name, maxPlayers) {
  const client = new Client(serverUrl);
  const room = await client.create('game', { cls, name });
  if (maxPlayers) room.send('setMaxPlayers', { max: maxPlayers });
  return { room, state: room.state };
}

export async function joinRoom(serverUrl, roomId, cls, name) {
  const client = new Client(serverUrl);
  const room = await client.joinById(roomId, { cls, name });
  return { room, state: room.state };
}

export function sendMove(room, x, y) {
  room.send('move', { x, y });
}
export function kickPlayer(room, sessionId) {
  room.send('kick', { sessionId });
}
export function setMaxPlayers(room, max) {
  room.send('setMaxPlayers', { max });
}
export function startGame(room) {
  room.send('startGame');
}
export function chooseLevelUp(room, index) {
  room.send('chooseLevelUp', { index });
}
export function sendDash(room) {
  room.send('dash');
}
