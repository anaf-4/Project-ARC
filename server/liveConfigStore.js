import { applyLiveOverrides, validateOverrides } from '../src/data/liveConfig.js';

const rawUrl = (repo, branch) => `https://raw.githubusercontent.com/${repo}/${branch}/live-config.json`;
const contentsUrl = (repo, branch) => `https://api.github.com/repos/${repo}/contents/live-config.json?ref=${branch}`;

// fetchImpl defaults to the real global fetch (Node 18+) but is injectable
// so tests never make a real network call.
export function createLiveConfigStore({
  repo = 'anaf-4/Project-ARC',
  branch = 'live-config',
  githubToken = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
} = {}) {
  let current = {};

  async function boot() {
    try {
      const res = await fetchImpl(rawUrl(repo, branch));
      if (!res.ok) return; // e.g. 404 — the branch/file doesn't exist yet on a fresh repo
      const json = await res.json();
      if (validateOverrides(json)) return; // stale/malformed — ignore rather than half-apply
      current = json;
      applyLiveOverrides(current);
    } catch {
      // offline / GitHub unreachable at boot — keep pure tables.js defaults
    }
  }

  function getOverrides() { return current; }

  // Applies in-memory immediately regardless of GitHub outcome, then
  // best-effort commits to the live-config branch for durability across a
  // future redeploy. The caller (server/configRoutes.js) surfaces
  // commitError to the editor so a durability failure is never silent.
  async function setOverrides(overrides) {
    current = overrides;
    applyLiveOverrides(overrides);
    if (!githubToken) return { committed: false, commitError: 'GITHUB_TOKEN not configured' };
    try {
      let sha;
      const getRes = await fetchImpl(contentsUrl(repo, branch), {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
      });
      if (getRes.ok) { const body = await getRes.json(); sha = body.sha; }
      const putRes = await fetchImpl(contentsUrl(repo, branch).replace(/\?ref=.*$/, ''), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          message: 'chore(live-config): sync from editor',
          content: Buffer.from(JSON.stringify(overrides, null, 2)).toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putRes.ok) return { committed: false, commitError: `GitHub API ${putRes.status}` };
      return { committed: true, commitError: null };
    } catch (e) {
      return { committed: false, commitError: e.message };
    }
  }

  return { boot, getOverrides, setOverrides };
}
