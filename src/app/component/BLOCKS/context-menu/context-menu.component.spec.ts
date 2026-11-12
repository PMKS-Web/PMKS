import { TestBed } from '@angular/core/testing';
import { ContextMenuComponent } from './context-menu.component';
import { MenuChoice, MenuRefusal } from './menu-model';

/**
 * The joint-type grid when the mechanism is parked mid-cycle: every value but
 * the chosen one is refused. The chosen one used to stay live, take the hover
 * and the focus ring, and read as the one value left to press (#262).
 */
function choice(refusals: (MenuRefusal | undefined)[]): MenuChoice {
  return {
    label: 'Joint Type',
    chosen: 0,
    posePolicy: 'design',
    options: refusals.map((refusal, index) => ({
      label: `Type ${index}`,
      icon: 'revolute',
      refusal,
      action: () => undefined,
    })),
  };
}

const PARKED: MenuRefusal = {
  short: 'return to start',
  long: 'The mechanism is parked mid-cycle.',
};

describe('ContextMenuComponent choice', () => {
  function setUp() {
    return TestBed.createComponent(ContextMenuComponent).componentInstance;
  }

  it('settles the chosen value when every other value is refused', () => {
    const menu = setUp();
    const parked = choice([undefined, PARKED, PARKED, PARKED]);
    expect(menu['settled'](parked)).toBe(true);
    expect(menu.hoverTextFor(parked, parked.options[0], 0)).toBe(PARKED.long);
  });

  it('leaves the chosen value live while another value can be chosen', () => {
    const menu = setUp();
    const open = choice([undefined, undefined, PARKED, PARKED]);
    expect(menu['settled'](open)).toBe(false);
    expect(menu.hoverTextFor(open, open.options[0], 0)).toBe('');
  });

  it('says nothing on the chosen value when the others are refused for different reasons', () => {
    const menu = setUp();
    const mixed = choice([undefined, PARKED, { short: 'needs a slot', long: 'Needs a slot.' }]);
    expect(menu['settled'](mixed)).toBe(true);
    expect(menu.hoverTextFor(mixed, mixed.options[0], 0)).toBe('');
  });
});
