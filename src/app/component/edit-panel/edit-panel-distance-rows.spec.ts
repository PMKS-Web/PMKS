import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { wireGraph } from '../../../test-utils/mechanism-harness';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { EditPanelComponent } from './edit-panel.component';

/**
 * A welded bar's length and angle live in its joints' Distance to Joints rows
 * (#279). Two things the rows owe the reader, both from the #315 review: a
 * typed number is one step of Undo, and the rows type into the drawing as it
 * is now, not as it was before an undo rebuilt it under the same ids.
 */

const S = MODEL_SCALE;

describe('Distance to Joints on a welded body', () => {
  let fixture: ComponentFixture<EditPanelComponent>;
  let mechanism: MechanismService;
  let active: ActiveObjService;

  /** Bars AB and BC welded at B: one body, two bars a joint can be measured along. */
  function weldedBody() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4 * S, 0);
    const c = new RevJoint('C', 4 * S, 3 * S);
    mechanism.joints = [a, b, c];
    mechanism.links = [new RealLink('AB', [a, b]), new RealLink('BC', [b, c])];
    wireGraph(mechanism);
    mechanism.weldJoint(b);
    return { a, b, c };
  }

  function select(joint: RevJoint) {
    active.updateSelectedObj(joint);
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    // The rows are rebuilt on the next turn, after the panel has drawn.
    vi.runAllTimers();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [EditPanelComponent],
      providers: [provideAnimations()],
    }).compileComponents();
    mechanism = TestBed.inject(MechanismService);
    active = TestBed.inject(ActiveObjService);
    fixture = TestBed.createComponent(EditPanelComponent);
  });

  afterEach(() => vi.useRealTimers());

  it('saves a typed length on a bar no hold reaches as its own undo step', () => {
    const { c } = weldedBody();
    select(c);
    const panel = fixture.componentInstance;
    expect(panel.distanceRows.map((row) => row.bar?.id)).toEqual(['BC']);
    const save = vi.spyOn(mechanism, 'save');

    panel.otherJoints.controls[0].setValue('5');
    expect(save).toHaveBeenCalledTimes(1);

    save.mockClear();
    panel.otherJoints.controls[1].setValue('45');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the rows when an undo hands back new parts under the same ids', () => {
    const { c } = weldedBody();
    select(c);
    const panel = fixture.componentInstance;
    const before = panel.distanceRows[0];

    // What an undo does: decode the drawing again, every part a new object
    // with the old id, and put the same selection back on it.
    const again = weldedBody();
    active.restorePartSelection(
      { refs: [{ kind: 'joint', id: 'C' }] },
      mechanism.joints,
      mechanism.links
    );
    fixture.detectChanges();
    vi.runAllTimers();

    const after = panel.distanceRows[0];
    expect(after.bar?.id).toBe(before.bar?.id);
    expect(after.joint).not.toBe(before.joint);
    expect(after.joint).toBe(again.b);
    expect(
      mechanism.links.some((root) => root instanceof RealLink && root.subset.includes(after.bar!))
    ).toBe(true);
  });
});
