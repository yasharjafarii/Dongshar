import test from "node:test";
import assert from "node:assert/strict";
import {
  minor,
  split,
  balances,
  simplify,
  nextDate,
} from "../public/ledger.js";
test("Persian and Arabic digits parse exactly, with no floating money", () => {
  assert.equal(minor("۱۲۳٬۴۵۶", "IRT"), 123456);
  assert.equal(minor("١٢٫٣٤", "USD"), 1234);
  assert.throws(() => minor("1.001", "USD"));
  assert.throws(() => minor("-1"));
  assert.throws(() => minor("1e9"));
});
test("Remainders are allocated deterministically and preserve the sum", () => {
  assert.deepEqual(
    split(100, "equal", [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
      { id: "c", value: 1 },
    ]).map((x) => x.value),
    [34, 33, 33],
  );
  for (let n = 1; n < 1000; n++) {
    const result = split(n, "shares", [
      { id: "a", value: 3 },
      { id: "b", value: 7 },
      { id: "c", value: 1 },
    ]);
    assert.equal(
      result.reduce((s, x) => s + x.value, 0),
      n,
    );
  }
});
test("Unequal and percentage splits validate totals and membership uniqueness", () => {
  assert.throws(() => split(100, "exact", [{ id: "a", value: 99 }]));
  assert.throws(() => split(100, "percent", [{ id: "a", value: 99 }]));
  assert.throws(() => split(100, "shares", [{ id: "a", value: 0 }]));
  assert.throws(() =>
    split(100, "equal", [
      { id: "a", value: 1 },
      { id: "a", value: 1 },
    ]),
  );
  assert.deepEqual(
    split(101, "percent", [
      { id: "a", value: 25 },
      { id: "b", value: 75 },
    ]).map((x) => x.value),
    [25, 76],
  );
});
test("Multiple payers and settlements reconcile, currencies stay separate", () => {
  const expenses = [
    {
      amount: 100,
      currency: "IRT",
      payers: [
        { id: "a", value: 70 },
        { id: "b", value: 30 },
      ],
      allocations: [
        { id: "a", value: 25 },
        { id: "b", value: 25 },
        { id: "c", value: 50 },
      ],
    },
    {
      amount: 10,
      currency: "USD",
      payers: [{ id: "c", value: 10 }],
      allocations: [{ id: "a", value: 10 }],
    },
  ];
  const b = balances(expenses);
  assert.deepEqual(b, { IRT: { a: 45, b: 5, c: -50 }, USD: { c: 10, a: -10 } });
  const payments = simplify(b.IRT).map((x) => ({ ...x, currency: "IRT" }));
  assert.deepEqual(balances(expenses, payments).IRT, { a: 0, b: 0, c: 0 });
});
test("Debt simplification preserves every balance over many varied ledgers", () => {
  for (let k = 1; k < 100; k++) {
    const b = { a: k * 13, b: -k * 7, c: k * 3, d: -k * 9 };
    const p = simplify(b);
    const result = { ...b };
    for (const t of p) {
      result[t.sender] += t.amount;
      result[t.receiver] -= t.amount;
    }
    assert.ok(Object.values(result).every((n) => n === 0));
    assert.ok(p.length <= 3);
  }
});
test("Monthly and weekly recurrence handle leap years and year rollover", () => {
  assert.equal(nextDate("2024-01-31", "monthly"), "2024-02-29");
  assert.equal(nextDate("2025-01-31", "monthly"), "2025-02-28");
  assert.equal(nextDate("2025-12-28", "weekly"), "2026-01-04");
  assert.equal(nextDate("2025-12-31", "monthly"), "2026-01-31");
});
