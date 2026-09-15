import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom.js';

const app = express();
app.get('/healthz', (_req, res) => res.send('ok'));

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: createServer(app) });
gameServer.define('game', GameRoom);

gameServer.listen(port);
console.log(`Project ARC server listening on ${port}`);
