import { validateOverrides } from '../src/data/liveConfig.js';

// Split out from server/index.js so these two routes are testable via a
// bare Express app + a stub store, without booting a real Colyseus server
// in every test run.
export function attachConfigRoutes(app, liveConfig) {
  app.get('/config', (_req, res) => res.json(liveConfig.getOverrides()));
  app.post('/config', async (req, res) => {
    if (!process.env.EDITOR_PASSWORD || req.get('x-editor-password') !== process.env.EDITOR_PASSWORD) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const err = validateOverrides(req.body);
    if (err) return res.status(400).json({ error: err });
    const result = await liveConfig.setOverrides(req.body);
    res.json(result);
  });
}
