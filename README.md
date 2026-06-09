# 💸 Splitwise App

A lightweight **Splitwise-style expense sharing application** — create groups, add shared expenses, split bills (equally, by exact amounts, or by percentage), track who owes whom, and get a minimal "settle up" plan.

Built with **Node.js + Express** and a dependency-free JSON file store on the backend, and a **vanilla JavaScript** single-page frontend (no build step required).

## ✨ Features

- **People & groups** — add members and organize them into groups.
- **Flexible expense splitting**
  - Split **equally** among participants
  - Split by **exact amounts**
  - Split by **percentage**
- **Balances** — see at a glance who is owed money and who owes.
- **Settle up** — a greedy debt-simplification algorithm suggests the fewest payments to clear all balances.
- **Record settlements** — log real-world payments between members.
- **Zero heavy dependencies** — only Express; data persists to a local JSON file.

## 🚀 Getting started

```bash
# install dependencies
npm install

# start the server
npm start
# → Splitwise app running at http://localhost:3000
```

Then open <http://localhost:3000> in your browser.

For development with auto-reload:

```bash
npm run dev
```

## 🧪 Tests

The core splitting and settlement logic is unit-tested with the built-in Node test runner:

```bash
npm test
```

## 🧩 API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET`  | `/api/users` | List users |
| `POST` | `/api/users` | Create a user `{ name, email? }` |
| `GET`  | `/api/groups` | List groups |
| `POST` | `/api/groups` | Create a group `{ name, memberIds[] }` |
| `GET`  | `/api/groups/:id` | Group detail (members, expenses, settlements) |
| `POST` | `/api/groups/:id/expenses` | Add an expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `POST` | `/api/groups/:id/settlements` | Record a settlement `{ from, to, amount }` |
| `GET`  | `/api/groups/:id/balances` | Balances + settle-up suggestions |

### Adding an expense

```jsonc
POST /api/groups/:id/expenses
{
  "description": "Dinner",
  "amount": 90,
  "paidBy": "usr_abc",
  "participantIds": ["usr_abc", "usr_def", "usr_ghi"],
  "splitType": "equal",          // "equal" | "exact" | "percent"
  "splitValues": {}               // required for exact ($) / percent (%)
}
```

## 📁 Project structure

```
splitwise-app/
├── src/
│   ├── server.js       # Express app & REST API
│   ├── store.js        # JSON-file datastore
│   └── splitLogic.js   # Split / balance / settle-up math (unit-tested)
├── public/             # Frontend (HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── test/
│   └── splitLogic.test.js
└── package.json
```

## 🛠️ How balances work

- When someone **pays** for an expense, they are credited the full amount.
- Each **participant** is debited their share.
- A user's **net balance** = total paid − total share owed (± settlements).
  - Positive → they are **owed** money.
  - Negative → they **owe** money.
- `simplifyDebts` greedily matches the largest debtor with the largest creditor to minimize the number of payments needed to settle up.

## 📄 License

MIT
