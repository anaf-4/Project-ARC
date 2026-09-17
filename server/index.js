import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom.js';
import { createLiveConfigStore } from './liveConfigStore.js';
import { attachConfigRoutes } from './configRoutes.js';

const app = express();
app.use(express.json());
app.get('/healthz', (_req, res) => res.send('ok'));

const liveConfig = createLiveConfigStore();
await liveConfig.boot();
attachConfigRoutes(app, liveConfig);

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: createServer(app) });
gameServer.define('game', GameRoom);

gameServer.listen(port);
console.log(`Project ARC server listening on ${port}`);
