# Supplement Desk

Supplement Desk is a web app for running a collision supplement service. A shop uploads the insurer's estimate and its teardown photos. The app reads the estimate and drafts the missed operations. An estimator reviews every line and signs off. The shop then gets a supplement package in its own name, records what the insurer approved or denied, and gets a rebuttal draft for each denial.

This is Phase 2 (MVP) of the implementation plan.

## Quick start (local, no setup)

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env          # set ADMIN_EMAIL and ADMIN_PASSWORD
npm run build
npm start                     # http://localhost:3000
```

Sign in with the admin email and password from `.env`. With `DATABASE_URL` empty, the app uses an embedded Postgres stored in `./data`, so there is nothing else to install. If you leave `ADMIN_PASSWORD` empty, a password is generated and printed in the console on first start.

To develop with hot reload, run `npm run dev`.

### Demo data

Stop the app first (the embedded database allows one process at a time), then run:

```bash
npm run seed:demo
```

This creates a demo shop, a shop user, an estimator, and two drafted jobs. The logins are printed in the console. All demo data is made up.

`npm run sample:estimate` writes two sample estimate PDFs to `./samples`. You can upload them through the app.

## Who does what

| Role | Can do |
|---|---|
| **Shop** | Upload jobs (estimate PDF and photos), follow status, download the package, mark it submitted, record insurer results, copy released rebuttals, see the monthly report |
| **Estimator** | Review assigned jobs: approve, reject, edit or add items, edit the cover note, sign off. Edit rebuttals on their own jobs |
| **Admin** | Everything: shops and plans, team, assignment, rules library, insurer playbook, rebuttal release, outbox, all reports |

## How a job flows

1. **Intake.** The shop uploads files on the Jobs page or forwards an email to its intake address. Files are encrypted at rest with AES-256-GCM.
2. **Parse.** The app reads the PDF text with its positions. It pulls out the VIN, claim number, insurer, RO, vehicle and total, then parses each line item (operation, description, part number, quantity, price, labor and paint hours). The VIN is decoded through NHTSA's free vPIC service.
3. **Checklist.** The rules library flags each operation whose trigger appears on the estimate while nothing in its "already on the estimate" list does.
4. **AI draft (optional).** With `ANTHROPIC_API_KEY` set, Claude receives the estimate PDF, up to 8 photos, the parsed lines, the rules library, the checklist hits and the insurer's playbook. It returns structured items and a cover note. Items that come from the library keep the library's reference text, and anything else is marked "Estimator to verify source", so the model cannot add citations of its own. Without a key, or if the call fails, the checklist-only draft is used.
5. **Review.** An admin assigns the job, or set `AUTO_ASSIGN=true` to give it to the estimator with the fewest open jobs. The estimator sees the PDF, the photos and the parsed lines beside the draft. Every edit is logged with before and after values.
6. **Sign-off.** Every item has to be approved or rejected first. The app then builds a PDF with the letter in the shop's name, the photo pages, and the supporting documents attached to the rules used. It emails the PDF to the shop. If no items were approved, the job closes.
7. **Results.** The shop marks each item approved, partly approved or denied. A denial or partial approval creates a rebuttal draft for an admin or the estimator to edit and release. The job closes once every item has a result.
8. **Reporting.** The monthly report shows reviews, turnaround, dollars submitted and approved, results by insurer, the most-missed operations, return on the fee, the 5x guarantee, and jobs over the plan cap. The admin overview tracks queue health, pay owed to each estimator, and AI draft quality (kept as drafted, kept after edits, rejected, added).

## Rules library

Admins edit the rules under **Rules**. Each save creates a new version, and each job records the library version it was drafted with.

- **Flag when the estimate contains:** whole words or phrases, plurals included. End a term with `*` for a prefix match (`calibrat*`). Use `op:refn` for an operation code, `op:repl bumper cover` for an operation on a specific part, and `*` for every job.
- **Skip when the estimate already contains:** same syntax.
- **Supporting documents:** OEM position statements or procedure pages. They are appended to every package that includes the rule.

The starting rules are a first draft. **Have an experienced estimator check every rule, its hours and its reference before you use it with real shops.** The default hours and amounts are placeholders, not database times.

## Configuration

See `.env.example`.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string. Leave empty for the embedded database |
| `FILE_ENCRYPTION_KEY` | 32-byte base64 key. **Required in production**: back it up, because losing it makes stored files unreadable |
| `GCS_BUCKET` | Store encrypted files in Google Cloud Storage instead of on local disk |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Turn on AI drafting, line extraction from scanned or unusual PDFs, and AI rebuttals |
| `SMTP_URL`, `MAIL_FROM` | Send email. Without them, emails are only recorded in **Outbox** |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_WEBHOOK_SECRET` | Email intake (Postmark inbound format) |
| `AUTO_ASSIGN` | `true` assigns each new job to the least-busy estimator |
| `APP_URL`, `APP_NAME`, `APP_TIMEZONE` | Links in emails, branding, and the time zone for reports (default `America/Chicago`) |

### Email intake

Point Postmark's inbound webhook at `https://YOUR_APP/api/inbound-email?secret=INBOUND_WEBHOOK_SECRET`. Each shop's address is shown under its Settings page: `intake+<token>@<domain>`. The first PDF attachment becomes the estimate and image attachments become photos. "RO 12345" in the subject fills in the repair order number.

## Deploying (Google Cloud Run)

```bash
docker build -t supplement-desk .
```

Run the image with a Cloud SQL Postgres `DATABASE_URL`, `GCS_BUCKET`, `FILE_ENCRYPTION_KEY`, `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and your SMTP and Anthropic settings. The schema is created automatically on first start. Use `/api/health` for health checks.

The embedded database is for a single local machine only. Use Postgres when you deploy.

## Tests

```bash
npm test     # parser, rules engine, encryption
```

The full flow was also tested in a browser against both the embedded database and real Postgres: upload, parse, draft, assign, review, sign-off, package, results, rebuttals, reports, rule versions, email intake and access control. The Claude path was tested against a local stand-in for the API, not the live service.

## Before real shops use it

- Have an estimator review and correct the rules library, and attach real OEM documents.
- Test with real CCC and Mitchell estimate PDFs. The parser was only tested on generated samples; layouts it can't read fall back to AI extraction when an API key is set.
- Have your attorney approve the letter wording and the service agreement. The letter is written in the shop's name and the app never contacts insurers.
- Set `FILE_ENCRYPTION_KEY`, use Postgres, and set up backups.
