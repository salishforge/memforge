import type { MemForgeConfig, AddResult, QueryResult, ConsolidateResult, ClearResult, AgentStats } from './types.js';
export declare class MemoryManager {
    private readonly pool;
    private readonly config;
    constructor(config?: Partial<MemForgeConfig>);
    /**
     * Ensure an agent exists in the registry.
     * Called automatically by add() when autoRegisterAgents is true.
     */
    registerAgent(agentId: string, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Ingest a new event into the hot tier for the given agent.
     *
     * @param agentId   Tenant identifier
     * @param content   Raw text content to store
     * @param metadata  Optional structured metadata
     * @returns         The inserted row's id and timestamp
     */
    add(agentId: string, content: string, metadata?: Record<string, unknown>): Promise<AddResult>;
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
    query(agentId: string, searchText: string, limit?: number): Promise<QueryResult[]>;
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
    consolidate(agentId: string): Promise<ConsolidateResult>;
    /**
     * Archive and clear all hot and warm memory for the given agent.
     *
     * Hot and warm rows are copied to cold_tier before deletion.
     * The agent record itself is preserved.
     *
     * @param agentId   Tenant identifier
     * @returns         Count of rows archived from each tier
     */
    clear(agentId: string): Promise<ClearResult>;
    /**
     * Return live row counts and last-consolidation timestamp for an agent.
     *
     * @param agentId   Tenant identifier
     * @returns         Aggregate stats object
     */
    stats(agentId: string): Promise<AgentStats>;
}
//# sourceMappingURL=memory-manager.d.ts.map