import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { DialogButtonComponent } from '../../BLOCKS/dialog-button/dialog-button.component';

/** Which door the reader came through: a first start, or running it again. */
export interface TutorialClearData {
  again: boolean;
}

/**
 * The one question the tutorial asks: may it clear the grid?
 *
 * The tutorial is always built on a bare grid. It reads every step off the
 * drawing, so a mechanism that was already there reads as steps the student
 * never took -- a six-bar arrived at "step 5 of 5, build a four-bar". Clearing
 * is undoable, and the sentence says so, because a student who said yes by
 * reflex should not think their work is gone for good.
 */
@Component({
  selector: 'app-tutorial-clear',
  templateUrl: './tutorial-clear.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogButtonComponent,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
  ],
})
export class TutorialClearComponent {
  protected data = inject<TutorialClearData>(MAT_DIALOG_DATA);

  /** Answers true when the reader chose to clear the grid. */
  static openIn(dialog: MatDialog, again = false): MatDialogRef<TutorialClearComponent, boolean> {
    // Sized, because a Material dialog left to itself takes most of the window
    // and two sentences do not need it.
    return dialog.open(TutorialClearComponent, {
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: false,
      data: { again } satisfies TutorialClearData,
    });
  }
}
