import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { WhatsNewComponent } from './whats-new.component';
import { WHATS_NEW } from '../../../model/whats-new';
import { MOST_MACHINES } from '../../../model/mechanism/mechanism-partition';
import { TEMPLATE_CARDS } from '../templates/template-catalog';

/**
 * The card a returning PMKS+ reader meets first. What matters is that it says
 * the app was rebuilt under a new name, lists every note, gives the few who
 * still need the old version a way to ask, and lets everybody else out.
 */
describe('WhatsNewComponent', () => {
  let closed: number;

  const render = () => {
    closed = 0;
    TestBed.configureTestingModule({
      imports: [WhatsNewComponent, MatIconTestingModule],
      providers: [{ provide: MatDialogRef, useValue: { close: () => closed++ } }],
    });
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders every release note', () => {
    const notes = render().querySelectorAll('.wnNote');
    expect(notes.length).toBe(WHATS_NEW.length);
    expect(WHATS_NEW.length).toBe(5);
  });

  it('opens on a map of the new layout that a screen reader can name', () => {
    const map = render().querySelector('.wnMap');
    expect(map?.getAttribute('role')).toBe('img');
    expect(map?.getAttribute('aria-label')).toContain('four modes');
    expect(map?.querySelectorAll('.wnModes .mat-icon').length).toBe(4);
  });

  it('says the app was PMKS+ before', () => {
    expect(render().querySelector('.wnLead')?.textContent).toContain('formerly PMKS+');
  });

  it('tells a reader who needs the previous version where to write', () => {
    const link = render().querySelector<HTMLAnchorElement>('.wnLegacy a.wnLegacyLink');
    expect(link?.getAttribute('href')).toMatch(/^mailto:help@pmksplus\.com\?subject=/);
    expect(link?.textContent?.trim()).toBe('help@pmksplus.com');
  });

  it('closes when Start Using PMKS is pressed', () => {
    const go = render().querySelector<HTMLButtonElement>('.wnGo');
    expect(go?.textContent?.trim()).toBe('Start Using PMKS');
    go?.click();
    expect(closed).toBe(1);
  });

  it('keeps its numbers in step with the app', () => {
    // The notes quote two counts. If either changes, the sentence is wrong.
    const text = WHATS_NEW.map((note) => note.body).join(' ');
    expect(MOST_MACHINES).toBe(4);
    expect(text).toContain('up to four independent mechanisms');
    expect(text).toContain(`${TEMPLATE_CARDS.length}-mechanism library`);
  });
});
