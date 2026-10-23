import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, importRows, itemized } from "../public/import.js";
test("CSV quoted fields, newlines, BOM and escaped quotes", () => {
  assert.deepEqual(parseCSV('\ufeffa,b\r\n"a,b","x""y"\r\n"two\nlines",z'), [
    ["a", "b"],
    ["a,b", 'x"y'],
    ["two\nlines", "z"],
  ]);
  assert.throws(() => parseCSV('a,"broken'));
});
test("Import resolves real group members and rejects ambiguous or invalid rows", () => {
  const m = [
      { id: "a", name: "الف" },
      { id: "b", name: "ب" },
    ],
    h = "date,title,amount,currency,payer,participants,category\n";
  const r = importRows(h + "2026-01-01,شام,۱۰۰,IRT,a,a|b,food", m);
  assert.equal(r[0].amount, 100);
  assert.equal(r[0].entries.length, 2);
  assert.throws(() => importRows(h + "2026-02-31,شام,100,IRT,a,a|b,food", m));
  assert.throws(() => importRows(h + "2026-01-01,شام,100,IRT,c,a|b,food", m));
});
test("Itemized bill assigns only consumers and distributes extras proportionally", () => {
  const r = itemized(
    [
      { amount: 100, members: ["a", "b"] },
      { amount: 200, members: ["b"] },
    ],
    30,
  );
  assert.equal(r.amount, 330);
  assert.deepEqual(r.entries, [
    { id: "a", value: 55 },
    { id: "b", value: 275 },
  ]);
  assert.throws(() => itemized([{ amount: 10, members: [] }], 0));
});
