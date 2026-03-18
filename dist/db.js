// MemForge Standalone — PostgreSQL connection pool
import { Pool } from 'pg';
let _pool = null;
export function getPool(databaseUrl) {
    if (_pool)
        return _pool;
    const url = databaseUrl ?? process.env['DATABASE_URL'];
    if (!url) {
        throw new Error('DATABASE_URL is required (set in env or pass to getPool())');
    }
    const config = {
        connectionString: url,
        max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    };
    _pool = new Pool(config);
    _pool.on('error', (err) => {
        console.error('[memforge] pool error:', err.message);
    });
    return _pool;
}
/** Call once on shutdown to drain the pool cleanly. */
export async function closePool() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}
//# sourceMappingURL=db.js.map