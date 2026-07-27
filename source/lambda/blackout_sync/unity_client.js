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
 * Scan window is bounded on both sides — start_time_gte alone times out
 * on prod-scale data because NFHS Network schedules months of games in
 * advance and the IN sub-list becomes too large. Sending both bounds
 * keeps the games/events subset small.
 */

const DEFAULT_PAGE_SIZE = 1000;

async function fetchPage(baseUrl, page, perPage, startTimeGteIso, startTimeLteIso) {
    const url = new URL(`${baseUrl}/v2/broadcasts`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    if (startTimeGteIso) {
        url.searchParams.set("start_time_gte", startTimeGteIso);
    }
    if (startTimeLteIso) {
        url.searchParams.set("start_time_lte", startTimeLteIso);
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
async function* iterateBroadcasts(baseUrl, startTimeGteIso, startTimeLteIso, perPage = DEFAULT_PAGE_SIZE) {
    const gteMs = startTimeGteIso ? new Date(startTimeGteIso).getTime() : null;
    const lteMs = startTimeLteIso ? new Date(startTimeLteIso).getTime() : null;
    let page = 1;
    while (true) {
        const body = await fetchPage(baseUrl, page, perPage, startTimeGteIso, startTimeLteIso);
        const broadcasts = Array.isArray(body) ? body : (body.broadcasts || body.data || []);
        if (broadcasts.length === 0) return;

        for (const b of broadcasts) {
            // Client-side filter — belt-and-suspenders in case unity-api's
            // filter is not yet deployed. Skips broadcasts without a
            // parseable start_time (very old records).
            if (b.start_time) {
                const startMs = new Date(b.start_time).getTime();
                if (Number.isFinite(startMs)) {
                    if (gteMs !== null && startMs < gteMs) continue;
                    if (lteMs !== null && startMs > lteMs) continue;
                }
            }
            yield { key: b.key, dma_list: b.dma_list };
        }

        if (broadcasts.length < perPage) return;
        page += 1;
    }
}

module.exports = { iterateBroadcasts, fetchPage };
