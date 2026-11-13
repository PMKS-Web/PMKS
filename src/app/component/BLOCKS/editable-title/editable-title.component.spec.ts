import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { EditableTitleComponent } from './editable-title.component';
import { ActiveObjService } from '../../../services/active-obj.service';
import { MechanismService } from '../../../services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';
import { KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';
import { RealLink } from '../../../model/link';
import { RevJoint } from '../../../model/joint';

/**
 * Driven through the row, the way a reader renames: press Rename, type, press
 * Save. The name check itself is private to the block, so what a spec can see
 * is what the reader sees -- the refusal the notification carries, or the
 * field going away because the name was taken.
 */
describe('EditableTitleComponent names', () => {
  const selected = { id: 'A', name: 'Crank' };
  /** What the panel is about; most cases rename `selected`, one a real link. */
  let current: { id: string; name: string } = selected;
  const links: { id: string; name: string }[] = [{ id: 'AB', name: 'Coupler' }];
  let fixture: ComponentFixture<EditableTitleComponent>;
  let refusal: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    selected.name = 'Crank';
    current = selected;
    links.splice(0, links.length, { id: 'AB', name: 'Coupler' });
    refusal = vi.fn();
    await TestBed.configureTestingModule({
      imports: [EditableTitleComponent, NoopAnimationsModule],
      providers: [
        { provide: ActiveObjService, useValue: { getSelectedObj: () => current } },
        {
          provide: MechanismService,
          useValue: {
            joints: [selected, { id: 'B', name: 'Output' }],
            links,
            forces: [{ id: 'F1', name: 'Load' }],
            updateMechanism: vi.fn(),
            isLockedTarget: () => false,
          },
        },
        { provide: NotificationService, useValue: { refusal } },
        { provide: KeyboardShortcutsService, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditableTitleComponent);
    fixture.componentRef.setInput('deleteAction', () => {});
    fixture.detectChanges();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  /** One button for both halves of the gesture: Rename outside edit mode, Save inside it. */
  const renameOrSave = () => host().querySelector<HTMLButtonElement>('.mini-buttons.blue')!;
  const field = () => host().querySelector<HTMLInputElement>('#title-input-box');

  /** Rename to `name` through the row, and say what the block refused it with, if anything. */
  function rename(name: string): string {
    if (!field()) {
      renameOrSave().click();
      fixture.detectChanges();
    }
    field()!.value = name;
    field()!.dispatchEvent(new Event('input'));
    const before = refusal.mock.calls.length;
    renameOrSave().click();
    fixture.detectChanges();
    return refusal.mock.calls.length > before ? refusal.mock.calls.at(-1)![1] : '';
  }

  it('allows the selected object to keep its own name', () => {
    expect(rename('Crank')).toBe('');
    expect(field()).toBeNull();
    expect(selected.name).toBe('Crank');
  });

  it('accepts descriptive names and rejects unsupported punctuation', () => {
    expect(rename('Luffing crank')).toBe('');
    expect(rename('output-link')).toBe('');
    expect(rename('<link>')).toContain('letters');
    expect(field()).not.toBeNull();
  });

  it('takes an empty name as no name, which gives the part back its automatic one', () => {
    // #317: a part is named after its id until someone names it, and clearing
    // the name is how a reader goes back -- the same rule a machine's name has.
    expect(rename('')).toBe('');
    expect(field()).toBeNull();
    expect(selected.name).toBe('');
  });

  it('saves nothing when the name cleared was already the automatic one', () => {
    selected.name = 'A';
    const mechanism = TestBed.inject(MechanismService) as unknown as {
      updateMechanism: ReturnType<typeof vi.fn>;
    };
    mechanism.updateMechanism.mockClear();
    expect(rename('')).toBe('');
    expect(mechanism.updateMechanism).not.toHaveBeenCalled();
  });

  it('refuses to clear a name when another part is already called by the id', () => {
    // Joint A, named Crank, let another part take `A`; clearing Crank would
    // have called both of them A.
    links.push({ id: 'CD', name: 'a' });
    expect(rename('')).toContain('The name A is already in use');
    expect(selected.name).toBe('Crank');
  });

  it('takes the id typed as a name as the automatic name, and saves the change', () => {
    const mechanism = TestBed.inject(MechanismService) as unknown as {
      updateMechanism: ReturnType<typeof vi.fn>;
    };
    mechanism.updateMechanism.mockClear();
    expect(rename('A')).toBe('');
    expect(selected.name).toBe('');
    expect(mechanism.updateMechanism).toHaveBeenCalledWith(true);
  });

  it('lets a real link named after its id follow its joints after a rename', () => {
    // Crank -> AB -> cleared used to leave `AB` written down, so the link went
    // on reading AB after a tracer point had made it ABE.
    const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 1, 0)]);
    link.name = 'Crank';
    current = link;
    expect(rename('AB')).toBe('');
    expect(rename('')).toBe('');
    link.id = 'ABE';
    expect(link.name).toBe('ABE');
  });

  it('rejects a case-insensitive duplicate across all object types', () => {
    expect(rename('output')).toContain('already in use');
    expect(rename('COUPLER')).toContain('already in use');
    expect(rename('load')).toContain('already in use');
    expect(selected.name).toBe('Crank');
  });
});
