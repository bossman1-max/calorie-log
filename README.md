# Calorie Log

A tap-first daily food and training log. You log meals as you eat them, and every week or
two you hit one button that puts a cleanly formatted block of days on your clipboard,
ready to paste into Claude for the calorie maths.

The point of the app is to remove typing. The date, the meal headings and the split are
structure the app owns. Anything you have eaten before becomes a one-tap chip.

## Run it

```bash
npm start
```

Then open <http://localhost:3000>. There are no dependencies to install and no build step,
so `npm install` is optional. Node 18 or newer.

## How it works

Everything lives in your browser's `localStorage` under one key, `clog-v1`. There is no
database, no account, no API key, and the server does nothing but hand over static files.
That means the app works offline and your log never leaves the device.

### Today

The date is already chosen: the app opens on today. The arrows step a day at a time and
tapping the date opens a picker for backfilling one you missed.

- **Split**: one tap. The app guesses your next split by looking at what usually follows
  the last one you logged, and shows that guess as a dashed chip.
- **Meals**: type and press Enter, or tap a chip. Chips are the foods you most often eat
  *in that meal*, so breakfast offers breakfasts. Typing searches everything you have ever
  logged. Tap an entry to edit it, tap the × to remove it.
- **Protein shake**, **weight**, **note**: all optional except the shake, which always
  records a yes or a no.

Throughout the app a **dashed border means a suggestion and a solid one means a record**.

### Copy

Built for copying in batches rather than every day.

- **Copy new days** is the main one. It hands you everything since the last time you
  copied, so nothing is sent twice and nothing is missed. It advances the marker only
  once the text has actually reached the clipboard.
- **Last 7 / Last 14 / This day only / Everything**, plus a **From / To** pair for any
  other window.
- A preview shows exactly what will be copied before you commit. Days with nothing logged
  are skipped, and the app says how many it skipped rather than hiding the gap.

### Output format

```
Food log · 12-23 Oct 2026 · 12 days

12 Oct 2026 (Sun) · Rest

Breakfast
- 2 eggs, 2 slices wholemeal toast
- black coffee

Lunch
- roasted chicken rice, no skin

Protein shake: no
Weight: 72.8 kg
Note: slept badly

---

13 Oct 2026 (Mon) · Push
...
```

Empty meal sections are left out. `Weight` and `Note` appear only when filled.
`Protein shake` always prints, because a skipped shake is real information.
A single day is copied without the range header.

### History and Settings

History lists every logged day; the dot on the left is filled once a day has been copied.
Settings holds the split editor, backup download and import, the copy marker (move it back
to re-copy a window), and a delete-everything button with an undo.

## Backups

Your log lives on this device only. Clearing the browser's data wipes it. **Settings →
Download backup** writes a dated `.json` you can re-import later. Worth doing occasionally.

## Files

```
server.js            static file server, ~60 lines, no dependencies
public/index.html    all four screens, no router
public/styles.css    design tokens then layout
public/app.js        state, rendering, formatting, export
public/sw.js         offline shell (stale-while-revalidate)
public/manifest.json PWA manifest
tools/make_icons.py  regenerates the icons (needs Pillow)
```

## Deploying to Render

The app has no secrets, no database and no environment variables, so this is about as
simple as a deploy gets.

1. **Make an empty GitHub repo.** <https://github.com/new>, name it `calorie-log`, public
   or private both work. Do **not** tick "Add a README", because the folder already has one.
2. **Push this folder, and only this folder.** It is its own git repo, separate from the
   IGP coursework around it. From `calorie-log/`:
   ```bash
   git remote add origin https://github.com/<you>/calorie-log.git
   git branch -M main
   git push -u origin main
   ```
3. **In Render:** New + -> Blueprint -> pick the repo -> Apply. It reads `render.yaml` and
   needs nothing else from you. First build takes a couple of minutes.
4. **Open the URL** it gives you. This app is live at <https://calorie-log-k9xq.onrender.com>.
   Check `/healthz` returns `ok`.
5. **Install it on your iPhone:** open the URL in Safari (it must be Safari, Chrome on iOS
   cannot install web apps), then Share -> Add to Home Screen. Launch it from the home
   screen and it opens with no address bar.

Render appends a random suffix when the plain name is taken, so the live URL is
`calorie-log-k9xq.onrender.com`. If you ever recreate the service and the suffix changes, update the URL in
`.github/workflows/keep-alive.yml` and in the cron-job.org job.

### A note on your data

The log lives in browser storage, which is **per browser and per device**. The entries you
made on your desktop will not appear on your phone. To carry them over: Settings ->
Download backup on the desktop, send yourself the file, then Settings -> Import backup on
the phone. After that, treat the phone as the real log.

## Keeping it awake

Free Render services sleep after 15 minutes idle and take about a minute to wake, which is
annoying when you just want to log a meal. A scheduled ping to `/healthz` prevents it.

**Budget first.** Render gives **750 instance hours per workspace per month** and a 31-day
month is 744 hours. Pinging around the clock would eat the entire allowance on this one app
and get every free service in the workspace, Kiki included, suspended until the 1st.
So ping during waking hours only:

| Ping schedule | Hours used in a 31-day month | Headroom left |
|---|---|---|
| Around the clock | 744 | 6 |
| 07:00-24:00 SGT | 527 | 223 |

### Recommended: cron-job.org

Free, reliable, and it never switches itself off.

1. Sign up at <https://cron-job.org>.
2. Create a cronjob with URL `https://calorie-log-k9xq.onrender.com/healthz`.
3. Schedule: every 10 minutes.
4. Open the job's advanced settings and **restrict it to hours 07:00-23:00**, with the
   timezone set to Asia/Singapore. This is the step that protects the hours budget.

### Fallback: the included GitHub Action

`.github/workflows/keep-alive.yml` does the same thing and costs nothing, but **GitHub
silently disables scheduled workflows after 60 days without a new commit to the repo**.
That is exactly what happened to the Kiki keep-alive: the file was correct, GitHub had
just turned it off. If you rely on this, check Actions every month or so for a yellow
"This scheduled workflow is disabled" banner and press Enable workflow.

Either way the service worker already caches the app shell, so the app opens instantly from
your home screen even if the server is still waking up. The ping is about making the first
page load fast, not about whether the app works.

