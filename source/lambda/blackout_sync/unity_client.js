/**
 * Read-only client for unity-api's /v2/broadcasts endpoint.
 *
 * The broadcast payload's `dma_list` is the EFFECTIVE value —
 * Broadcast#dma_list resolves the broadcast override → publisher fallback
 * (unity-api/app/models/broadcast.rb:489-494). Absent/empty means no
 * restriction.
 *
 * Read endpoints on v2 are anonymous — no credential threaded through.
 *
 * Scan window: bounded by `startTimeGteIso` — the reconciler only cares
 * about broadcasts that could plausibly be served through the CDN
 * (live + upcoming + very-recent VOD). Historical archives are out of
 * scope; their KVS entries (if any) persist until manually pruned.
 *
 * Sends `?start_time_gte=<iso>` server-side (pending unity-api change to
 * respect the param — VID-3459 has a companion PR). If unity-api ignores
 * the param today, the client-side filter still enforces the window
 * correctly, just at the cost of paginating the full table.
 */

const DEFAULT_PAGE_SIZE = 1000;

async function fetchPage(baseUrl, page, perPage, startTimeGteIso) {
    const url = new URL(`${baseUrl}/v2/broadcasts`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    if (startTimeGteIso) {
        url.searchParams.set("start_time_gte", startTimeGteIso);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`unity-api ${res.status} on ${url}`);
    }
    return res.json();
}

/**
 * Walk /v2/broadcasts within the scan window and yield every broadcast
 * seen (regardless of dma_list). Callers decide whether to consider
 * each broadcast for KVS write based on its dma_list.
 *
 * Yields: { key, dma_list } — dma_list may be empty/absent.
 */
async function* iterateBroadcasts(baseUrl, startTimeGteIso, perPage = DEFAULT_PAGE_SIZE) {
    const cutoff = startTimeGteIso ? new Date(startTimeGteIso).getTime() : null;
    let page = 1;
    while (true) {
        const body = await fetchPage(baseUrl, page, perPage, startTimeGteIso);
        const broadcasts = Array.isArray(body) ? body : (body.broadcasts || body.data || []);
        if (broadcasts.length === 0) return;

        for (const b of broadcasts) {
            // Client-side filter — belt-and-suspenders in case unity-api
            // ignores start_time_gte until the companion PR lands. Skips
            // broadcasts without a parseable start_time (very old records).
            if (cutoff !== null && b.start_time) {
                const startMs = new Date(b.start_time).getTime();
                if (Number.isFinite(startMs) && startMs < cutoff) continue;
            }
            yield { key: b.key, dma_list: b.dma_list };
        }

        if (broadcasts.length < perPage) return;
        page += 1;
    }
}

module.exports = { iterateBroadcasts, fetchPage };
