# CLAUDE.md – Project rules for the AI assistant

## What this project is
Purchase Exception Request app for Riverbend Supply Co. (a fictional company, synthetic data only).
Employees submit purchase exceptions, which route to approvers based on amount. Finance can see everything.
The developer must be able to explain every line in an interview, so **simple beats clever**.

## Stack
- `server/` – Node.js 22+, Express, SQLite via the built-in `node:sqlite` module. Tests use the built-in `node:test`.
- `client/` – React + Vite, plain CSS.
- `docs/` – requirements.md, design.md. `docs/brief.md` is the original brief and is git-ignored (not to be shared publicly).

## Ground rules
1. **Keep code readable.** Short functions, clear names, a comment wherever the *why* isn't obvious. No clever one-liners.
2. **No unnecessary libraries.** Use Node/React built-ins first. Ask before adding any new dependency, and say why it's needed.
3. **Every approval rule has a test.** Routing by amount, approve, reject (comment required), send back, resubmit, no self-approval, finance read-only, delegation. A rule without a test is not done.
4. **History is append-only.** Rows in the request history (audit) table are never updated or deleted, by code or by anyone else. Only INSERT.
5. **Login lives in one place.** `server/src/auth.js` is the only code that decides who the user is (demo: `X-User-Id` header). Everything else reads `req.user`. This lets Microsoft sign-in replace one file later.
6. **Approval rules stay out of Express.** Workflow logic is plain functions, so it can be tested without HTTP.
7. **Synthetic data only.** No real names, companies, or secrets. Never commit `.env` files or keys.
8. **Small steps.** Do one step at a time, run the tests, and stop for review before moving on.

## Commands (from the project root)
- `npm run setup` – install server and client dependencies (first time only)
- `npm run dev` – start the API (http://localhost:3001) and the UI (http://localhost:5173) together; `/api` is proxied to the server
- `npm test` – run the server test suite
- `npm run reset-db` – wipe the local database and reload the demo data
