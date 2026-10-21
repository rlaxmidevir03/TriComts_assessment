# How this was built with AI

So this is how I built the purchase exception app with an AI assistant. I didn't just ask it to "build the app". I first made it help me understand the brief and plan things, then we built it in small steps, and I checked and committed every step myself. Some things went wrong on the way, and I have written those down honestly below.

## 1. Tools

| Tool | Used for | Why |
|---|---|---|
| **Claude Code** (Claude desktop app, Code tab) | Writing code, tests and docs; running tests; checking screens in its built-in browser | It works on the whole project folder, so it can read existing files, run `npm test` after each change and click through the app itself, not just suggest snippets. |
| **VS Code** | Reading and reviewing every change, running the app, committing | I wanted to see each diff myself before committing. |
| **Git** | One commit per step | So the history shows the order of work (requirements → design → code) and each step can be reviewed or undone on its own. |

**AI guidance file:** [CLAUDE.md](CLAUDE.md). I wrote its rules in the first prompt: keep code readable, no unnecessary libraries, a test for every approval rule, history is append-only, login logic in one place. The AI followed it throughout, for example by refusing to add a router library and using the built-in Node test runner and SQLite.

**Cost:** free tier / no paid tools. **[FILL IN: any usage limits or slowdowns hit]**

## 2. Process



| Step | What I asked for |
|---|---|
| 1. Setup | Stack, folders, CLAUDE.md rules |
| 2. Requirements | **No code.** Find everything vague in the brief, the question I'd ask Dana, and an assumption for each |
| 3. Design | **No code.** Tables, statuses and transitions, API, and how each kickoff concern is handled. I reviewed it before any code existed. |
| 4. Database | Schema, triggers that make history append-only, demo users |
| 5. Approval rules | Plain functions in one file, **tests written first** |
| 6. API | Endpoints, one history row per action, permission tests |
| 7. Screens | User switcher, my requests, form, detail page with history |
| 7b. Fix | One-command start (found when I ran the app myself) |
| 8. Finance view | All requests, search, filters |
| 9. Vacation backup | Pick a backup; history says "on behalf of" |
| 10. Self-review | **Check everything against requirements.md, report only, don't fix** |
| 10b. Fixes | Version check; "Reviewed by me" list |
| 10c. Fixes | VP's requests (CFO approves); one person, one stage |
| 11. Docs | README, this file |

**[FILL IN: total time spent, including reading the brief and planning, and whether it went past the 4-hour time box]**

The two "no code yet" steps came first on purpose. The brief is deliberately vague ("a thousand or so", "the really big ones", "deal with that somehow"). Writing down 30+ questions and assumptions first meant every later prompt could point at a decision instead of leaving the AI to guess.

## 3. Prompts

These are the prompts as I typed them.

**Step 1: setup**
> Hey, let's set up the project. I want a Node + Express + SQLite backend in a server folder and a React app (using Vite) in a client folder. Keep it really simple, because I need to explain every part of this in an interview. Also create a CLAUDE.md with some ground rules for you: keep code readable, don't add libraries we don't need, write tests for every approval rule, never let anyone edit or delete the history records, and keep the login logic in one place so we can swap in Microsoft sign-in later.

*Why:* it sets the rules once, so I didn't have to repeat them in every prompt. Each rule maps to the brief: Priya (history), Tom (sign-in) and "be ready to explain every part".

**Step 2: requirements**
> Before we write any code, I want to make sure we understand what the business actually wants. Read the brief in docs/brief.md. Some things in there are vague, like 'a thousand or so' and 'the really big ones.' Can you list everything that's unclear, what question you'd ask Dana about it, and a sensible assumption we can go with for now? Then put it all in docs/requirements.md with user stories and acceptance criteria. No code yet please.

**Step 3: design**
> Okay, now let's plan how it'll work before building. Based on the requirements, write docs/design.md. I want to see what tables we need, what statuses a request can be in and how it moves between them, and what API endpoints we'll need. Also show me how we're handling each point from the kickoff meeting: the vacation issue, audit history, Microsoft sign-in later, finance being read-only, no approving your own request, and editing requests. Keep it as small as possible. Still no code, I want to review this first.

**Step 5: approval rules**
> Now the most important part, the approval rules. Put them in one file as plain functions, not mixed in with Express, so they're easy to test and easy for me to explain. It should handle routing by amount, approve, reject (with a required reason), send back, resubmit after changes, nobody approving their own request, and finance not being able to approve. Write the tests first, then make them pass.

*Why:* keeping rules out of Express means they can be tested without a server, and there's one file to read in the interview.

**Step 9: vacation backup**
> so for marcus vacation problem let an approver pick a backup person while any one is away because we need backup so history should say backup approved on behalf of the person

**Step 10: self-review**
> now can you check that aal requirements have met and tell me if anything missing

*Why:* I didn't want to trust "all tests pass" on its own. This found three real gaps (see section 5).

### Prompts that didn't work the first time

#### Problem 1: The frontend prompt was ambiguous and incomplete

**What I typed (Step 7):**
> now we have to make frontend keep it simple with plain css i want dropdown to switch betwenn demo and real login and a m request like page where you can submit or edit request and a detila page that show history of request

**What went wrong:**
- "Switch between demo and real login" could mean building real login, which the brief says isn't needed. The AI had to guess, and it guessed a demo-user switcher only.
- I left out the approver screen. Without it, nobody could approve anything in the UI. The AI added an "Awaiting my approval" tab and Approve / Reject / Send back buttons, which I hadn't asked for in that prompt.
- So the result was right, but it was right because the AI filled gaps, not because the prompt was clear.

**How I corrected it:** I followed up to confirm the approver page was part of what I wanted:
> hey there is also a awaiting my approval page with approve ,, reject and send back buttons

**Improved prompt** (written afterwards with the AI, for next time):
> Build the frontend with plain CSS. No real login: add a "Viewing as" dropdown that switches between the seeded demo users. Screens: (1) My requests, with New and Edit using one form; (2) Awaiting my approval, for approvers; (3) a detail page with the approval route, full history, and Approve / Reject / Send back for the current approver only. The server already enforces every rule, so the UI just hides buttons the user can't use.

**Lesson:** say what *not* to build ("no real login") and list every role's screen. Otherwise the AI decides scope for you.

#### Problem 2: Two features that each worked, but broke a rule together

**What I typed:** the Step 5 prompt (approval rules) and the Step 9 prompt (vacation backup), shown above. Each one was built test-first, and each one's tests passed.

**What went wrong:** together they let **one person approve two stages** of the same request. For example, Alex submits $5,000, so the route is Morgan → Daniel. Morgan is away and picks **Daniel** as backup. Daniel approves stage 1 "on behalf of Morgan", then stage 2 as director. One person signed both stages, which defeats the point of needing two approvers.

Neither prompt was wrong on its own. I never asked how the two features *combine*, so no test checked it. **The self-review prompt (Step 10) found it, not the tests.**

**How I corrected it:**
> so we have to solve VP new request button it should function properly and gap 2 also

The fix was done test-first again: 6 new tests, 3 of them failed (proving the gap was real), then a new rule made them pass. The rule is "one person approves at most one stage per round; rejecting and sending back are still allowed". It is written down as assumption **B5** in requirements.md.

**Improved prompt** (written afterwards with the AI, for next time):
> Add vacation backups. Before writing code, list how backups interact with the rules we already have (no self-approval, multi-stage routes, editing restarts approval), and write a test for each interaction. In particular: can a backup end up approving more than one stage of the same request?

**Lesson:** when adding a feature, ask how it interacts with existing rules, not just whether the new feature works on its own.

## 4. AI vs. me

To be honest, the AI wrote almost all of the code and the tests, and the first drafts of the docs. What I did was decide what to build and in which order, read every change in VS Code before committing, click through the app as each user to see if it really works, and decide which problems to fix and which to leave. I didn't hand-write the code, but I edited this document myself. If something looked wrong or unclear, I asked again instead of just accepting it.

## 5. Judgment: where the AI was wrong or needed correcting

1. **The server reported success when it had failed.** When I ran it, port 3001 was already in use. The server printed "API running" and then quietly stopped, because Express 5 calls the start callback even on failure. It now prints a clear "port in use" message. *I found this by running the app myself.*
2. **A promised feature wasn't built.** The design said outdated actions would be refused (the version check), but the API step didn't build it, and the API prompt hadn't mentioned it. The self-review caught it. Example: an approver looking at a $900 request could approve it after it had been changed to $9,000. Now refused at both the API and database level, with tests.
3. **One person could approve two stages** (Problem 2 above).

5. **Docs drifted from code.** My database prompt asked for one director; the design had two. The AI followed the prompt and updated the design to match. Later, design details changed in code (e.g. how a shared stage is labelled) and the docs were updated each time.
6. **UI bugs found in the browser, not by tests:** finance filters were lost after opening a request; the user dropdown was cut off on a phone; CSS glitches in the history list.
7. **The tests themselves were checked.** When all the rule tests passed on the first run, I had the AI break the code on purpose (e.g. treat $1,000 as manager-only, remove the self-approval check) to prove the tests would catch it. They did.
8. **Decisions the AI made that I accepted, and would confirm with the business:** finance viewers can't submit; adding a CFO to approve the VP's own requests; any edit restarts approval from the first approver.

## 6. Efficiency

The actual build, from my first commit to the last fix, took about 3 hours . Before that I spent time reading the brief and planning the prompts, and after it on the docs. Without AI I think this would have taken me a few days, mostly because of all the tests and the setup.

- **Where it saved time:** setting up the project, writing around 100 tests (it even thought of cases like $9,999.99 vs $10,000), the SQL, the CSS and the first drafts of the long docs.
- **Where it cost time:** I had to read and check everything it wrote. Sometimes it added things I didn't ask for, so I had to check the scope at every step. And a few small tool and setup problems took some time.


**What I'd do next:** log backup changes in their own audit table; reminders when a request waits more than N days; Microsoft sign-in.


- **AI-written tests as proof.** They're good evidence, but they only test what we thought of. Problem 2 passed every test until a review found it.
