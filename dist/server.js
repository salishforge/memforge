// MemForge Standalone — Express REST API server
//
// Routes:
//   POST   /memory/:agentId/add
//   GET    /memory/:agentId/query?q=<text>[&limit=<n>]
//   POST   /memory/:agentId/consolidate
//   GET    /memory/:agentId/stats
//   GET    /health
import express from 'express';
import { MemoryManager } from './memory-manager.js';
import { closePool } from './db.js';
// ─── Bootstrap ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3333', 10);
const manager = new MemoryManager({
    databaseUrl: process.env['DATABASE_URL'],
    consolidationBatchSize: parseInt(process.env['CONSOLIDATION_BATCH_SIZE'] ?? '500', 10),
    consolidationThreshold: parseInt(process.env['CONSOLIDATION_THRESHOLD'] ?? '50', 10),
    autoRegisterAgents: process.env['AUTO_REGISTER_AGENTS'] !== 'false',
});
const app = express();
app.use(express.json());
// ─── Helpers ─────────────────────────────────────────────────────────────────
function agentId(req) {
    return req.params['agentId'] ?? '';
}
function ok(res, data) {
    res.json({ ok: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ ok: false, error: message });
}
// ─── Routes ──────────────────────────────────────────────────────────────────
/**
 * GET /health
 * Returns 200 when the server is up.
 */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});
/**
 * POST /memory/:agentId/add
 * Body: { content: string, metadata?: object }
 */
app.post('/memory/:agentId/add', async (req, res) => {
    const { content, metadata } = req.body;
    if (!content || typeof content !== 'string') {
        fail(res, 400, '"content" (string) is required');
        return;
    }
    try {
        const result = await manager.add(agentId(req), content, metadata ?? {});
        ok(res, result);
    }
    catch (err) {
        const e = err;
        if (e.message.includes('not found') || e instanceof TypeError) {
            fail(res, 400, e.message);
        }
        else {
            fail(res, 500, e.message);
        }
    }
});
/**
 * GET /memory/:agentId/query?q=<text>[&limit=<n>]
 */
app.get('/memory/:agentId/query', async (req, res) => {
    const q = req.query['q'];
    const limit = req.query['limit'];
    if (!q || typeof q !== 'string') {
        fail(res, 400, '"q" query param (string) is required');
        return;
    }
    const limitNum = limit !== undefined ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
        fail(res, 400, '"limit" must be an integer between 1 and 200');
        return;
    }
    try {
        const results = await manager.query(agentId(req), q, limitNum);
        ok(res, results);
    }
    catch (err) {
        fail(res, 500, err.message);
    }
});
/**
 * POST /memory/:agentId/consolidate
 * Body: {} (no params required)
 */
app.post('/memory/:agentId/consolidate', async (req, res) => {
    try {
        const result = await manager.consolidate(agentId(req));
        ok(res, result);
    }
    catch (err) {
        const e = err;
        if (e instanceof TypeError) {
            fail(res, 400, e.message);
        }
        else {
            fail(res, 500, e.message);
        }
    }
});
/**
 * GET /memory/:agentId/stats
 */
app.get('/memory/:agentId/stats', async (req, res) => {
    try {
        const stats = await manager.stats(agentId(req));
        ok(res, stats);
    }
    catch (err) {
        const e = err;
        if (e.message.includes('not found')) {
            fail(res, 404, e.message);
        }
        else {
            fail(res, 500, e.message);
        }
    }
});
// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('[memforge] unhandled error:', err);
    fail(res, 500, 'Internal server error');
});
// ─── Start ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`[memforge] listening on port ${PORT}`);
});
// Graceful shutdown
async function shutdown(signal) {
    console.log(`[memforge] received ${signal}, shutting down…`);
    server.close(async () => {
        await closePool();
        process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
export { app };
//# sourceMappingURL=server.js.map