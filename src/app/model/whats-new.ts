/**
 * What changed, for somebody who was here before.
 *
 * Written as data rather than markup for the same reason the mechanism library
 * is: a release note is a list that grows, and a list that grows in a template
 * grows by copy-paste. The dialog renders whatever it finds here.
 *
 * The audience is a returning reader, which is what makes this hard to write
 * well. They do not want three hundred commits; they want to know what is in a
 * different place than they left it, and what the app can do now that it could
 * not. So the headline entries are the ones that change what is on screen or
 * what can be attempted, ordered by how likely a returning user is to walk into
 * them, and the small print underneath is everything that is a pleasant
 * surprise rather than a relearning.
 */

/** One thing worth saying, with the sentence that says why it matters. */
export interface ReleaseNote {
  /** The Material icon beside it. */
  icon: string;
  title: string;
  body: string;
}

/**
 * The version these notes are about.
 *
 * Kept beside the notes rather than read from the environment: what decides
 * whether a reader has seen this is whether they have seen *these words*, and
 * tying that to a build number means a patch release re-announces a feature
 * nobody re-shipped.
 */
export const WHATS_NEW_VERSION = '2026.09';

// Each em dash is glued to the word before it with a word joiner (U+2060), so a
// line may break after the dash but never start with one.
export const WHATS_NEW: ReleaseNote[] = [
  {
    icon: 'tab',
    title: 'Four modes, now along the top',
    body:
      'The left rail is gone. Synthesis, Edit, Kinematic Analysis, and Force Analysis live in ' +
      'the top bar\u2060—each with a chip showing when your mechanism is ready to solve.',
  },
  {
    icon: 'balance',
    title: 'Static and dynamic force analysis',
    body:
      'Add masses and applied forces to see per-link joint reactions and required input torque ' +
      'or force. Switch between Static and In-motion (dynamic), or overlay live vectors on the ' +
      'canvas.',
  },
  {
    icon: 'compress',
    title: 'Cylinders, sliders, and floating slots',
    body:
      'Add drivable hydraulic cylinders directly from the menu, cut slots into moving links as ' +
      'well as ground, weld links into rigid bodies, and fix link lengths or angles.',
  },
  {
    icon: 'account_tree',
    title: 'Multiple mechanisms in one drawing',
    body:
      'Draw up to four independent mechanisms on the same grid\u2060—each with its own input speed, ' +
      'direction, and playback scrubber.',
  },
  {
    icon: 'download',
    title: 'Export data, reports, and CAD drawings',
    body:
      'Export CSV or Excel tables, printable PDF reports, and DXF/SVG drawings for ' +
      'fabrication\u2060—plus browse an expanded 48-mechanism library.',
  },
];

/**
 * The rest, as one line each. Real, and not worth a paragraph.
 *
 * Empty for this release, and the dialog leaves the heading out when it is:
 * the card is what a returning reader meets before they can do anything, and
 * five notes is what fits in it without a scroll. Everything that would have
 * gone here — the library, the tutorial, the phone layout, the locks — is a
 * thing they will meet on their own the moment they look for it.
 */
export const WHATS_NEW_ALSO: string[] = [];
