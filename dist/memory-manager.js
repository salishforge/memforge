// MemForge Standalone — Core memory-manager API
//
// All operations are scoped by agentId for multi-tenant isolation.
// Every SQL query includes an agent_id predicate — Agent A can never read
// Agent B's memory.
import { Pool } from 'pg';
import { getPool } from './db.js';
const DEFAULTS = {
    databaseUrl: process.env['DATABASE_URL'] ?? '',
    consolidationBatchSize: 500,
    consolidationThreshold: 50,
    autoRegisterAgents: true,
};
export class MemoryManager {
    pool;
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULTS, ...config };
        this.pool = getPool(this.config.databaseUrl || undefined);
    }
    // ─── Agent registration ───────────────────────────────────────────────────
    /**
     * Ensure an agent exists in the registry.
     * Called automatically by add() when autoRegisterAgents is true.
     */
    async registerAgent(agentId, metadata = {}) {
        await this.pool.query(`INSERT INTO agents (id, metadata)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET last_seen = now(), metadata = agents.metadata || $2`, [agentId, JSON.stringify(metadata)]);
    }
    // ─── add ─────────────────────────────────────────────────────────────────
    /**
     * Ingest a new event into the hot tier for the given agent.
     *
     * @param agentId   Tenant identifier
     * @param content   Raw text content to store
     * @param metadata  Optional structured metadata
     * @returns         The inserted row's id and timestamp
     */
    async add(agentId, content, metadata = {}) {
        if (!agentId || typeof agentId !== 'string') {
            throw new TypeError('agentId must be a non-empty string');
        }
        if (!content || typeof content !== 'string') {
            throw new TypeError('content must be a non-empty string');
        }
        if (this.config.autoRegisterAgents) {
            await this.registerAgent(agentId);
        }
        const { rows } = await this.pool.query(`INSERT INTO hot_tier (agent_id, content, metadata)
       VALUES ($1, $2, $3)
       RETURNING id, agent_id, created_at`, [agentId, content, JSON.stringify(metadata)]);
        return rows[0];
    }
    // ─── query ────────────────────────────────────────────────────────────────
    /**
     * Full-text search over the warm tier for the given agent.
     *
     * Results are ranked by PostgreSQL ts_rank_cd (cover density).
     * Falls back to ILIKE if the query contains no FTS-compatible tokens.
     *
     * @param agentId     Tenant identifier
     * @param searchText  Natural-language search query
     * @param limit       Maximum results (default 10)
     * @returns           Ranked warm-tier rows
     */
    async query(agentId, searchText, limit = 10) {
        if (!agentId || typeof agentId !== 'string') {
            throw new TypeError('agentId must be a non-empty string');
        }
        if (!searchText || typeof searchText !== 'string') {
            throw new TypeError('searchText must be a non-empty string');
        }
        // Build a plainto_tsquery for safe FTS (handles arbitrary user input)
        const { rows } = await this.pool.query(`SELECT
         id,
         content,
         metadata,
         consolidated_at,
         ts_rank_cd(content_tsv, plainto_tsquery('english', $2)) AS rank
       FROM warm_tier
       WHERE agent_id = $1
         AND content_tsv @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT $3`, [agentId, searchText, limit]);
        // If FTS finds nothing, fall back to trigram similarity search
        if (rows.length === 0) {
            const fallback = await this.pool.query(`SELECT
           id,
           content,
           metadata,
           consolidated_at,
           similarity(content, $2) AS rank
         FROM warm_tier
         WHERE agent_id = $1
           AND content ILIKE $3
         ORDER BY rank DESC
         LIMIT $4`, [agentId, searchText, `%${searchText}%`, limit]);
            return fallback.rows;
        }
        return rows;
    }
    // ─── consolidate ─────────────────────────────────────────────────────────
    /**
     * Move unconsolidated hot-tier events into the warm tier for the given agent.
     *
     * Hot rows are grouped into batches and written to warm_tier with a combined
     * content blob. The original hot rows are then deleted (their IDs are stored
     * in warm_tier.source_hot_ids for traceability).
     *
     * Runs inside a transaction — either all rows are consolidated or none are.
     *
     * @param agentId   Tenant identifier
     * @returns         Summary of the consolidation run
     */
    async consolidate(agentId) {
        if (!agentId || typeof agentId !== 'string') {
            throw new TypeError('agentId must be a non-empty string');
        }
        const client = await this.pool.connect();
        let runId = BigInt(0);
        try {
            await client.query('BEGIN');
            // Create audit log row
            const logRow = await client.query(`INSERT INTO consolidation_log (agent_id) VALUES ($1) RETURNING id`, [agentId]);
            runId = logRow.rows[0].id;
            // Fetch all pending hot-tier rows for this agent (ordered oldest-first)
            const hotRows = await client.query(`SELECT id, content, metadata, created_at
         FROM hot_tier
         WHERE agent_id = $1
         ORDER BY created_at ASC
         LIMIT $2`, [agentId, this.config.consolidationBatchSize]);
            if (hotRows.rows.length === 0) {
                // Nothing to do — close run successfully
                await client.query(`UPDATE consolidation_log
           SET status = 'complete', completed_at = now(), hot_rows_processed = 0, warm_rows_created = 0
           WHERE id = $1`, [runId]);
                await client.query('COMMIT');
                return {
                    run_id: runId,
                    agent_id: agentId,
                    hot_rows_processed: 0,
                    warm_rows_created: 0,
                    status: 'complete',
                };
            }
            // Produce one warm row per batch of BATCH_SIZE hot rows
            const BATCH_SIZE = 50;
            let warmCreated = 0;
            for (let i = 0; i < hotRows.rows.length; i += BATCH_SIZE) {
                const batch = hotRows.rows.slice(i, i + BATCH_SIZE);
                const combined = batch.map((r) => r.content).join('\n\n---\n\n');
                const ids = batch.map((r) => r.id);
                await client.query(`INSERT INTO warm_tier (agent_id, content, source_hot_ids, metadata)
           VALUES ($1, $2, $3, $4)`, [
                    agentId,
                    combined,
                    ids,
                    JSON.stringify({
                        batch_size: batch.length,
                        oldest: batch[0].created_at,
                        newest: batch[batch.length - 1].created_at,
                    }),
                ]);
                warmCreated++;
            }
            // Delete consolidated hot-tier rows
            const hotIds = hotRows.rows.map((r) => r.id);
            await client.query(`DELETE FROM hot_tier WHERE agent_id = $1 AND id = ANY($2)`, [
                agentId,
                hotIds,
            ]);
            // Finalise audit log
            await client.query(`UPDATE consolidation_log
         SET status = 'complete',
             completed_at = now(),
             hot_rows_processed = $2,
             warm_rows_created = $3
         WHERE id = $1`, [runId, hotRows.rows.length, warmCreated]);
            await client.query('COMMIT');
            return {
                run_id: runId,
                agent_id: agentId,
                hot_rows_processed: hotRows.rows.length,
                warm_rows_created: warmCreated,
                status: 'complete',
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            // Mark run failed if we already created the log row
            if (runId) {
                try {
                    await this.pool.query(`UPDATE consolidation_log
             SET status = 'failed', completed_at = now(), error = $2
             WHERE id = $1`, [runId, err.message]);
                }
                catch {
                    // best-effort
                }
            }
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ─── clear ────────────────────────────────────────────────────────────────
    /**
     * Archive and clear all hot and warm memory for the given agent.
     *
     * Hot and warm rows are copied to cold_tier before deletion.
     * The agent record itself is preserved.
     *
     * @param agentId   Tenant identifier
     * @returns         Count of rows archived from each tier
     */
    async clear(agentId) {
        if (!agentId || typeof agentId !== 'string') {
            throw new TypeError('agentId must be a non-empty string');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Archive hot_tier rows
            const hotResult = await client.query(`WITH moved AS (
           INSERT INTO cold_tier (agent_id, source_table, source_id, content, metadata, original_created_at)
           SELECT agent_id, 'hot_tier', id, content, metadata, created_at
           FROM hot_tier
           WHERE agent_id = $1
           RETURNING source_id
         )
         SELECT count(*) FROM moved`, [agentId]);
            await client.query(`DELETE FROM hot_tier WHERE agent_id = $1`, [agentId]);
            // Archive warm_tier rows
            const warmResult = await client.query(`WITH moved AS (
           INSERT INTO cold_tier (agent_id, source_table, source_id, content, metadata, original_created_at)
           SELECT agent_id, 'warm_tier', id, content, metadata, consolidated_at
           FROM warm_tier
           WHERE agent_id = $1
           RETURNING source_id
         )
         SELECT count(*) FROM moved`, [agentId]);
            await client.query(`DELETE FROM warm_tier WHERE agent_id = $1`, [agentId]);
            await client.query('COMMIT');
            return {
                agent_id: agentId,
                hot_archived: parseInt(hotResult.rows[0].count, 10),
                warm_archived: parseInt(warmResult.rows[0].count, 10),
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ─── stats ────────────────────────────────────────────────────────────────
    /**
     * Return live row counts and last-consolidation timestamp for an agent.
     *
     * @param agentId   Tenant identifier
     * @returns         Aggregate stats object
     */
    async stats(agentId) {
        if (!agentId || typeof agentId !== 'string') {
            throw new TypeError('agentId must be a non-empty string');
        }
        const [hotCount, warmCount, coldCount, lastConsolidation, agent] = await Promise.all([
            this.pool.query(`SELECT count(*) FROM hot_tier WHERE agent_id = $1`, [agentId]),
            this.pool.query(`SELECT count(*) FROM warm_tier WHERE agent_id = $1`, [agentId]),
            this.pool.query(`SELECT count(*) FROM cold_tier WHERE agent_id = $1`, [agentId]),
            this.pool.query(`SELECT completed_at
         FROM consolidation_log
         WHERE agent_id = $1 AND status = 'complete'
         ORDER BY completed_at DESC
         LIMIT 1`, [agentId]),
            this.pool.query(`SELECT last_seen FROM agents WHERE id = $1`, [agentId]),
        ]);
        if (agent.rows.length === 0) {
            throw new Error(`Agent '${agentId}' not found`);
        }
        return {
            agent_id: agentId,
            hot_count: parseInt(hotCount.rows[0].count, 10),
            warm_count: parseInt(warmCount.rows[0].count, 10),
            cold_count: parseInt(coldCount.rows[0].count, 10),
            last_consolidation: lastConsolidation.rows[0]?.completed_at ?? null,
            last_seen: agent.rows[0].last_seen,
        };
    }
}
//# sourceMappingURL=memory-manager.js.map