/**
 * Where the app's logo lives, and its shape.
 *
 * Everything under `assets/brand/` is drawn by `npm run brand` from the rules in
 * `brand/`, and the landing page links to these same addresses instead of keeping
 * copies, so they are the only set there is. `docs/brand.md` says what each file
 * is for.
 */
export const LOGO_URL = 'assets/brand/pmks-logo.svg';

/**
 * The logo's width over its height, from its viewBox.
 *
 * A picture that has to reserve the logo's room before it has loaded it -- an
 * exported graph lays out its title beside the mark -- needs the number, and
 * `brand.spec.ts` holds it to the file so a redrawn logo cannot leave it behind.
 */
export const LOGO_ASPECT = 90.029 / 34.55;
