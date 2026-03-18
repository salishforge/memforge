import { Pool } from 'pg';
export declare function getPool(databaseUrl?: string): Pool;
/** Call once on shutdown to drain the pool cleanly. */
export declare function closePool(): Promise<void>;
//# sourceMappingURL=db.d.ts.map