// ============================================================
// CONSTANTS
// Fixed values shared across the application.
// Import from here rather than hard-coding magic numbers.
// ============================================================

/**
 * Three.js layer index for the SelectiveBloomEffect selection set.
 * Any mesh assigned to this layer will glow; everything else will not.
 */
export const BLOOM_LAYER = 2;

/**
 * Where treeGen() fetches the skill-tree data from.
 *
 * This replaces the two GitHub-raw-text fetches Tree.js used to make.
 * Point it at whatever URL serves nodes.json:
 *   - Local/dev editing (default): a root-absolute path served from
 *     your bundler's static-assets folder. For Vite, that means the
 *     file should live at `public/data/nodes.json` on disk — Vite
 *     serves everything under `public/` unchanged from the site root,
 *     so '/data/nodes.json' resolves correctly both in `npm run dev`
 *     and in the built site.
 *   - Remote hosting: swap this for a raw file URL, e.g.
 *     'https://raw.githubusercontent.com/<user>/<repo>/refs/heads/main/data/nodes.json'
 *     No other code needs to change — treeGen() just fetches + parses
 *     JSON from whatever URL is here.
 */
export const NODE_DATA_URL = '/dist/assets/nodes.json';
