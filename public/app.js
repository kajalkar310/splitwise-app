// --- tiny API helper ------------------------------------------------------
const api = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async send(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },
};

// --- app state ------------------------------------------------------------
const state = {
  users: [],
  groups: [],
  selectedGroup: null, // full group detail
};

const $ = (sel) => document.querySelector(sel);
const userName = (uid) => state.users.find((u) => u.id === uid)?.name ?? '?';
const money = (n) => `$${Number(n).toFixed(2)}`;

// --- rendering ------------------------------------------------------------
function renderUsers() {
  const list = $('#user-list');
  list.innerHTML = '';
  for (const u of state.users) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${u.name}</span><span class="muted">${u.email || ''}</span>`;
    list.appendChild(li);
  }
  renderMemberCheckboxes();
}

function renderMemberCheckboxes() {
  const box = $('#group-members');
  box.innerHTML = '';
  for (const u of state.users) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${u.id}" /> ${u.name}`;
    box.appendChild(label);
  }
}

function renderGroups() {
  const list = $('#group-list');
  list.innerHTML = '';
  for (const g of state.groups) {
    const li = document.createElement('li');
    li.className = 'clickable';
    if (state.selectedGroup?.id === g.id) li.classList.add('active');
    li.textContent = g.name;
    li.onclick = () => selectGroup(g.id);
    list.appendChild(li);
  }
}

function renderGroupDetail() {
  const g = state.selectedGroup;
  $('#empty-state').classList.toggle('hidden', !!g);
  $('#group-detail').classList.toggle('hidden', !g);
  if (!g) return;

  $('#group-title').textContent = g.name;

  // paid-by + settle selects + participants
  const memberOptions = g.members
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join('');
  $('#exp-paidby').innerHTML = memberOptions;
  $('#settle-from').innerHTML = memberOptions;
  $('#settle-to').innerHTML = memberOptions;

  const partBox = $('#exp-participants');
  partBox.innerHTML = '';
  for (const m of g.members) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${m.id}" checked /> ${m.name}`;
    partBox.appendChild(label);
  }
  updateSplitValueInputs();

  renderExpenses();
  loadBalances();
}

function renderExpenses() {
  const g = state.selectedGroup;
  const list = $('#expense-list');
  list.innerHTML = '';
  if (!g.expenses.length) {
    list.innerHTML = '<li class="muted">No expenses yet.</li>';
    return;
  }
  for (const e of [...g.expenses].reverse()) {
    const li = document.createElement('li');
    const shares = Object.entries(e.shares)
      .map(([uid, s]) => `${userName(uid)}: ${money(s)}`)
      .join(', ');
    li.innerHTML = `
      <span>
        <strong>${e.description}</strong> — ${money(e.amount)}
        <div class="muted">${userName(e.paidBy)} paid · ${e.splitType} · ${shares}</div>
      </span>
      <button class="danger" data-del="${e.id}">✕</button>`;
    list.appendChild(li);
  }
  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      await api.send('DELETE', `/api/expenses/${btn.dataset.del}`);
      await selectGroup(g.id);
    };
  });
}

async function loadBalances() {
  const g = state.selectedGroup;
  const { balances, settleUp } = await api.get(`/api/groups/${g.id}/balances`);

  const balList = $('#balance-list');
  balList.innerHTML = '';
  for (const b of balances) {
    const li = document.createElement('li');
    const cls = b.balance > 0 ? 'amount-owed' : b.balance < 0 ? 'amount-owe' : 'muted';
    const text = b.balance > 0 ? `is owed ${money(b.balance)}`
      : b.balance < 0 ? `owes ${money(-b.balance)}`
      : 'settled up';
    li.innerHTML = `<span>${b.name}</span><span class="${cls}">${text}</span>`;
    balList.appendChild(li);
  }

  const setList = $('#settle-list');
  setList.innerHTML = '';
  if (!settleUp.length) {
    setList.innerHTML = '<li class="muted">Everyone is settled up! 🎉</li>';
  }
  for (const t of settleUp) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${t.fromName} → ${t.toName}</span><span class="amount-owe">${money(t.amount)}</span>`;
    setList.appendChild(li);
  }
}

// --- split-value inputs (exact / percent) ---------------------------------
function checkedParticipants() {
  return [...document.querySelectorAll('#exp-participants input:checked')].map((i) => i.value);
}

function updateSplitValueInputs() {
  const type = $('#exp-splittype').value;
  const wrap = $('#exp-splitvalues');
  if (type === 'equal') {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  const unit = type === 'percent' ? '%' : '$';
  wrap.innerHTML = checkedParticipants()
    .map(
      (uid) => `<label>${userName(uid)} (${unit})
        <input type="number" step="0.01" min="0" data-split="${uid}" />
      </label>`
    )
    .join('');
}

// --- event wiring ---------------------------------------------------------
async function selectGroup(groupId) {
  state.selectedGroup = await api.get(`/api/groups/${groupId}`);
  renderGroups();
  renderGroupDetail();
}

async function refresh() {
  [state.users, state.groups] = await Promise.all([
    api.get('/api/users'),
    api.get('/api/groups'),
  ]);
  renderUsers();
  renderGroups();
}

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api.send('POST', '/api/users', {
    name: $('#user-name').value,
    email: $('#user-email').value,
  });
  e.target.reset();
  await refresh();
});

$('#group-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const memberIds = [...document.querySelectorAll('#group-members input:checked')].map((i) => i.value);
  await api.send('POST', '/api/groups', {
    name: $('#group-name').value,
    memberIds,
  });
  e.target.reset();
  await refresh();
});

$('#exp-splittype').addEventListener('change', updateSplitValueInputs);
$('#exp-participants').addEventListener('change', updateSplitValueInputs);

$('#expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = state.selectedGroup;
  const splitType = $('#exp-splittype').value;
  const participantIds = checkedParticipants();

  const splitValues = {};
  if (splitType !== 'equal') {
    document.querySelectorAll('#exp-splitvalues input[data-split]').forEach((inp) => {
      splitValues[inp.dataset.split] = Number(inp.value) || 0;
    });
  }

  try {
    await api.send('POST', `/api/groups/${g.id}/expenses`, {
      description: $('#exp-desc').value,
      amount: Number($('#exp-amount').value),
      paidBy: $('#exp-paidby').value,
      participantIds,
      splitType,
      splitValues,
    });
    e.target.reset();
    await selectGroup(g.id);
  } catch (err) {
    alert(err.message);
  }
});

$('#settle-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = state.selectedGroup;
  try {
    await api.send('POST', `/api/groups/${g.id}/settlements`, {
      from: $('#settle-from').value,
      to: $('#settle-to').value,
      amount: Number($('#settle-amount').value),
    });
    e.target.reset();
    await selectGroup(g.id);
  } catch (err) {
    alert(err.message);
  }
});

// --- boot -----------------------------------------------------------------
refresh().catch((err) => console.error('Failed to load:', err));
