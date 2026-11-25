import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DialogButtonComponent } from '../../app/component/BLOCKS/dialog-button/dialog-button.component';
import { atWidth } from '../support/frame';

/**
 * `dialogButton`: a button in a dialog's action row, as an attribute on a real
 * `<button>` so `mat-dialog-close` and `cdkFocusInitial` keep working.
 *
 * Three weights and one rule: **Cancel is quiet, the action the dialog asks
 * about is filled, and a second way forward is outlined.** There used to be
 * four looks for this row; the tutorial's "clear the grid?" put Cancel and the
 * button that deletes the drawing in the same gray text.
 */
const meta: Meta<DialogButtonComponent> = {
  title: 'Actions/Dialog Button',
  component: DialogButtonComponent,
  tags: ['autodocs'],
  decorators: [atWidth(460)],
};

export default meta;
type Story = StoryObj<DialogButtonComponent>;

/** The three weights side by side. */
export const Weights: Story = {
  render: () => ({
    moduleMetadata: { imports: [DialogButtonComponent] },
    template: `
      <div style="display: flex; gap: 8px">
        <button dialogButton="quiet">Cancel</button>
        <button dialogButton="outlined">New Tab</button>
        <button dialogButton="filled">Replace</button>
      </div>`,
  }),
};

/**
 * A confirmation with one way forward: the tutorial's "Start the tutorial?".
 * The answer that clears the grid is the filled one.
 */
export const Confirm: Story = {
  render: () => ({
    moduleMetadata: { imports: [DialogButtonComponent] },
    template: `
      <div style="padding: 24px; border-radius: 8px; background: var(--surface);
                  box-shadow: var(--card-shadow)">
        <div style="font-size: 20px; font-weight: 500">Start the tutorial?</div>
        <p style="color: var(--text-secondary)">
          The tutorial builds a four-bar from an empty grid, so starting it clears the grid.
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <button dialogButton="quiet">Cancel</button>
          <button dialogButton="filled">Clear and Start</button>
        </div>
      </div>`,
  }),
};

/** Two ways forward: the library's "Open Four-Bar?". The second is outlined. */
export const TwoWaysForward: Story = {
  render: () => ({
    moduleMetadata: { imports: [DialogButtonComponent] },
    template: `
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <button dialogButton="quiet">Cancel</button>
        <button dialogButton="outlined">New Tab</button>
        <button dialogButton="filled">Replace</button>
      </div>`,
  }),
};
