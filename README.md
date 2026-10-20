# Purchase Exception Requests

A small web app for **Riverbend Supply Co.** (a fictional company) that replaces "email your manager and hope" with one place to **submit, route, approve and track** purchases made outside the normal purchasing process.

Built as an AI-assisted exercise. How it was built is described in [AI-USAGE.md](AI-USAGE.md).

## What it does

- **Employees submit a request** with vendor, amount, category and reason.
- **It routes itself by amount:**

  | Amount | Approvers, in order |
  |---|---|
  | under $1,000 | Manager |
  | $1,000 – $9,999.99 | Manager → Department director |
  | $10,000 and above | Manager → Director → VP of Finance |

- **Approvers can approve, reject (reason required) or send back** (comment required).
- **Requesters can edit or withdraw** an open request. Any edit restarts approval from the first approver, so nobody's approval carries over to a version they didn't see.
- **Every action is recorded in a history that can't be changed.** The database itself refuses to edit or delete history rows.
- **Finance sees every request** with its status, who it's waiting on and for how many days. The list is searchable and filterable. Finance can look but not approve.
- **Vacation cover:** an approver picks a backup while away. The history then says *"Approved by Jordan Blake on behalf of Morgan Lee"*.
- **Safeguards:**
  - Nobody can approve their own request.
  - One person can approve only one stage of a request.
  - An approval made from an outdated screen is refused.

## Run it locally

You need **Node.js 22.13 or newer** (SQLite is built into Node, so no database server is needed).

```bash
npm run setup     # install server and client packages (first time only)
npm run dev       # start the API and the website
```

Then open **http://localhost:5173**. The first start creates the database and fills it with demo data.

Other commands, all from the project root:

| Command | What it does |
|---|---|
| `npm test` | Run the automated tests (96 at the time of writing) |
| `npm run reset-db` | Wipe the local database and reload the demo data. Stop the server first. |

There's no deployed version. It runs locally only.

## Try it: demo users

There are no passwords. Use the **"Viewing as"** dropdown at the top to switch between demo users. This stands in for real sign-in (see *Design decisions*). All names are made up.

| User | Role | Try this |
|---|---|---|
| **Alex Chen** | Employee, Operations | Submit a request; edit one; see where yours are waiting |
| **Taylor Brooks** | Employee, Warehouse | Has a request that was *sent back*: update and resubmit it |
| **Morgan Lee** | Manager, Operations | Approve from *Awaiting my approval*; set a backup under *Going away?* |
| **Jordan Blake** | Manager, Warehouse | Act as Morgan's backup |
| **Daniel Ortiz** | Director (Operations + Warehouse) | Second-stage approvals ($1,000+) |
| **Victoria Hale** | VP of Finance | Third-stage approvals ($10,000+); can see all requests |
| **Elena Marsh** | CFO | Approves the VP's own requests |
| **Dana Whitfield** | Finance (view only) | *All requests*: search, filter, see who is holding things up |

**A two-minute story:** as **Dana**, open **PE-0003** (the $14,000 forklift rental) and read its history to see exactly who approved it and when. That was the question Dana couldn't answer in the original email. Then switch to **Victoria** and approve it.

## How it's built

```
client/  React + Vite, plain CSS          → the screens
server/  Node + Express + SQLite          → the API, the rules and the data
docs/    requirements.md, design.md       → what we're building and how
```

| File | Job |
|---|---|
| `server/src/workflow.js` | **All the approval rules**, as plain functions with no web or database code. Easiest place to start reading. |
| `server/src/routes.js` | The API. Each route: load → check version → ask `workflow.js` → save → reply. |
| `server/src/store.js` | All SQL. Each action saves the change **and** its history row in one transaction. |
| `server/src/db.js` | Tables, plus the triggers that make history append-only. |
| `server/src/auth.js` | The **only** place that decides who the user is (see below). |
| `server/src/seed.js` | Demo users and sample requests (created through the real rules). |
| `client/src/api.js` | The only place the website talks to the server. |
| `client/src/components/` | The screens: request table, form, detail page with history, all requests, backup panel. |

**Tests** (`server/test/`, built-in Node test runner, no extra libraries):
- `workflow.test.js`: every rule, including the $999.99 / $1,000 / $9,999.99 / $10,000 boundaries.
- `api.test.js`: permissions (403s), required comments, version conflicts (409), "every action adds exactly one history row".
- `db.test.js`: proves the database rejects edits and deletes on history.

## Design decisions

- **Rules live in one file** (`workflow.js`), separate from Express and SQL, so they're easy to test and explain.
- **The server enforces everything.** The screens hide buttons you can't use, but that's only a convenience.
- **History is append-only at the database level**, not just in code (Internal Audit's requirement).
- **Microsoft sign-in later:** today `auth.js` reads the demo user's id from a header. Swapping in Microsoft (Entra ID) sign-in means changing that one file. The rest of the app only uses the resulting `req.user`.
- **Money is stored in whole cents** (`$1,250.50` → `125050`) to avoid rounding errors.
- **Approval limits are one constant** (`THRESHOLDS` in `workflow.js`), so they're easy to change.

More detail: [docs/requirements.md](docs/requirements.md) covers assumptions, open questions, user stories and acceptance criteria. [docs/design.md](docs/design.md) covers the data model, statuses and API.

## Known limitations

- **Demo sign-in only:** anyone can pick any user. Fine for a demo, not for real use.
- **Choosing or clearing a backup isn't recorded in history.** Only the approvals a backup makes are.
- When one person covers two stages (e.g. Morgan's manager is also the director), the history doesn't say "covered manager + director stages".
- No email notifications, reminders or auto-escalation for requests that wait too long. *Days waiting* makes them visible instead.
- No attachments (quotes, invoices), no upper limit on amounts, no pagination.
- The CFO is the top of the org, so the CFO can't submit requests (that would need a CEO or board step).
- Search treats `%` and `_` as wildcards.

See *Limitations* in [AI-USAGE.md](AI-USAGE.md) for what I'd do next.
