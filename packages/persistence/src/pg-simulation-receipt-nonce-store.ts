import type pg from "pg";

/**
 * Records the first use of a simulation receipt nonce.
 * A repeated receipt id and nonce inserts nothing and is rejected.
 */
export class PgSimulationReceiptNonceStore {
  constructor(private readonly pool: pg.Pool) {}

  async consume(receiptId: string, nonce: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO sint_simulation_receipt_nonces (receipt_id, nonce)
       VALUES ($1, $2)
       ON CONFLICT (receipt_id, nonce) DO NOTHING
       RETURNING receipt_id`,
      [receiptId, nonce],
    );
    return result.rows.length > 0;
  }
}
