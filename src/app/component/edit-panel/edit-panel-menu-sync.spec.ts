import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { wireGraph } from '../../../test-utils/mechanism-harness';
import { ContextMenuModel, MenuRow } from '../BLOCKS/context-menu/menu-model';
import { Coord } from '../../model/coord';
import { EditState } from '../../model/edit-permission';
import { Force } from '../../model/force';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { ActiveObjService } from '../../services/active-obj.service';
import {
  ContextMenuBuilderService,
  MenuHandlers,
} from '../../services/context-menu-builder.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { MechanismService } from '../../services/mechanism.service';
import { EditPanelComponent } from './edit-panel.component';

/**
 * Principle 5 of `docs/editing-rules.md`: the Edit panel and the context menu
 * are two doors to one set of actions, so wherever both offer an action they
 * give the same answer. Issue #256 was the two disagreeing about Add Tracer
 * Point and Add Force at a paused pose.
 *
 * Each case names a panel control and the menu row of the same action, and the
 * spec walks both through the start pose and a paused mid-cycle pose.
 */

const S = MODEL_SCALE;

const noHandlers: MenuHandlers = {
  attachLink: () => {},
  attachCylinder: () => {},
  attachTracerPoint: () => {},
  attachForce: () => {},
  backgroundImage: () => {},
  deletePosition: () => {},
  deleteAllPositions: () => {},
  duplicateSelected: () => {},
  deleteSelected: () => {},
};

const STATES: Record<string, EditState> = {
  'at the start': {
    mode: 'edit',
    playing: false,
    atStart: true,
    sharedStepZero: true,
    solveDeferred: false,
    empty: false,
    runnable: true,
  },
  'paused mid-cycle': {
    mode: 'edit',
    playing: false,
    atStart: false,
    sharedStepZero: false,
    solveDeferred: false,
    empty: false,
    runnable: true,
  },
};

describe('the Edit panel and the context menu agree', () => {
  let fixture: ComponentFixture<EditPanelComponent>;
  let active: ActiveObjService;
  let builder: ContextMenuBuilderService;
  let parts: ReturnType<typeof fourBar>;

  /** A crank-rocker with a tracer point T on its coupler and a force on the crank. */
  function fourBar(mechanism: MechanismService) {
    const o = new RevJoint('O', 0, 0, false, true);
    const a = new RevJoint('A', 0, 2 * S);
    const c = new RevJoint('C', 3 * S, 2 * S);
    const d = new RevJoint('D', 3 * S, 0, false, true);
    const t = new RevJoint('T', 2 * S, 3 * S);
    const crank = new RealLink('OA', [o, a], 1, 1);
    const coupler = new RealLink('ACT', [a, c, t], 1, 1);
    const rocker = new RealLink('CD', [c, d], 1, 1);
    mechanism.joints = [o, a, c, d, t];
    mechanism.links = [crank, coupler, rocker];
    const force = new Force('F1', crank, new Coord(0, S), new Coord(S, S));
    mechanism.forces = [force];
    wireGraph(mechanism);
    return { o, a, t, crank, coupler, force };
  }

  function rows(model: ContextMenuModel): MenuRow[] {
    return model.groups.flatMap((group) => group.rows);
  }

  function menuRow(model: ContextMenuModel, label: string): MenuRow {
    const found = rows(model).find((r) => r.label.startsWith(label));
    if (!found) throw new Error(`no menu row ${label}`);
    return found;
  }

  function panelButton(label: string): HTMLButtonElement {
    const found = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) => button.getAttribute('aria-label') === label
    );
    if (!found) throw new Error(`no panel button ${label}`);
    return found as HTMLButtonElement;
  }

  function select(part: RevJoint | RealLink | Force): ContextMenuModel {
    active.updateSelectedObj(part);
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    return builder.build(part, noHandlers);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPanelComponent],
      providers: [provideAnimations()],
    }).compileComponents();
    parts = fourBar(TestBed.inject(MechanismService));
    active = TestBed.inject(ActiveObjService);
    builder = TestBed.inject(ContextMenuBuilderService);
    fixture = TestBed.createComponent(EditPanelComponent);
  });

  for (const [name, state] of Object.entries(STATES)) {
    describe(name, () => {
      beforeEach(() => {
        vi.spyOn(TestBed.inject(EditPermissionService), 'state').mockReturnValue({ ...state });
      });

      it('agrees about a joint that holds the mechanism together', () => {
        const menu = select(parts.o);
        const panel = fixture.componentInstance;
        expect(panelButton('Delete').disabled).toBe(menuRow(menu, 'Delete Joint').disabled);
        expect(panelButton('Add Input').disabled).toBe(menuRow(menu, 'Driven Input').disabled);
        expect(panelButton('Split Joint').disabled).toBe(menuRow(menu, 'Split Joint').disabled);
        expect(panel.jointForm.controls['ground'].disabled).toBe(
          menuRow(menu, 'Grounded').disabled
        );
        const menuRefused = menu
          .choice!.options.map((option, index) => (option.refusal ? index : -1))
          .filter((index) => index >= 0);
        expect([...panel.jointTypeChoice!.disabledAt].sort()).toEqual(menuRefused.sort());
        // The rule as well as the agreement: mid-cycle, structure waits.
        expect(menuRow(menu, 'Grounded').disabled).toBe(!state.atStart);
      });

      it('agrees about a tracer point, which is an annotation', () => {
        const menu = select(parts.t);
        expect(panelButton('Delete').disabled).toBe(menuRow(menu, 'Delete Joint').disabled);
        expect(menuRow(menu, 'Delete Joint').disabled).toBe(!state.atStart);
      });

      it('agrees about adding a tracer point or a force to a link', () => {
        const menu = select(parts.crank);
        expect(panelButton('Add Tracer Point').disabled).toBe(
          menuRow(menu, 'Tracer Point').disabled
        );
        expect(panelButton('Add Force').disabled).toBe(menuRow(menu, 'Force').disabled);
        expect(menuRow(menu, 'Force').disabled).toBe(!state.atStart);
      });

      it('agrees about a force', () => {
        const menu = select(parts.force);
        expect(panelButton('Delete').disabled).toBe(menuRow(menu, 'Delete Force').disabled);
        expect(fixture.componentInstance.forceLoadRefused()).toBe(
          menuRow(menu, 'Flip Force').disabled
        );
      });
    });
  }
});
