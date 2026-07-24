const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { iterateBlackoutBroadcasts } = require("../unity_client");

let server;
let baseUrl;
let handler = () => ({ status: 200, body: [] });

before(() => new Promise((resolve) => {
    server = http.createServer((req, res) => {
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

test("iterate: filters out broadcasts without dma_list", async () => {
    handler = () => ({
        status: 200,
        body: [
            { key: "a", dma_list: [512, 523] },
            { key: "b" }, // no dma_list
            { key: "c", dma_list: [] }, // empty
            { key: "d", dma_list: [819] },
        ],
    });
    const out = [];
    for await (const b of iterateBlackoutBroadcasts(baseUrl, 100)) {
        out.push(b);
    }
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(b => b.key), ["a", "d"]);
});

test("iterate: paginates until short page", async () => {
    let callCount = 0;
    handler = () => {
        callCount += 1;
        if (callCount === 1) {
            return { status: 200, body: Array.from({ length: 3 }, (_, i) => ({ key: `p1-${i}`, dma_list: [512] })) };
        }
        if (callCount === 2) {
            return { status: 200, body: [{ key: "p2-0", dma_list: [523] }] };
        }
        return { status: 200, body: [] };
    };
    const out = [];
    for await (const b of iterateBlackoutBroadcasts(baseUrl, 3)) {
        out.push(b);
    }
    assert.equal(out.length, 4);
    assert.equal(callCount, 2, "should stop when page returns fewer than per_page items");
});

test("iterate: throws on non-2xx", async () => {
    handler = () => ({ status: 500, body: { error: "boom" } });
    await assert.rejects(async () => {
        for await (const _ of iterateBlackoutBroadcasts(baseUrl, 100)) { /* noop */ }
    }, /unity-api 500/);
});
