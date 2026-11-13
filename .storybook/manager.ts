import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

/**
 * The gallery's own name in the sidebar, and the repository behind it. The
 * title links to the repository rather than to the gallery's home, so a
 * reader who arrived at the hosted copy can find the source in one click.
 *
 * The logo is the app's own file, served from `src/assets`; `brandTitle`
 * becomes its alt text.
 */
addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: 'PMKS UI',
    brandImage: './assets/brand/pmks-logo.svg',
    brandUrl: 'https://github.com/PMKS-Web/PMKS',
    brandTarget: '_blank',
  }),
});
