import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { ActiveObjService } from './active-obj.service';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { Force } from '../model/force';
import { Coord } from '../model/coord';

describe('ActiveObjService part selection', () => {
  function scene() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const sameId = new RealLink('A', [a, b]);
    return { active: new ActiveObjService(), a, b, sameId };
  }

  it('replaces the selection while preserving singular compatibility', () => {
    const { active, a } = scene();

    active.replacePartSelection(a);

    expect(active.objType).toBe('Joint');
    expect(active.selectedJoint).toBe(a);
    expect(active.getSelectedObj()).toBe(a);
    expect(active.selectedPartRefs).toEqual([{ kind: 'joint', id: 'A' }]);
    expect(active.primaryPart).toBe(a);
  });

  it('orders toggled parts and makes the last added part primary', () => {
    const { active, a, b } = scene();

    active.togglePartSelection(a);
    active.togglePartSelection(b);

    expect(active.objType).toBe('MultiSelection');
    expect(active.selectedPartRefs).toEqual([
      { kind: 'joint', id: 'A' },
      { kind: 'joint', id: 'B' },
    ]);
    expect(active.primaryPartRef).toEqual({ kind: 'joint', id: 'B' });
    expect(active.selectedJoint).toBe(b);
  });

  it('starts a new selection when a part of another kind is added', () => {
    // One kind at a time (#295 review). The link shares joint A's id, so this
    // is also the kind, not the id, deciding.
    const { active, a, b, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(b);

    active.togglePartSelection(sameId);
    expect(active.selectedPartRefs).toEqual([{ kind: 'link', id: 'A' }]);
    expect(active.objType).toBe('Link');
    expect(active.primaryPart).toBe(sameId);

    const force = new Force('F1', sameId, new Coord(a.x, a.y), new Coord(b.x, b.y));
    active.togglePartSelection(force);
    expect(active.selectedPartRefs).toEqual([{ kind: 'force', id: 'F1' }]);
    expect(active.objType).toBe('Force');

    active.togglePartSelection(a);
    expect(active.selectedPartRefs).toEqual([{ kind: 'joint', id: 'A' }]);
  });

  it('toggles an existing member out and promotes the last survivor', () => {
    const { active, a, b } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(b);

    active.togglePartSelection(b);

    expect(active.selectedPartRefs).toEqual([{ kind: 'joint', id: 'A' }]);
    expect(active.primaryPart).toBe(a);
    expect(active.objType).toBe('Joint');
  });

  it('clears part state on a blank-grid selection', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);

    active.updateSelectedObj(undefined);

    expect(active.objType).toBe('Grid');
    expect(active.selectedParts).toEqual([]);
    expect(active.primaryPart).toBeUndefined();
  });

  it('reconciles references to rebuilt objects and drops deleted members', () => {
    const { active, a, b } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(b);
    const rebuiltA = new RevJoint('A', 3, 4);
    const rebuiltB = new RevJoint('B', 5, 4);

    active.reconcilePartSelection([rebuiltA, rebuiltB], []);

    expect(active.selectedParts).toEqual([rebuiltA, rebuiltB]);
    expect(active.selectedJoint).toBe(rebuiltB);

    active.reconcilePartSelection([rebuiltA], []);
    expect(active.selectedParts).toEqual([rebuiltA]);
    expect(active.objType).toBe('Joint');
    expect(active.primaryPart).toBe(rebuiltA);
  });

  it('restores an ordered snapshot without serializing object references', () => {
    const { active, a, b } = scene();
    active.togglePartSelection(b);
    active.togglePartSelection(a);
    const snapshot = active.snapshotPartSelection();
    const rebuiltA = new RevJoint('A', 3, 4);
    const rebuiltB = new RevJoint('B', 5, 4);

    active.clearPartSelection();
    active.restorePartSelection(snapshot, [rebuiltA, rebuiltB], []);

    expect(active.selectedParts).toEqual([rebuiltB, rebuiltA]);
    expect(active.primaryPart).toBe(rebuiltA);
  });

  it("restores a mixed snapshot as the primary part's kind alone", () => {
    const { active, a, b, sameId } = scene();
    active.restorePartSelection(
      {
        refs: [
          { kind: 'joint', id: 'A' },
          { kind: 'link', id: 'A' },
          { kind: 'joint', id: 'B' },
        ],
        primary: { kind: 'joint', id: 'B' },
      },
      [a, b],
      [sameId]
    );

    expect(active.selectedParts).toEqual([a, b]);
    expect(active.objType).toBe('MultiSelection');
  });

  it('keeps updateSelectedObj backward-compatible as a replacing selection', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);

    active.updateSelectedObj(a);

    expect(active.selectedParts).toEqual([a]);
    expect(active.objType).toBe('Joint');
  });

  it('leaves a singular force selection alone during part reconciliation', () => {
    const { active, a, b, sameId } = scene();
    const force = new Force('F1', sameId, new Coord(a.x, a.y), new Coord(b.x, b.y));
    active.updateSelectedObj(force);

    active.reconcilePartSelection([a, b], [sameId]);

    expect(active.objType).toBe('Force');
    expect(active.selectedForce).toBe(force);
  });
});

describe('structural selection reconciliation', () => {
  it('drops deleted parts and keeps surviving selections through the structural seam', () => {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    harness.service.joints = [a, b, c];
    harness.service.links = [ab, bc];
    wireGraph(harness.service);
    harness.active.togglePartSelection(ab);
    harness.active.togglePartSelection(bc);

    harness.service.links = [ab];
    harness.service.finishStructuralEdit(false);

    expect(harness.active.selectedParts).toEqual([ab]);
    expect(harness.active.primaryPart).toBe(ab);
    expect(harness.active.objType).toBe('Link');
  });
});
