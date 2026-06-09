import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { computeShares, computeBalances, simplifyDebts, round2 } from './splitLogic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// --- tiny id helper (no external uuid dependency) -------------------------
let counter = 0;
function id(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

const find = (collection, itemId) => store.get(collection).find((x) => x.id === itemId);

// --- Users ----------------------------------------------------------------
app.get('/api/users', (_req, res) => {
  res.json(store.get('users'));
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const user = { id: id('usr'), name: name.trim(), email: (email ?? '').trim() };
  store.mutate((db) => db.users.push(user));
  res.status(201).json(user);
});

// --- Groups ---------------------------------------------------------------
app.get('/api/groups', (_req, res) => {
  res.json(store.get('groups'));
});

app.post('/api/groups', (req, res) => {
  const { name, memberIds } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const members = Array.isArray(memberIds) ? memberIds : [];
  for (const m of members) {
    if (!find('users', m)) return res.status(400).json({ error: `unknown user: ${m}` });
  }
  const group = { id: id('grp'), name: name.trim(), memberIds: members };
  store.mutate((db) => db.groups.push(group));
  res.status(201).json(group);
});

app.get('/api/groups/:groupId', (req, res) => {
  const group = find('groups', req.params.groupId);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const members = group.memberIds.map((mId) => find('users', mId)).filter(Boolean);
  const expenses = store.get('expenses').filter((e) => e.groupId === group.id);
  const settlements = store.get('settlements').filter((s) => s.groupId === group.id);
  res.json({ ...group, members, expenses, settlements });
});

// --- Expenses -------------------------------------------------------------
app.post('/api/groups/:groupId/expenses', (req, res) => {
  const group = find('groups', req.params.groupId);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const { description, amount, paidBy, participantIds, splitType, splitValues } = req.body ?? {};
  const amt = Number(amount);

  if (!description) return res.status(400).json({ error: 'description is required' });
  if (!paidBy || !find('users', paidBy)) {
    return res.status(400).json({ error: 'valid paidBy user is required' });
  }
  const participants = Array.isArray(participantIds) && participantIds.length
    ? participantIds
    : group.memberIds;
  for (const p of participants) {
    if (!group.memberIds.includes(p)) {
      return res.status(400).json({ error: `participant ${p} is not in this group` });
    }
  }

  let shares;
  try {
    shares = computeShares(amt, participants, splitType ?? 'equal', splitValues ?? {});
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const expense = {
    id: id('exp'),
    groupId: group.id,
    description: String(description).trim(),
    amount: round2(amt),
    paidBy,
    participantIds: participants,
    splitType: splitType ?? 'equal',
    shares,
    createdAt: new Date().toISOString(),
  };
  store.mutate((db) => db.expenses.push(expense));
  res.status(201).json(expense);
});

app.delete('/api/expenses/:expenseId', (req, res) => {
  let removed = false;
  store.mutate((db) => {
    const before = db.expenses.length;
    db.expenses = db.expenses.filter((e) => e.id !== req.params.expenseId);
    removed = db.expenses.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'expense not found' });
  res.status(204).end();
});

// --- Settlements ----------------------------------------------------------
app.post('/api/groups/:groupId/settlements', (req, res) => {
  const group = find('groups', req.params.groupId);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const { from, to, amount } = req.body ?? {};
  const amt = Number(amount);
  if (!find('users', from) || !find('users', to)) {
    return res.status(400).json({ error: 'valid from/to users are required' });
  }
  if (from === to) return res.status(400).json({ error: 'from and to must differ' });
  if (!(amt > 0)) return res.status(400).json({ error: 'amount must be positive' });

  const settlement = {
    id: id('set'),
    groupId: group.id,
    from,
    to,
    amount: round2(amt),
    createdAt: new Date().toISOString(),
  };
  store.mutate((db) => db.settlements.push(settlement));
  res.status(201).json(settlement);
});

// --- Balances & settle-up suggestions -------------------------------------
app.get('/api/groups/:groupId/balances', (req, res) => {
  const group = find('groups', req.params.groupId);
  if (!group) return res.status(404).json({ error: 'group not found' });

  const expenses = store.get('expenses').filter((e) => e.groupId === group.id);
  const settlements = store.get('settlements').filter((s) => s.groupId === group.id);
  const balances = computeBalances(expenses, settlements);

  // Ensure every member appears, even with a zero balance.
  for (const m of group.memberIds) if (!(m in balances)) balances[m] = 0;

  const settleUp = simplifyDebts(balances).map((t) => ({
    from: t.from,
    fromName: find('users', t.from)?.name,
    to: t.to,
    toName: find('users', t.to)?.name,
    amount: t.amount,
  }));

  const detailed = Object.entries(balances).map(([userId, balance]) => ({
    userId,
    name: find('users', userId)?.name,
    balance,
  }));

  res.json({ balances: detailed, settleUp });
});

// --- Health ---------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Splitwise app running at http://localhost:${PORT}`);
  });
}

export default app;
