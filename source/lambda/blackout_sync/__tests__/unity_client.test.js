const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { iterateBroadcasts } = require("../unity_client");

let server;
let baseUrl;
let handler = () => ({ status: 200, body: [] });
let lastQuery;

before(() => new Promise((resolve) => {
    server = http.createServer((req, res) => {
        lastQuery = new URL(req.url, "http://x").searchParams;
        const { status, body } = handler(req);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
        const { address, port } = server.address();
        baseUrl = `http://${address}:${port}`;
        resolve();
    });
}));

after(() => new Promise((resolve) => server.close(resolve)));

test("iterate: yields every broadcast seen — no client-side dma_list filter", async () => {
    handler = () => ({
        status: 200,
        body: [
            { key: "a", start_time: "2030-01-01T00:00:00Z", dma_list: [512, 523] },
            { key: "b", start_time: "2030-01-01T00:00:00Z" },
            { key: "c", start_time: "2030-01-01T00:00:00Z", dma_list: [] },
        ],
    });
    const out = [];
    for await (const b of iterateBroadcasts(baseUrl, null, null, 100)) {
        out.push(b);
    }
    assert.equal(out.length, 3, "all broadcasts yielded regardless of dma_list state");
    assert.deepEqual(out.map(b => b.key), ["a", "b", "c"]);
});

test("iterate: paginates until short page", async () => {
    let callCount = 0;
    handler = () => {
        callCount += 1;
        if (callCount === 1) {
            return { status: 200, body: Array.from({ length: 3 }, (_, i) => ({ key: `p1-${i}`, start_time: "2030-01-01T00:00:00Z" })) };
        }
        if (callCount === 2) {
            return { status: 200, body: [{ key: "p2-0", start_time: "2030-01-01T00:00:00Z" }] };
        }
        return { status: 200, body: [] };
    };
    const out = [];
    for await (const b of iterateBroadcasts(baseUrl, null, null, 3)) {
        out.push(b);
    }
    assert.equal(out.length, 4);
    assert.equal(callCount, 2, "should stop when page returns fewer than per_page items");
});

test("iterate: sends start_time_gte AND start_time_lte in query string", async () => {
    handler = () => ({ status: 200, body: [] });
    const gte = "2026-07-24T00:00:00.000Z";
    const lte = "2026-08-23T00:00:00.000Z";
    // eslint-disable-next-line no-unused-vars
    for await (const _ of iterateBroadcasts(baseUrl, gte, lte, 100)) { /* noop */ }
    assert.equal(lastQuery.get("start_time_gte"), gte);
    assert.equal(lastQuery.get("start_time_lte"), lte);
});

test("iterate: client-side filter drops broadcasts outside the gte cutoff", async () => {
    handler = () => ({
        status: 200,
        body: [
            { key: "past", start_time: "2020-01-01T00:00:00Z", dma_list: [512] },
            { key: "future", start_time: "2030-01-01T00:00:00Z", dma_list: [523] },
        ],
    });
    const out = [];
    for await (const b of iterateBroadcasts(baseUrl, "2026-01-01T00:00:00Z", null, 100)) {
        out.push(b);
    }
    assert.equal(out.length, 1);
    assert.equal(out[0].key, "future");
});

test("iterate: client-side filter drops broadcasts past the lte cutoff", async () => {
    handler = () => ({
        status: 200,
        body: [
            { key: "in_window", start_time: "2026-08-01T00:00:00Z", dma_list: [512] },
            { key: "far_future", start_time: "2030-01-01T00:00:00Z", dma_list: [523] },
        ],
    });
    const out = [];
    for await (const b of iterateBroadcasts(baseUrl, null, "2026-08-31T00:00:00Z", 100)) {
        out.push(b);
    }
    assert.equal(out.length, 1);
    assert.equal(out[0].key, "in_window");
});

test("iterate: throws on non-2xx", async () => {
    handler = () => ({ status: 500, body: { error: "boom" } });
    await assert.rejects(async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _ of iterateBroadcasts(baseUrl, null, null, 100)) { /* noop */ }
    }, /unity-api 500/);
});
