/**
 * Every event the app reports to Google Analytics, and what each one carries.
 *
 * This is the whole list: `AnalyticsService.track` accepts nothing that is not
 * named here, so a new event is added here first, with its parameters typed,
 * and `docs/analytics.md` says what it is for and how to register it.
 *
 * Names follow GA4's recommended events where one fits (`share`,
 * `tutorial_begin`, `tutorial_complete`, `exception`), so the reports Google
 * already builds for those work, and are our own otherwise.
 *
 * **Nothing the reader made is ever sent.** No mechanism, no part letter, no
 * name a reader typed, no number from the drawing. Parameters are drawn from
 * fixed vocabularies the app itself owns: a template's id from the library, a
 * family PMKS recognized, a graph's own label. The Help panel tells the reader
 * so, and that sentence has to stay true.
 */

/** How the reader arrived. */
export type AppEntry =
  /** Nothing in the address: a fresh grid. */
  | 'blank'
  /** A mechanism in the address: a shared link, the landing page, a template in a new tab. */
  | 'link'
  /** `?library`, the landing page's "Browse the mechanism library". */
  | 'library'
  /** A refresh or Back, which brings the last drawing back. */
  | 'restored'
  /** An address that could not be read at all. */
  | 'bad_link';

/** The two analysis modes and Synthesis. Edit is where every session starts, so it is not counted. */
export type ReportedMode = 'synthesis' | 'kinematic' | 'force';

type NoParams = Record<never, never>;

export interface AnalyticsEvents {
  app_start: { entry: AppEntry };
  template_open: { template: string; placement: 'here' | 'new_tab' };
  tutorial_begin: NoParams;
  tutorial_complete: NoParams;
  /** An edit of the reader's made something run that did not before. */
  mechanism_runs: { family: string };
  playback_start: NoParams;
  mode_open: { mode: ReportedMode };
  /** A graph the reader opened; the ones open by default are not counted. */
  graph_open: { analysis: string; graph: string };
  synthesis_run: NoParams;
  export_data: { format: string };
  share: { method: 'copy_link'; content_type: 'mechanism' };
  new_project: NoParams;
  open_file: NoParams;
  save_file: NoParams;
  help_link_click: { destination: 'help_site' | 'github' };
  exception: { description: string; fatal: boolean };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** The parameters an event takes, as rest arguments: none for an event that has none. */
export type AnalyticsArgs<K extends AnalyticsEventName> = keyof AnalyticsEvents[K] extends never
  ? []
  : [AnalyticsEvents[K]];

/** The one host that reports. Previews, branch deploys and localhost would count us as students. */
export const REPORTING_HOST = 'app.pmksplus.com';

/** GA4 truncates a parameter at 100 characters. */
const MOST_PARAMETER_LENGTH = 100;

/**
 * An error, as one line safe to send.
 *
 * What the message quotes is cut out, and so is every number and any long
 * unbroken run: an error can quote a name the reader typed or a value from
 * their drawing, and a decode error can quote the mechanism's whole payload.
 * What is left is the shape of the failure, which is what finding it needs.
 */
export function describeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  return raw
    .replace(/(['"`]).*?\1/g, '…')
    .replace(/\S{24,}/g, '…')
    .replace(/\b\d+(\.\d+)?\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MOST_PARAMETER_LENGTH);
}
