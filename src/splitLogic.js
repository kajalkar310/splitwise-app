/**
 * Core expense-splitting math, isolated from HTTP/storage concerns so it can be
 * unit-tested directly.
 */

/** Round to 2 decimal places, avoiding floating-point noise. */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split an amount across a set of participants.
 *
 * @param {number} amount    total amount of the expense
 * @param {string[]} participantIds  user ids sharing the expense
 * @param {'equal'|'exact'|'percent'} splitType
 * @param {Object} [splitValues]  for 'exact': { userId: amount }, for 'percent': { userId: pct }
 * @returns {Object} map of userId -> share owed
 */
export function computeShares(amount, participantIds, splitType = 'equal', splitValues = {}) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new Error('At least one participant is required');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const shares = {};

  if (splitType === 'equal') {
    const per = amount / participantIds.length;
    let allocated = 0;
    participantIds.forEach((id, i) => {
      // Give the rounding remainder to the last participant so shares sum exactly.
      if (i === participantIds.length - 1) {
        shares[id] = round2(amount - allocated);
      } else {
        const s = round2(per);
        shares[id] = s;
        allocated = round2(allocated + s);
      }
    });
    return shares;
  }

  if (splitType === 'exact') {
    let sum = 0;
    for (const id of participantIds) {
      const v = Number(splitValues[id] ?? 0);
      shares[id] = round2(v);
      sum = round2(sum + v);
    }
    if (sum !== round2(amount)) {
      throw new Error(`Exact shares (${sum}) must sum to the total amount (${amount})`);
    }
    return shares;
  }

  if (splitType === 'percent') {
    let pctSum = 0;
    for (const id of participantIds) pctSum = round2(pctSum + Number(splitValues[id] ?? 0));
    if (pctSum !== 100) {
      throw new Error(`Percentages must sum to 100 (got ${pctSum})`);
    }
    let allocated = 0;
    participantIds.forEach((id, i) => {
      if (i === participantIds.length - 1) {
        shares[id] = round2(amount - allocated);
      } else {
        const s = round2((Number(splitValues[id]) / 100) * amount);
        shares[id] = s;
        allocated = round2(allocated + s);
      }
    });
    return shares;
  }

  throw new Error(`Unknown split type: ${splitType}`);
}

/**
 * Compute net balance per user from a list of expenses and settlements.
 * Positive balance => the user is owed money. Negative => the user owes money.
 *
 * @param {Array} expenses  each: { paidBy, amount, shares: {userId: share} }
 * @param {Array} settlements  each: { from, to, amount }
 * @returns {Object} map of userId -> net balance
 */
export function computeBalances(expenses, settlements = []) {
  const balances = {};
  const add = (id, delta) => {
    balances[id] = round2((balances[id] ?? 0) + delta);
  };

  for (const exp of expenses) {
    // The payer fronted the full amount...
    add(exp.paidBy, exp.amount);
    // ...and every participant owes their share.
    for (const [userId, share] of Object.entries(exp.shares)) {
      add(userId, -share);
    }
  }

  // A settlement: `from` pays `to`, reducing what `from` owes.
  for (const s of settlements) {
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }

  return balances;
}

/**
 * Given net balances, produce a minimal-ish set of "who pays whom" transactions
 * to settle everyone up. Greedy algorithm: repeatedly match the biggest debtor
 * with the biggest creditor.
 *
 * @param {Object} balances  map of userId -> net balance
 * @returns {Array} list of { from, to, amount }
 */
export function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, bal] of Object.entries(balances)) {
    const b = round2(bal);
    if (b > 0) creditors.push({ id, amount: b });
    else if (b < 0) debtors.push({ id, amount: -b });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      transactions.push({ from: debtor.id, to: creditor.id, amount });
    }

    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);

    if (debtor.amount <= 0) i++;
    if (creditor.amount <= 0) j++;
  }

  return transactions;
}
