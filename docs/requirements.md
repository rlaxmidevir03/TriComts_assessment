# Requirements – Purchase Exception Requests

**Client:** Riverbend Supply Co. (fictional) · **Business owner:** Dana Whitfield, Finance Operations
**Source:** Dana's email and the kickoff notes from Marcus (Operations), Priya (Internal Audit), Tom (IT).

## 1. The problem in one paragraph

Purchases outside the normal process are approved over email. Requests get lost in inboxes, nobody can see where a request is, and there is no reliable record of who approved what (Dana spent two days tracing a $14,000 approval and never found the answer). The business wants **one place** to submit, route, approve and track these requests, with a **history that can't be altered**.

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| **Requester** | Any employee | Submit, edit, resubmit and withdraw their own requests. See their own requests and history. |
| **Approver** | Manager, Department Director, VP of Finance | Everything a requester can, plus approve / reject / send back requests that are waiting on them. Set a backup (delegate) while away. |
| **Finance viewer** | Finance Operations staff (e.g. Dana) | See **all** requests and their history. **Cannot** submit, approve, reject or send back anything. |
| **CFO** | Chief Financial Officer (added for B4) | Approves the VP of Finance's own requests. Top of the org, so cannot submit. |

A person has one role. Approvers are also employees, so they can submit their own requests (as long as someone above them can approve).

## 3. Ambiguities, questions for the business, and working assumptions

These came from reading the email and kickoff notes. On a real project I'd send these questions to Dana before building. Here, I've made an assumption for each so the build can go ahead. **Every assumption is easy to change later.** Thresholds, for example, sit in one config value.

### Approval routing

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| A1 | "Under a thousand dollars **or so**" – where exactly is the line? | Is the manager-only limit exactly $1,000? Is $1,000.00 itself manager-only or director level? | **Under $1,000.00 → manager only.** $1,000.00 and above needs the director too. |
| A2 | "The **really big** ones go to the VP" – how big? | What amount needs VP of Finance approval? | **$10,000.00 and above → manager + director + VP of Finance.** (The $14,000 request in Dana's email would need the VP.) |
| A3 | Do approvers sign in order, or all at once? | Does the director need to wait for the manager? | **In order:** manager → director → VP. Each person only sees it once the previous stage approves. This matches how "forwarding up" works today. |
| A4 | Which director? | Is "the department director" the requester's department's director? | **Yes:** the director of the requester's department. |
| A5 | Currency | Are all requests in USD? | **USD only.** |
| A6 | Request content | Besides vendor, amount and reason, what do you need? Quotes or attachments? A needed-by date? | **Vendor, amount, reason (justification) and a category** (Rush order / Repair / New vendor / Other). Attachments are out of scope for now. |

### Self-approval and edge cases in the chain

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| B1 | "A manager shouldn't approve their own stuff." Who approves a manager's request? | When a manager submits a request, who replaces them as approver? | The chain is built from the **requester's own manager upward**, so a manager's request goes to *their* manager. Nobody can ever be an approver on a request they submitted. |
| B2 | The same person appears twice in the chain (e.g. a director's direct report: their manager *is* the director). | Does one approval count for both stages? | **Yes.** A person approves once, and duplicate stages are skipped. The history shows which stages that approval covered. |
| B3 | The approver would be the requester (e.g. a director submits a $5,000 request). | Who signs instead? | **Skip to the next person up**, so the director's request goes to their manager (the VP). |
| B4 | Who approves the VP of Finance's own requests? | Is there a CFO or CEO step? | **The VP reports to a CFO, who approves the VP's requests** (a CFO was added to the demo data). This needs no special rule: the route skips up past the VP to their manager, as in B3. The CFO is the top of the org, so the CFO can't submit; their requests would need a CEO or board step, which is out of scope. *Still worth confirming with Dana.* |
| B5 | Can one person approve two stages of the same request? (Found in the self-review: possible if they cover an earlier approver as a backup.) | Must a $1,000+ request always have two *different* approvers? | **Yes: one person approves at most one stage per round.** A backup can't approve an earlier stage if they also approve a later one, and nobody can approve a second stage after approving one. Rejecting or sending back is still allowed. |

### Approver actions

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| C1 | Is a rejection final? | Can a rejected request be reopened? | **Yes, it's final.** The requester can submit a new request. |
| C2 | Comments | Reject needs a reason. What about send back? | **A comment is required for Reject and Send Back** (the requester needs to know what to fix). It's optional on Approve. |
| C3 | After "send back", where does it restart? | After the requester fixes it, does it go back to the person who sent it back, or start over? | **Start over at the first stage.** Earlier approvals were given on the old version, so they no longer count. This keeps the audit trail honest (see E2). |

### Editing ("people change their minds")

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| D1 | When can a requester edit? | Only when sent back, or any time? | **Any time before a final decision** (while pending or sent back). Editing is easy, as Dana asked. |
| D2 | What happens to existing approvals if someone edits mid-way? | If the manager approved $900 and the requester changes it to $9,000, does the manager's approval still stand? | **No. Any edit restarts approval from the first stage**, and the route is recalculated for the new amount. Otherwise someone could get a small amount approved and then raise it. |
| D3 | Can they cancel? | Should requesters be able to withdraw a request? | **Yes, "Withdraw"** while it's pending or sent back. It's final. |
| D4 | Editing after approval? | Can an approved request be changed? | **No.** Approved, rejected and withdrawn requests are locked. |

### Audit (Priya)

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| E1 | What must the history contain? | What do auditors need on each entry? | **Who did it, what action, when, any comment, and "on behalf of" if a delegate acted.** |
| E2 | Edits | Do you need to see what changed? | **Yes.** Each edit records the old and new values of the fields that changed. |
| E3 | "If it can be changed after the fact, it is useless." | Is application-level protection enough, or does it need to be enforced in the database? | **Both.** The app never updates or deletes history, and the database itself rejects any attempt to. |

### Vacations (Marcus)

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| F1 | "Deal with that somehow." Delegation, reminders, or auto-escalation? | When an approver is away, who should act for them? Should requests auto-escalate after N days? | **Delegation:** an approver can name a backup while they're away. Requests waiting on them, and new ones, go to the backup. Auto-escalation and reminders are a possible next step (see §6). |
| F2 | Who can be a backup? | Any approver, or only someone at the same level or above? | **Any other approver** except the requester of a given request (no self-approval through delegation). |
| F3 | How does audit see this? | | History says e.g. **"Approved by Jordan Blake on behalf of Morgan Lee."** |
| F4 | Visibility of delays | How does Dana know a request is stuck? | The all-requests list shows the **current approver** and **how many days it has been waiting** on them. |

### Visibility and sign-in

| # | What's unclear | Question I'd ask | Assumption for now |
|---|---|---|---|
| G1 | What can approvers see? | Can a director see every request in their department? | **Their own requests, requests waiting on them, and requests they've acted on.** Company-wide view is for Finance. |
| G2 | Is the VP of Finance also a "finance person" who sees everything? | | **Yes.** The VP of Finance can see all requests (and also approve, since they're in the chain). The plain Finance viewer can only look. |
| G3 | Sign-in (Tom) | Which Microsoft sign-in, Entra ID? | **Demo users with a user switcher, no passwords.** All "who is this user" logic lives in one server module, so Microsoft sign-in replaces just that module later. |
| G4 | Notifications | Should approvers get an email when something is waiting on them? | **Out of scope for the time box.** The "Awaiting my approval" page is the inbox for now. |

## 4. User stories and acceptance criteria

Priority: **Must** = needed for the demo · **Should** = included if time allows · **Could** = next step.

### Submitting

**US-1 (Must) – Submit a request**
*As an employee, I want to submit a purchase exception with vendor, amount, category and reason, so that it goes to the right people without me emailing anyone.*
- Vendor, amount, category and reason are required; amount must be greater than $0. Otherwise the form shows an error and nothing is saved.
- On submit, the request gets an ID, status **Pending**, and the approval route is set by amount (US-2).
- The history shows "Submitted by <name>".

**US-2 (Must) – Route by amount**
*As Finance, I want each request to go to the right approvers automatically, so that nothing skips a required sign-off.*
- Amount < $1,000 → requester's **manager**.
- $1,000 ≤ amount < $10,000 → **manager**, then **department director**.
- Amount ≥ $10,000 → **manager**, then **director**, then **VP of Finance**.
- The requester never appears in their own route (B1, B3), and a person appears at most once (B2).
- Approvals happen in order. Only the current stage's approver can act.

### Approving

**US-3 (Must) – Approve**
*As an approver, I want to approve a request waiting on me, so that it moves to the next stage.*
- Only the current approver (or their active delegate) can approve.
- After the last stage approves, status becomes **Approved** and the request is locked.
- History records who approved, when, and an optional comment.

**US-4 (Must) – Reject with a reason**
*As an approver, I want to reject a request and explain why, so that the requester understands the decision.*
- Reject without a comment is refused with an error.
- Status becomes **Rejected** (final), and the request is locked.

**US-5 (Must) – Send back for more information**
*As an approver, I want to send a request back with a note, so that the requester can fix it instead of starting over.*
- A comment is required.
- Status becomes **Sent back**, and the requester sees the comment.
- After the requester edits and resubmits, approval restarts at stage 1 (C3).

**US-6 (Must) – No self-approval, finance read-only**
*As an auditor, I want the system to make conflicts of interest impossible, so that every approval is legitimate.*
- No user can approve, reject or send back a request they submitted, even through delegation. The server refuses it, not just the UI.
- A Finance viewer gets an error if they try any approval action, and the buttons are not shown to them.
- One person can approve at most one stage of a request per round, even as a backup (B5).

### Editing

**US-7 (Must) – Edit a request**
*As a requester, I want to fix my request while it's still open, so that I don't have to start a new one.*
- Allowed only by the requester, and only while **Pending** or **Sent back**.
- Saving an edit restarts approval at stage 1 and recalculates the route if the amount crossed a threshold.
- History records the edit with old → new values.

**US-8 (Should) – Withdraw a request**
*As a requester, I want to withdraw a request I no longer need.*
- Allowed only by the requester, while Pending or Sent back. Status becomes **Withdrawn** (final).

### Tracking and history

**US-9 (Must) – See where my request is**
*As a requester, I want to see my requests, their status and who they're waiting on, so that I don't have to chase anyone.*
- "My requests" lists my requests with status and current approver.
- Opening one shows its details and full history.

**US-10 (Must) – Approver inbox**
*As an approver, I want one list of everything waiting on me.*
- "Awaiting my approval" shows only requests where I (or someone I'm covering for) am the current approver.

**US-11 (Must) – Tamper-proof history**
*As an auditor, I want a complete, unchangeable history of every action, so that I can always answer "who approved this and when?"*
- Every action (submit, edit, approve, reject, send back, resubmit, withdraw) adds a history entry with actor, action, timestamp, comment and "on behalf of" if relevant.
- History entries can't be edited or deleted. The database rejects UPDATE/DELETE on the history table, and a test proves it.

**US-12 (Must) – Company-wide list for Finance**
*As Dana, I want to see every request with its status and who is holding it up, so that I can spot stuck requests.*
- Finance viewers (and the VP of Finance) see all requests.
- Columns: ID, requester, department, vendor, amount, status, current approver, days waiting.
- Searchable by vendor, requester or reason. Filterable by status and department.

### Vacations

**US-13 (Should) – Delegate while away**
*As an approver going on vacation, I want to name a backup, so that requests don't sit for a week.*
- An approver can set and clear a delegate.
- While set, the delegate sees and can act on that approver's waiting requests.
- A delegate can't act on a request they submitted themselves.
- History shows "<delegate> on behalf of <approver>".

### Sign-in

**US-14 (Must) – Demo users now, Microsoft sign-in later**
*As IT, I want identity handled in one place, so that switching to Microsoft sign-in is a small change.*
- The app has a user switcher with seeded synthetic users for every role.
- Only one server module decides who the current user is; everything else uses its result.

## 5. Non-functional requirements

- **Synthetic data only.** No real names, vendors or employer information.
- **Simple to run:** a few commands on Node 22+, no paid services.
- **Server is the source of truth.** Every rule (permissions, routing, required comments) is enforced on the server. The UI only hides buttons as a convenience.
- **Automated tests** for every approval rule and permission check (US-2 to US-7, US-11, US-13).
- **Amounts are stored as whole cents** to avoid rounding errors.

## 6. Out of scope (for this time box) and possible next steps

- Real Microsoft (Entra ID) sign-in. The design keeps this to a one-module change.
- Email or Teams notifications and reminders.
- Auto-escalation when a request waits more than N days.
- Attachments (quotes, invoices).
- Who approves the CFO's own requests (B4: would need a CEO or board step).
- Org-chart administration screens. Users and reporting lines are seed data.
- Reporting and exports (CSV, dashboards).
