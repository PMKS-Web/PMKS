import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TutorialService } from './tutorial.service';
// eslint-disable-next-line no-restricted-imports -- MatDialog.open needs the dialog's class
import { TutorialClearComponent } from '../component/MODALS/tutorial-clear/tutorial-clear.component';

/**
 * Every way into the tutorial: the Edit panel's offer, its resume line, the
 * project menu and Run Tutorial Again.
 *
 * One door, because the question it asks has to be asked at all of them. The
 * project menu used to start the tutorial straight onto whatever was drawn.
 */
@Injectable({ providedIn: 'root' })
export class TutorialEntryService {
  private tutorial = inject(TutorialService);
  private dialog = inject(MatDialog);

  /** Carry on where the tutorial was, or start it on a bare grid, asking first if that clears anything. */
  open(): void {
    if (!this.tutorial.startWouldDiscard()) {
      this.tutorial.start();
      return;
    }
    this.confirmThen(() => this.tutorial.start(), this.tutorial.started);
  }

  /** Start again from step one, asking first if that clears anything. */
  restart(): void {
    if (!this.tutorial.restartWouldDiscard()) {
      this.tutorial.restart();
      return;
    }
    this.confirmThen(() => this.tutorial.restart(), true);
  }

  private confirmThen(begin: () => void, again: boolean): void {
    TutorialClearComponent.openIn(this.dialog, again)
      .afterClosed()
      .subscribe((clear) => {
        if (clear) begin();
      });
  }
}
