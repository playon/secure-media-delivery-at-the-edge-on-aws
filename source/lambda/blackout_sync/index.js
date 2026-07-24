/**
 * VID-3459 — blackout sync-writer.
 *
 * Every 5 min: enumerate broadcasts from unity-api, filter to non-empty
 * dma_list, reconcile against CloudFront KVS. Idempotent — safe to
 * restart, run twice, crash and retry.
 *
 * Fail-safe: on any error before writes commit, exits without touching
 * KVS so viewers keep enforcing against last-known-good rules.
 */

const { iterateBlackoutBroadcasts } = require("./unity_client");
const { reconcile } = require("./kvs_client");

async function collectDesired(unityBase, perPage) {
    const desired = new Map();
    for await (const b of iterateBlackoutBroadcasts(unityBase, perPage)) {
        desired.set(b.key, b.dma_list.join(","));
    }
    return desired;
}

exports.handler = async (event) => {
    const start = Date.now();
    const kvsArn = process.env.KVS_ARN;
    const unityBase = process.env.UNITY_API_BASE;
    const perPage = parseInt(process.env.PAGE_SIZE || "1000", 10);

    if (!kvsArn) throw new Error("KVS_ARN not set");
    if (!unityBase) throw new Error("UNITY_API_BASE not set");

    console.log(JSON.stringify({ msg: "reconcile_start", unityBase, kvsArn }));

    const desired = await collectDesired(unityBase, perPage);
    console.log(JSON.stringify({ msg: "unity_scan_complete", broadcasts_with_dmas: desired.size }));

    const result = await reconcile(kvsArn, desired);

    const durationMs = Date.now() - start;
    const summary = {
        msg: "reconcile_complete",
        broadcasts_with_dmas: desired.size,
        kvs_puts: result.puts,
        kvs_deletes: result.deletes,
        kvs_batches: result.batches,
        duration_ms: durationMs,
    };
    console.log(JSON.stringify(summary));
    return summary;
};
