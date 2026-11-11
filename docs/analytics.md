# Analytics

> **Status:** Reference — what the app reports to Google Analytics, why, and how to add an event.

The app and the landing page (pmksplus.com) report to **one GA4 property**, "PMKS+", in the
`pmksplus` Firebase project. Each site is a web stream in it:

| Stream | Measurement ID | Sends from |
| --- | --- | --- |
| The app | `G-XQ0PBWVW9H` | app.pmksplus.com only |
| The landing page | `G-8L78VV194T` | pmksplus.com only |

Both sites set the `_ga` cookie on `.pmksplus.com`, so one visitor reading a guide and then
opening the app is one user in one property. Each stream lists the other site as an unwanted
referral, so a visitor keeps the source they arrived from (Google, a course page) as they cross.
The landing page's history before November 2026 is in the old `pmks-landing` property.

## What is never sent

**Nothing the reader made.** No mechanism, no part letter, no name a reader typed, no number from
the drawing. Every parameter comes from a vocabulary the app owns: a template's id, a family PMKS
recognized, a graph's own label, a file format. The Help panel's Privacy section tells the reader
this, so a change here that would make that sentence false has to change the sentence, or more
likely not be made.

Two places need care:

- **The page address.** A shared mechanism *is* the query string. `AnalyticsService` reports every
  page as `https://app.pmksplus.com/`, so GA never records a drawing as a page.
- **Error descriptions.** `describeError` cuts out whatever a message quotes, every standalone
  number, and any long unbroken run of characters (which is what a mechanism payload looks like
  when a decode error quotes one). What is left is the shape of the failure:
  `Error: No link named … at #, -#`.

That is also why setup issues are not reported yet: their titles name parts (`Joint C can't be the
input`), and a link's label can be a name the reader typed. Reporting them needs a stable code on
`SetupIssue` first.

## Where it reports from

Every Netlify deploy, previews included, is a production build. **Only app.pmksplus.com sends
anything.** On localhost, a branch deploy or a deploy preview each event is written to the console
instead, as `[analytics] name {params}` at the Debug level (Chrome hides Debug unless "Verbose" is
ticked). That is how to check a new event before it ships.

The dev Firebase project (`pmksplus-dev`, in `environment.ts`) therefore receives nothing now. Its
config is left in place because the two environment files must have the same shape.

### Checking that GA receives an event

The console shows what would be sent; to see a real request leave, serve a production build and
have the browser believe it is app.pmksplus.com. `ng serve` refuses a host it does not know, so use
the built files:

```bash
npm run build && (cd dist/pmksweb && python3 -m http.server 4311 --bind 127.0.0.1)
```

Then launch Chromium with `--host-resolver-rules=MAP app.pmksplus.com 127.0.0.1`, open
`http://app.pmksplus.com:4311/`, and watch for requests to `google-analytics.com/g/collect`.
**Abort them** in the route handler (`route.abort()`) after reading them, or the check is counted in
the live property as a visit. Each request's `en` is the event, `ep.*` its parameters, `up.*` the
user properties, and `dl` the page address -- which should be the bare origin, never a mechanism.

## Events

The typed list is `src/app/model/analytics-events.ts`; `AnalyticsService.track` accepts nothing
else. "Once" means once per visit for each set of parameters (`trackOnce`).

| Event | When | Parameters |
| --- | --- | --- |
| `app_start` | The app opens | `entry`: `blank`, `link`, `library`, `restored`, `bad_link` |
| `template_open` | A library card is opened | `template` (its id), `placement`: `here`, `new_tab` |
| `tutorial_begin` | Start Tutorial, or restart (not Resume) | |
| `tutorial_complete` | The tutorial's last step is done | |
| `mechanism_runs` | Once: an edit of the reader's makes something run that did not | `family` |
| `playback_start` | Once: Play is pressed, or a machine's own Play when unsynced | |
| `mode_open` | Once per mode: Synthesis or an analysis is opened | `mode`: `synthesis`, `kinematic`, `force` |
| `graph_open` | Once per graph: the reader opens one (those open by default are not counted) | `analysis`, `graph` |
| `synthesis_run` | Generate Solutions | |
| `export_data` | Export Data writes a file | `format` |
| `share` | Copy Link | `method` (`copy_link`), `content_type` (`mechanism`) |
| `new_project`, `open_file`, `save_file` | The project menu | |
| `help_link_click` | A link in Help | `destination`: `help_site`, `github` |
| `exception` | Once per message: an uncaught error | `description`, `fatal` (`false`) |

And one user property, `app_version`, so behavior can be read against the release that made it.

`mechanism_runs` is the one worth understanding before reading it. A template, a shared link or an
opened file that already runs does not count: the URL reader sets `MechanismService.arriving`
while a different drawing comes in, and `arrived()` records whether it ran -- after an undo or redo
too, so an edit is never credited with what the undo did. What counts is the
first undoable edit after which something runs that did not before -- the moment a student's own
build works.

### Names that changed

Before this list, the app sent `copyURL`, `upload_file`, `download_linkage`,
`export_data_<format>`, `goto_help_site`, `goto_github` and two debug-panel events. They are now
`share`, `open_file`, `save_file`, `export_data` with a `format`, and `help_link_click`, and the
debug events are gone. Reports that span the change need both names.

## Adding an event

1. Add it to `AnalyticsEvents` with its parameters typed. Prefer a [GA4 recommended
   event](https://support.google.com/analytics/answer/9267735) where one fits.
2. Call `track` or `trackOnce` where it happens.
3. Add a row above.
4. In GA (Admin → Custom definitions), register each new parameter as an event-scoped custom
   dimension. Until then a report cannot show it, and it is not filled in retroactively.
5. If it is a conversion, mark it as a key event (Admin → Events).

The custom dimensions the app's events need:

| Dimension | Parameter | Scope |
| --- | --- | --- |
| Entry | `entry` | Event |
| Placement | `placement` | Event |
| Family | `family` | Event |
| Mode | `mode` | Event |
| Analysis | `analysis` | Event |
| Graph | `graph` | Event |
| Format | `format` | Event |
| App version | `app_version` | User |

`template` and `destination` are already registered for the landing page's events and serve both
sites; filter by event name to tell them apart. `share`'s parameters and `exception`'s
`description` are left unregistered on purpose: the counts are what is read.
