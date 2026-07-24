/**
 * Batched CloudFront KVS reconciliation.
 *
 * Uses UpdateKeysCommand (batch put/delete in one call) instead of
 * per-key PutKey — one ETag fetch + one API call per batch of ~50 ops.
 * Batch size cap set conservatively at 50 to stay under AWS's per-call limit.
 *
 * All operations scoped to the `blackout:` key prefix. Other keys in the
 * KVS (key:default, revoked:*) are untouched.
 */

require("@aws-sdk/signature-v4-crt");

const {
    CloudFrontKeyValueStoreClient,
    DescribeKeyValueStoreCommand,
    ListKeysCommand,
    UpdateKeysCommand,
} = require("@aws-sdk/client-cloudfront-keyvaluestore");

const KEY_PREFIX = "blackout:";
const BATCH_SIZE = 50;

const client = new CloudFrontKeyValueStoreClient({});

async function getEtag(kvsArn) {
    const resp = await client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
    return resp.ETag;
}

async function listBlackoutKeys(kvsArn) {
    const keys = new Set();
    let nextToken;
    do {
        const resp = await client.send(new ListKeysCommand({ KvsARN: kvsArn, NextToken: nextToken }));
        for (const item of resp.Items || []) {
            if (item.Key && item.Key.startsWith(KEY_PREFIX)) {
                keys.add(item.Key);
            }
        }
        nextToken = resp.NextToken;
    } while (nextToken);
    return keys;
}

function diff(existingKeys, desired) {
    const puts = [];
    const deletes = [];
    for (const [broadcastKey, value] of desired) {
        puts.push({ Key: KEY_PREFIX + broadcastKey, Value: value });
    }
    const desiredFullKeys = new Set([...desired.keys()].map(k => KEY_PREFIX + k));
    for (const existing of existingKeys) {
        if (!desiredFullKeys.has(existing)) {
            deletes.push({ Key: existing });
        }
    }
    return { puts, deletes };
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

async function reconcile(kvsArn, desired) {
    const existingKeys = await listBlackoutKeys(kvsArn);
    const { puts, deletes } = diff(existingKeys, desired);

    if (puts.length === 0 && deletes.length === 0) {
        return { puts: 0, deletes: 0, batches: 0 };
    }

    // AWS caps UpdateKeys at 50 ops per call — batch puts + deletes together.
    const ops = [
        ...puts.map(p => ({ type: "put", op: p })),
        ...deletes.map(d => ({ type: "delete", op: d })),
    ];
    const batches = chunk(ops, BATCH_SIZE);

    for (const batch of batches) {
        const etag = await getEtag(kvsArn);
        await client.send(new UpdateKeysCommand({
            KvsARN: kvsArn,
            IfMatch: etag,
            Puts: batch.filter(o => o.type === "put").map(o => o.op),
            Deletes: batch.filter(o => o.type === "delete").map(o => o.op),
        }));
    }

    return { puts: puts.length, deletes: deletes.length, batches: batches.length };
}

module.exports = { reconcile, listBlackoutKeys, diff, KEY_PREFIX };
