const { test } = require("node:test");
const assert = require("node:assert/strict");
const { diff, KEY_PREFIX } = require("../kvs_client");

test("diff: empty existing + empty desired = no ops", () => {
    const { puts, deletes } = diff(new Set(), new Map());
    assert.equal(puts.length, 0);
    assert.equal(deletes.length, 0);
});

test("diff: new broadcasts produce puts", () => {
    const desired = new Map([["abc", "512,523"], ["def", "819"]]);
    const { puts, deletes } = diff(new Set(), desired);
    assert.equal(puts.length, 2);
    assert.deepEqual(puts[0], { Key: KEY_PREFIX + "abc", Value: "512,523" });
    assert.deepEqual(puts[1], { Key: KEY_PREFIX + "def", Value: "819" });
    assert.equal(deletes.length, 0);
});

test("diff: removed broadcasts produce deletes", () => {
    const existing = new Set([KEY_PREFIX + "abc", KEY_PREFIX + "old"]);
    const desired = new Map([["abc", "512"]]);
    const { puts, deletes } = diff(existing, desired);
    assert.equal(puts.length, 1);
    assert.equal(deletes.length, 1);
    assert.deepEqual(deletes[0], { Key: KEY_PREFIX + "old" });
});

test("diff: changed value still produces a put (idempotent overwrite)", () => {
    const existing = new Set([KEY_PREFIX + "abc"]);
    const desired = new Map([["abc", "999"]]);
    const { puts, deletes } = diff(existing, desired);
    assert.equal(puts.length, 1);
    assert.equal(deletes.length, 0);
    assert.equal(puts[0].Value, "999");
});

test("diff: unchanged existing still emits a put (safe — Update is upsert)", () => {
    // We don't compare values against KVS on read (only keys). Every
    // desired broadcast produces a Put every run. Cheap; keeps the
    // reconciler stateless.
    const existing = new Set([KEY_PREFIX + "abc"]);
    const desired = new Map([["abc", "512"]]);
    const { puts, deletes } = diff(existing, desired);
    assert.equal(puts.length, 1);
    assert.equal(deletes.length, 0);
});
