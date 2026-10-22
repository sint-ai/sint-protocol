/** Acknowledge primary persistence before authorization; latch on uncertain delivery. */
import { ok, err, type SintEventType, type Result } from "@pshkv/core";
import type { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import type { LedgerStore } from "@pshkv/persistence";
import type { LedgerEmitter } from "@pshkv/gate-policy-gateway";

export function createPersistedLedgerEmitter(ledger: LedgerWriter, store: LedgerStore): LedgerEmitter {
  let unavailable = false;
  let serial: Promise<unknown> = Promise.resolve();
  return event => {
    const append = async (): Promise<Result<void, string>> => {
      // A rejected/uncertain append must not create a silently gapped chain on
      // recovery. An operator must reconcile persistence and rebuild the context.
      if (unavailable) return err("LEDGER_PERSISTENCE_UNAVAILABLE");
      const written = ledger.append({
        eventType: event.eventType as SintEventType,
        agentId: event.agentId, tokenId: event.tokenId, payload: event.payload,
      });
      return Promise.resolve().then(() => store.append(written)).then(
        () => ok(undefined),
        () => { unavailable = true; return err("LEDGER_PERSISTENCE_UNAVAILABLE"); },
      );
    };
    // Concurrent requests cannot acknowledge a later sequence before an earlier
    // append has settled. The queue continues only to return a latched failure.
    const result = serial.then(append);
    serial = result;
    return result;
  };
}
