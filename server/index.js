import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';

const app = express();
app.get('/healthz', (_req, res) => res.send('ok'));

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: createServer(app) });

gameServer.listen(port);
console.log(`Project ARC server listening on ${port}`);
