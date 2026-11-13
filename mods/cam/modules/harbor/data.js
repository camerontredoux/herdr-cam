// Harbor's mock world. Everything Harbor shows comes from here: edit freely, the panel
// reloads on save. Times are today's clock ("HH:MM" or "HH:MM:SS"); NOW is the mock "now"
// the views show.

export const NOW = "12:50";

// The stations every voyage runs through, left to right.
export const STATIONS = [
  { key: "Request" },
  { key: "Issue" },
  { key: "Brief" },
  { key: "Working" },
  { key: "PR" },
  { key: "CI" },
  { key: "Preview" },
  { key: "Client reply" },
  { key: "Merged" },
];

// Clients. `space` is the Herdr space name: when it exists, the tile takes that space's
// color from cam's sidebar; `color` is the fallback. `repo` is the GitHub repo its numbers link to.
export const CLIENTS = {
  birch: { name: "Birch", full: "Birch & Stone Landscaping", space: "birch-landscaping", repo: "example-org/birch-landscaping", letter: "B", color: "#22a99a" },
  ironside: { name: "Ironside", full: "Ironside Lifting League", space: "ironside-league", repo: "example-org/ironside-league", letter: "I", color: "#3fae6a" },
  fieldhouse: { name: "Fieldhouse", full: "Fieldhouse Coaching", space: "fieldhouse", repo: "example-org/fieldhouse", letter: "F", color: "#8b7cf6" },
};

// ---- Manifest: incoming client requests, already sorted (most urgent first).
// source: gmail | fathom | slack. match: the GitHub issue it maps to, or null for a new one.
// confidence: high | medium | low.
export const MANIFEST = [
  {
    id: "m-referral-intake", client: "birch", source: "gmail", from: "Alex Rivera", at: "12:41",
    quote: "The referral column is still blank for the Parkers. Can it just pull from the intake form they fill out?",
    title: "Referral source from intake form",
    match: { issue: 41, title: "Birch referral untracked" }, confidence: "high",
  },
  {
    id: "m-bodyweight", client: "ironside", source: "fathom", from: "Ironside board check-in", at: "11:30",
    quote: "Refs keep asking: the scoresheet has to show bodyweight to two decimals, not rounded.",
    title: "Bodyweight to two decimals on scoresheet",
    match: null, confidence: "high",
  },
  {
    id: "m-roster-stale", client: "fieldhouse", source: "slack", from: "Jordan · #fieldhouse-staff", at: "12:18",
    quote: "Coaches can't see the roster after the import unless they refresh. Is that expected?",
    title: "Roster stale after CSV import",
    match: { issue: 88, title: "Coach roster CSV import" }, confidence: "medium",
  },
  {
    id: "m-pool-dims", client: "birch", source: "gmail", from: "Sam Patel", at: "10:02",
    quote: "Could the crew see the pool dimensions on the job page without opening the PDF every time?",
    title: "Pool dimensions on the job page",
    match: null, confidence: "medium",
  },
  {
    id: "m-on-the-way", client: "birch", source: "fathom", from: "Birch weekly", at: "09:15",
    quote: "Maybe at some point the CRM could text homeowners when the crew is on the way?",
    title: "“Crew on the way” texts to homeowners",
    match: { issue: 43, title: "SMS texting" }, confidence: "low",
  },
];

// ---- Voyages: one per request in flight.
// history: [time, station, status?] in order; status defaults to "working".
//   Status words: working | blocked | decision | done | waiting (on the client).
// forks: sub-agents. `from`/`to` are stations; `end: null` means still running.
// weather: problems, shown on the map from `since`. kind: loop | tokens | storm.
//   Its icon sits over station `at`, or over sub-agent `fork`'s span when it names one.
// files: what it touches (the Log and the weather notes name them).
// decision: what to ask when a voyage needs a decision (answered inline, mock).
export const VOYAGES = [
  {
    id: "v-referral", title: "Birch referral untracked", client: "birch", issue: 41,
    branch: "fm-birch-referral", crewmate: "t4e",
    history: [["08:05", "Request"], ["08:09", "Issue"], ["08:30", "Brief"], ["08:52", "Working"], ["10:48", "PR"], ["11:02", "CI"],
      ["11:06", "CI", "blocked"], ["11:10:40", "CI"], ["12:36", "CI", "blocked"]],
    forks: [
      { name: "schema check", from: "Issue", to: "Brief", start: "08:12", end: "08:27" },
      { name: "test-writer", from: "Working", to: "PR", start: "09:30", end: "10:40" },
      { name: "qa-tester", from: "Working", to: "PR", start: "09:32", end: "10:05" },
      { name: "docs-check", from: "Working", to: "PR", start: "09:35", end: "09:50" },
    ],
    weather: [{ kind: "loop", at: "CI", since: "12:36", text: "Looping 14 min on pnpm test" }],
    files: ["src/app/quotes/quotes.tsx", "src/server/referrals.ts", "prisma/schema.prisma"],
  },
  {
    id: "v-change-orders", title: "Signed change orders in Drive", client: "birch", issue: 38,
    branch: "fm-change-orders-drive", crewmate: "t5c",
    history: [["08:20", "Request"], ["08:24", "Issue"], ["08:41", "Brief"], ["09:05", "Working"]],
    forks: [
      { name: "drive-api scout", from: "Brief", to: "Working", start: "08:45", end: "09:02" },
      { name: "pdf signer research", from: "Working", to: null, start: "11:40", end: null },
    ],
    weather: [],
    files: ["src/app/quotes/quotes.tsx", "src/lib/drive.ts"],
  },
  {
    id: "v-photos", title: "Birch photo app meeting", client: "birch", issue: 44,
    branch: "fm-photos-photos", crewmate: "t61",
    history: [["10:15", "Request"], ["10:18", "Issue"], ["10:40", "Brief"], ["10:55", "Working"], ["12:05", "PR"]],
    forks: [{ name: "photos api", from: "Brief", to: "Working", start: "10:42", end: "10:54" }],
    weather: [{ kind: "storm", at: "PR", since: "12:20", text: "3 errors on the PR's lint check" }],
    files: ["src/app/quotes/quotes.tsx", "src/integrations/photos.ts"],
  },
  {
    id: "v-sms", title: "Issue #43 SMS texting", client: "birch", issue: 43,
    branch: "fm-sms-texting", crewmate: "t58",
    history: [["09:30", "Request"], ["09:34", "Issue"], ["09:58", "Brief"], ["10:20", "Brief", "decision"]],
    forks: [{ name: "SMS docs", from: "Issue", to: "Brief", start: "09:40", end: "09:55" }],
    weather: [],
    files: ["src/server/sms.ts"],
    decision: {
      question: "SMS templates need carrier approval (about 3 days). Ship free-form texts now?",
      choices: ["Free-form now", "Wait for templates", "Ask Alex"],
    },
  },
  // A decision on top of a warning: the card shows only the decision (chart.js weatherOf).
  {
    id: "v-standings", title: "Ironside live meet standings", client: "ironside", issue: 17,
    branch: "fm-ironside-live-standings", crewmate: "t62",
    history: [["10:40", "Request"], ["10:44", "Issue"], ["11:02", "Brief"], ["11:15", "Working"], ["12:10", "PR"], ["12:14", "CI"],
      ["12:43", "CI", "decision"]],
    forks: [{ name: "websocket spike", from: "Brief", to: "Working", start: "11:04", end: "11:13" }],
    weather: [{ kind: "loop", at: "CI", since: "12:30", text: "Looping 13 min on pnpm e2e" }],
    files: ["src/routes/meets/[id]/standings.tsx", "src/server/standings.ts", "e2e/standings.spec.ts"],
    decision: {
      question: "The standings e2e test times out on CI only (it passes locally). Skip it for this PR?",
      choices: ["Skip and open an issue", "Keep fixing", "Ask the board"],
    },
  },
  {
    id: "v-lifter", title: "Ironside lifter country", client: "ironside", issue: 12,
    branch: "fm-ironside-lifter-country", crewmate: "t56",
    history: [["08:10", "Request"], ["08:15", "Issue"], ["08:33", "Brief"], ["08:50", "Working"], ["10:05", "PR"], ["10:12", "CI"], ["10:31", "Preview"]],
    forks: [
      { name: "flag icons", from: "Working", to: "PR", start: "09:10", end: "09:48" },
      { name: "country backfill", from: "Working", to: "PR", start: "09:12", end: "10:01" },
      { name: "seed data", from: "Working", to: "PR", start: "09:15", end: "09:27" },
    ],
    weather: [{ kind: "tokens", at: "Working", fork: "country backfill", since: "09:40", text: "3× usual tokens" }],
    files: ["src/routes/lifters/[id].tsx", "src/lib/countries.ts"],
  },
  {
    id: "v-meet-export", title: "Meet results PDF export", client: "ironside", issue: 15,
    branch: "fm-meet-results-pdf", crewmate: "t5a",
    history: [["08:02", "Request"], ["08:06", "Issue"], ["08:20", "Brief"], ["08:31", "Working"], ["09:44", "PR"], ["09:50", "CI"], ["10:02", "Preview"], ["12:15", "Client reply", "waiting"]],
    forks: [],
    weather: [],
    files: ["src/routes/meets/[id]/results.pdf.ts"],
  },
  {
    id: "v-roster", title: "Coach roster CSV import", client: "fieldhouse", issue: 88,
    branch: "fm-roster-csv", crewmate: "t49",
    history: [["08:00", "Request"], ["08:03", "Issue"], ["08:12", "Brief"], ["08:25", "Working"], ["09:20", "PR"], ["09:26", "CI"], ["09:41", "Preview"], ["11:50", "Client reply", "waiting"], ["12:22", "Merged", "done"]],
    forks: [{ name: "csv fixtures", from: "Working", to: "PR", start: "08:40", end: "09:05" }],
    weather: [],
    files: ["app/coaches/import.ts"],
  },
];

// ---- Traces: what each crewmate did, turn by turn (the Log).
// A call: c(tool, label, at, seconds, tokens, cost, more?) where more may hold
//   err: true, input, output, kids (a sub-agent's own calls), running: true.
const c = (tool, label, at, dur, tok, cost, more = {}) => ({ tool, label, at, dur, tok, cost, ...more });

export const TRACES = {
  "v-referral": [
    {
      station: "Brief", at: "08:30:12", prompt: "Read issue #41 and write the brief.",
      calls: [
        c("Bash", "gh issue view 41 --comments", "08:30:15", 4, 1200, 0.004, { input: "gh issue view 41 --comments", output: "Birch referral untracked #41\nLeads created from the intake form never record how they heard about us.\n— Alex: “we lose track of who sent the Parkers”" }),
        c("Grep", "referral  src/", "08:30:22", 1, 800, 0.002, { output: "src/server/referrals.ts:12\nsrc/app/quotes/quotes.tsx:88\nsrc/app/intake/form.tsx:41" }),
        c("Read", "src/server/referrals.ts", "08:30:25", 1, 2100, 0.006),
        c("Read", "prisma/schema.prisma", "08:30:28", 1, 3400, 0.01),
        c("Write", ".agent/brief.md", "08:31:10", 2, 1900, 0.02, { output: "Brief: store referralSource on Lead, fill it from the intake form, show it in the quotes table." }),
      ],
    },
    {
      station: "Working", at: "08:52:04", prompt: "Implement the brief: store the referral source and show it in quotes.",
      calls: [
        c("Edit", "prisma/schema.prisma  +referralSource", "08:52:40", 2, 2600, 0.02),
        c("Bash", "pnpm prisma migrate dev --name referral-source", "08:53:01", 18, 900, 0.004, { output: "Applying migration `20260115_referral_source`\n✔ Generated Prisma Client" }),
        c("Agent", "test-writer: cover referral attribution", "08:53:30", 4200, 48200, 0.61, {
          kids: [
            c("Read", "tests/referrals.test.ts", "08:53:50", 1, 2200, 0.01),
            c("Write", "tests/referrals.test.ts", "09:20:02", 3, 5100, 0.06),
            c("Bash", "pnpm vitest run tests/referrals.test.ts", "09:58:40", 34, 1800, 0.01, { output: "✓ tests/referrals.test.ts (6 tests) 412ms" }),
          ],
        }),
        c("Edit", "src/server/referrals.ts", "10:04:12", 3, 4100, 0.04),
        c("Edit", "src/app/quotes/quotes.tsx  referral column", "10:20:30", 3, 6900, 0.07),
        c("Bash", "pnpm typecheck", "10:41:10", 41, 1200, 0.004, { output: "Found 0 errors." }),
      ],
    },
    {
      station: "PR", at: "10:48:00", prompt: "Inbox instruction waiting: read and act on each inbox message.",
      calls: [
        c("Bash", "for f in $(fdfind -e msg . $I); do cat \"$f\"; done", "10:48:01.9", 0.1, 162, 0.012),
        c("Bash", "fm-status.sh --task birch-customer-ledger", "10:48:09.0", 0.2, 751, 0.056),
        c("Bash", "python3 - \"$F\" \"$P\"  edit the ledger sidebar", "10:48:25.6", 5.1, 2157, 0.162),
        c("Bash", "python3 - \"$T\"  edit contract-portal-documents.test.ts", "10:48:37.9", 3.7, 954, 0.072),
        c("Bash", "git commit -qam \"fix(customer-page): keep a contract listed\u2026\"", "10:48:46.1", 28.9, 492, 0.037),
        c("Bash", "mv $I/003.msg $I/handled/; read the next message", "10:49:16.9", 0.1, 179, 0.013),
        c("Bash", "fm-status.sh --task birch-customer-ledger", "10:49:24.4", 0.1, 956, 0.072),
        c("Bash", "git commit -qam \"fix(customer-page): drop the Total label\u2026\"", "10:49:27.6", 19.3, 356, 0.027),
        c("Bash", "mv $I/004.msg $I/handled/", "10:49:48.6", 0.1, 158, 0.012),
        c("Agent", "qa-tester: Refresh ledger screenshots", "10:49:56.3", 0.0, 887, 0.067),
        c("Bash", "fm-status.sh --task birch-customer-ledger", "10:49:58.3", 0.1, 194, 0.015),
      ],
    },
    {
      station: "CI", at: "11:02:30", prompt: "CI failed on quotes.test.tsx. Fix it.",
      calls: [
        c("Bash", "gh run view --log-failed", "11:02:34", 6, 3800, 0.01),
        c("Read", "tests/quotes.test.tsx", "11:02:44", 1, 2900, 0.01),
        c("Bash", "pnpm test --filter quotes", "11:06:02", 196, 2400, 0.02, { err: true, input: "pnpm test --filter quotes", output: "FAIL tests/quotes.test.tsx > QuotesTable > renders referral\nTypeError: Cannot read properties of undefined (reading 'name')\n    at QuotesTable (src/app/quotes/quotes.tsx:142:31)" }),
        c("Edit", "src/app/quotes/quotes.tsx  lead?.referral?.name", "11:10:15", 2, 3100, 0.03),
        c("Bash", "pnpm test --filter quotes", "11:10:40", 201, 2400, 0.02, { output: "✓ tests/quotes.test.tsx (14 tests)" }),
        c("Bash", "git push", "11:14:05", 3, 300, 0.001),
      ],
    },
    {
      station: "CI", at: "12:36:10", prompt: "CI is red again after the rebase onto main.",
      calls: [
        c("Bash", "pnpm test --filter quotes", "12:36:14", 170, 2600, 0.02, { err: true, output: "FAIL tests/quotes.test.tsx > QuotesTable > renders referral\nExpected \"Google\" received \"\u2014\"" }),
        c("Edit", "tests/quotes.test.tsx  fixture referral", "12:39:20", 2, 2800, 0.03),
        c("Bash", "pnpm test --filter quotes", "12:39:30", 172, 2600, 0.02, { err: true, output: "FAIL tests/quotes.test.tsx > QuotesTable > renders referral\nExpected \"Google\" received \"\u2014\"" }),
        c("Edit", "src/app/quotes/quotes.tsx  fallback label", "12:42:40", 2, 3000, 0.03),
        c("Bash", "pnpm test --filter quotes", "12:42:50", 168, 2600, 0.02, { err: true, output: "FAIL tests/quotes.test.tsx > QuotesTable > renders referral\nExpected \"Google\" received \"\u2014\"" }),
        c("Bash", "pnpm test --filter quotes", "12:45:50", 171, 2600, 0.02, { err: true, output: "FAIL tests/quotes.test.tsx > QuotesTable > renders referral\nExpected \"Google\" received \"\u2014\"" }),
        c("Bash", "pnpm test --filter quotes", "12:48:55", 65, 900, 0.01, { running: true, output: "\u2026 running" }),
      ],
    },
  ],
  "v-change-orders": [
    {
      station: "Brief", at: "08:41:30", prompt: "Brief #38: signed change orders should land in the client's Drive folder.",
      calls: [
        c("Bash", "gh issue view 38", "08:41:33", 3, 1100, 0.004),
        c("Agent", "drive-api scout: how do we write to a shared Drive?", "08:45:00", 1020, 22400, 0.29, {
          kids: [
            c("WebFetch", "developers.google.com/drive/api/guides/manage-uploads", "08:45:20", 6, 9100, 0.08),
            c("Read", "src/lib/drive.ts", "08:51:02", 1, 2600, 0.01),
            c("Write", "notes/drive-upload.md", "09:00:40", 2, 1800, 0.02),
          ],
        }),
        c("Write", ".agent/brief.md", "09:03:10", 2, 2100, 0.02),
      ],
    },
    {
      station: "Working", at: "09:05:00", prompt: "Implement: on signature, upload the PDF to the job's Drive folder.",
      calls: [
        c("Read", "src/app/quotes/quotes.tsx", "09:05:10", 1, 7400, 0.03),
        c("Edit", "src/lib/drive.ts  uploadSignedPdf()", "09:20:40", 3, 5200, 0.05),
        c("Edit", "src/app/quotes/quotes.tsx  on signed hook", "10:02:11", 3, 6100, 0.06),
        c("Bash", "pnpm test --filter drive", "10:30:00", 88, 2200, 0.02, { output: "✓ tests/drive.test.ts (4 tests)" }),
        c("Agent", "pdf signer research: does e-sign return a PDF url?", "11:40:00", 4200, 31000, 0.38, {
          running: true,
          kids: [
            c("WebFetch", "e-sign.com/docs/api#get-a-submission", "11:40:30", 5, 8800, 0.07),
            c("Grep", "e-sign  src/", "11:52:10", 1, 600, 0.002),
          ],
        }),
      ],
    },
  ],
  "v-photos": [
    {
      station: "Brief", at: "10:40:00", prompt: "From the photo app meeting: show job photos on the quote.",
      calls: [
        c("Read", "meetings/2026-01-15-photos.md", "10:40:05", 1, 5200, 0.02),
        c("Agent", "photos api: list photos for a project", "10:42:00", 720, 14100, 0.18, {
          kids: [c("WebFetch", "docs.photos.com/reference/listprojectphotos", "10:42:20", 4, 7600, 0.06)],
        }),
      ],
    },
    {
      station: "Working", at: "10:55:00", prompt: "Build the photo strip on the quote page.",
      calls: [
        c("Write", "src/integrations/photos.ts", "10:58:00", 3, 4800, 0.05),
        c("Edit", "src/app/quotes/quotes.tsx  <PhotoStrip>", "11:20:40", 3, 6600, 0.07),
        c("Bash", "pnpm test", "11:58:00", 240, 3100, 0.03, { output: "✓ 12 tests" }),
      ],
    },
    {
      station: "PR", at: "12:05:00", prompt: "Open the PR and request review.",
      calls: [c("Bash", "gh pr create --fill", "12:05:10", 5, 900, 0.003)],
    },
  ],
  "v-sms": [
    {
      station: "Brief", at: "09:58:00", prompt: "Brief #43: texting through SMS.",
      calls: [
        c("Bash", "gh issue view 43 --comments", "09:58:04", 3, 1500, 0.005),
        c("WebFetch", "docs.SMS/templates", "10:02:00", 5, 8200, 0.07),
        c("Write", ".agent/brief.md  open question", "10:19:30", 2, 2300, 0.02, { output: "Needs a decision: templates (carrier approval, ~3 days) or free-form now." }),
      ],
    },
  ],
  "v-standings": [
    {
      station: "CI", at: "12:14:00", prompt: "CI failed on the PR: get it green.",
      calls: [
        c("Bash", "gh pr checks", "12:14:05", 3, 900, 0.003, { output: "e2e  fail  4m12s" }),
        c("Bash", "pnpm e2e standings", "12:16:00", 251, 2800, 0.02, { err: true, output: "standings.spec.ts:41 › updates live\nTimeout 30000ms exceeded waiting for row 'Ortiz'" }),
        c("Edit", "e2e/standings.spec.ts", "12:21:30", 1, 1400, 0.01),
        c("Bash", "pnpm e2e standings", "12:22:00", 244, 2700, 0.02, { err: true, output: "standings.spec.ts:41 › updates live\nTimeout 30000ms exceeded waiting for row 'Ortiz'" }),
        c("Bash", "pnpm e2e standings", "12:30:10", 238, 2700, 0.02, { err: true, output: "standings.spec.ts:41 › updates live\nTimeout 30000ms exceeded waiting for row 'Ortiz'" }),
        c("Write", ".agent/brief.md  open question", "12:42:40", 2, 1900, 0.015, { output: "Needs a decision: skip the standings e2e test for this PR, or keep fixing." }),
      ],
    },
  ],
  "v-lifter": [
    {
      station: "Working", at: "08:50:00", prompt: "Add a country to each lifter, with a flag on their page.",
      calls: [
        c("Agent", "general-purpose: flag icons", "09:10:00", 2280, 61000, 0.74, { kids: [c("Bash", "pnpm add country-flag-icons", "09:10:30", 9, 600, 0.002)] }),
        c("Agent", "general-purpose: country backfill from meet entries", "09:10:00", 2940, 88200, 1.06, { kids: [c("Bash", "pnpm tsx scripts/backfill-country.ts --dry", "09:30:00", 120, 4100, 0.04)] }),
        c("Edit", "src/routes/lifters/[id].tsx", "10:00:30", 3, 5400, 0.05),
      ],
    },
    {
      station: "Preview", at: "10:31:00", prompt: "Check the preview deploy.",
      calls: [c("Bash", "vercel inspect --wait", "10:31:10", 140, 900, 0.004, { running: true })],
    },
  ],
  "v-meet-export": [
    {
      station: "Working", at: "08:31:00", prompt: "Meet results as a PDF.",
      calls: [
        c("Write", "src/routes/meets/[id]/results.pdf.ts", "08:40:00", 3, 6200, 0.06),
        c("Bash", "pnpm test --filter results", "09:30:00", 62, 1400, 0.01),
      ],
    },
    {
      station: "Client reply", at: "12:15:00", prompt: "Email Taylor the preview link.",
      calls: [c("Write", "drafts/taylor-results-pdf.md", "12:15:20", 2, 1200, 0.01)],
    },
  ],
  "v-roster": [
    {
      station: "Working", at: "08:25:00", prompt: "Import coach rosters from CSV.",
      calls: [
        c("Write", "app/coaches/import.ts", "08:30:00", 3, 5600, 0.05),
        c("Agent", "general-purpose: csv fixtures", "08:40:00", 1500, 9200, 0.11, { kids: [c("Write", "tests/fixtures/roster.csv", "08:41:00", 1, 400, 0.002)] }),
        c("Bash", "pnpm test", "09:10:00", 95, 2100, 0.02),
      ],
    },
    {
      station: "Merged", at: "12:22:00", prompt: "Jordan approved. Merge.",
      calls: [c("Bash", "gh pr merge --squash", "12:22:05", 4, 300, 0.001)],
    },
  ],
};
