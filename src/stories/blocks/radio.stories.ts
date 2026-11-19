import { FormControl, FormGroup } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { RadioComponent } from '../../app/component/BLOCKS/radio/radio.component';
import { inPanel } from '../support/frame';

/**
 * `radio-block`: a labeled pick-one bound to a form control. It draws the same
 * pill as `segmented-block`; the control holds the chosen index as a string.
 */
const meta: Meta = {
  title: 'Choices/Radio',
  component: RadioComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Force Frame',
    tooltip: 'Whether this force keeps its direction on the page or turns with its link.',
    option1: 'Global',
    option2: 'Local',
    option3: undefined,
    disabled: false,
    weighted: false,
  },
  render: (args) => ({
    props: { ...args, form: new FormGroup({ choice: new FormControl('0') }) },
    template: `
      <radio-block
        [formGroup]="form"
        _formControl="choice"
        [tooltip]="tooltip"
        [option1]="option1"
        [option2]="option2"
        [option3]="option3"
        [disabled]="disabled"
        [weighted]="weighted"
      >{{ label }}</radio-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const TwoOptions: Story = {};

/** Settings' Length Units: labels of very different lengths, split by length. */
export const ThreeOptions: Story = {
  args: {
    label: 'Length Units',
    tooltip: 'The length unit the whole drawing is measured in.',
    option1: 'Inch (in)',
    option2: 'Centimeter (cm)',
    option3: 'Meter (m)',
    weighted: true,
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const LongLabels: Story = {
  args: {
    label: 'Graph',
    tooltip: 'What the chart plots.',
    option1: 'Position',
    option2: 'Velocity',
    option3: 'Acceleration',
  },
};
