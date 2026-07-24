/**
 * Read-only client for unity-api's /v2/broadcasts endpoint.
 *
 * The broadcast payload's `dma_list` is the EFFECTIVE value —
 * Broadcast#dma_list resolves the broadcast override → publisher fallback
 * (unity-api/app/models/broadcast.rb:489-494). Empty means no restriction.
 * So the reconciler just enumerates broadcasts and reads dma_list; no
 * separate publisher-join step required.
 *
 * Read endpoints on v2 are anonymous — no credential threaded through.
 */

const DEFAULT_PAGE_SIZE = 1000;

async function fetchPage(baseUrl, page, perPage) {
    const url = `${baseUrl}/v2/broadcasts?page=${page}&per_page=${perPage}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`unity-api ${res.status} on ${url}`);
    }
    return res.json();
}

/**
 * Walk /v2/broadcasts and yield { key, dma_list } for every broadcast
 * that has a non-empty dma_list. Absent dma_list = broadcast is not
 * subject to a blackout rule.
 */
async function* iterateBlackoutBroadcasts(baseUrl, perPage = DEFAULT_PAGE_SIZE) {
    let page = 1;
    while (true) {
        const body = await fetchPage(baseUrl, page, perPage);
        const broadcasts = Array.isArray(body) ? body : (body.broadcasts || body.data || []);
        if (broadcasts.length === 0) return;

        for (const b of broadcasts) {
            if (b.dma_list && Array.isArray(b.dma_list) && b.dma_list.length > 0) {
                yield { key: b.key, dma_list: b.dma_list };
            }
        }

        if (broadcasts.length < perPage) return;
        page += 1;
    }
}

module.exports = { iterateBlackoutBroadcasts, fetchPage };
