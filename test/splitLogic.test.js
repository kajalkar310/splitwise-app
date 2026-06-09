import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  round2,
  computeShares,
  computeBalances,
  simplifyDebts,
} from '../src/splitLogic.js';

test('round2 rounds to two decimals', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.4567), 2.46);
  assert.equal(round2(10), 10);
});

test('computeShares splits equally and sums to total', () => {
  const shares = computeShares(100, ['a', 'b', 'c'], 'equal');
  const sum = Object.values(shares).reduce((s, v) => s + v, 0);
  assert.equal(round2(sum), 100);
  // remainder lands on last participant
  assert.equal(shares.a, 33.33);
  assert.equal(shares.b, 33.33);
  assert.equal(shares.c, 33.34);
});

test('computeShares handles exact splits that sum correctly', () => {
  const shares = computeShares(50, ['a', 'b'], 'exact', { a: 20, b: 30 });
  assert.deepEqual(shares, { a: 20, b: 30 });
});

test('computeShares rejects exact splits that do not sum to total', () => {
  assert.throws(() => computeShares(50, ['a', 'b'], 'exact', { a: 20, b: 20 }));
});

test('computeShares handles percentage splits', () => {
  const shares = computeShares(200, ['a', 'b'], 'percent', { a: 25, b: 75 });
  assert.equal(shares.a, 50);
  assert.equal(shares.b, 150);
});

test('computeShares rejects percentages that do not sum to 100', () => {
  assert.throws(() => computeShares(200, ['a', 'b'], 'percent', { a: 25, b: 70 }));
});

test('computeShares rejects invalid amounts', () => {
  assert.throws(() => computeShares(0, ['a'], 'equal'));
  assert.throws(() => computeShares(-5, ['a'], 'equal'));
});

test('computeBalances reflects payer credit and participant debt', () => {
  const expenses = [
    { paidBy: 'a', amount: 90, shares: { a: 30, b: 30, c: 30 } },
  ];
  const balances = computeBalances(expenses);
  assert.equal(balances.a, 60); // paid 90, owes 30
  assert.equal(balances.b, -30);
  assert.equal(balances.c, -30);
});

test('computeBalances accounts for settlements', () => {
  const expenses = [{ paidBy: 'a', amount: 100, shares: { a: 50, b: 50 } }];
  // b owes a 50; b pays a 50 -> settled
  const balances = computeBalances(expenses, [{ from: 'b', to: 'a', amount: 50 }]);
  assert.equal(balances.a, 0);
  assert.equal(balances.b, 0);
});

test('simplifyDebts produces transactions that clear all balances', () => {
  const balances = { a: 60, b: -30, c: -30 };
  const txns = simplifyDebts(balances);
  // apply transactions and confirm everyone nets to zero
  const net = { ...balances };
  for (const t of txns) {
    net[t.from] = round2(net[t.from] + t.amount);
    net[t.to] = round2(net[t.to] - t.amount);
  }
  for (const v of Object.values(net)) assert.equal(v, 0);
});

test('simplifyDebts minimizes transactions for a simple case', () => {
  const balances = { a: 60, b: -30, c: -30 };
  const txns = simplifyDebts(balances);
  assert.equal(txns.length, 2);
});
