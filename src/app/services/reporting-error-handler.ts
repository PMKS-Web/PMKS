import { ErrorHandler, Injectable, inject } from '@angular/core';
import { describeError } from '../model/analytics-events';
import { AnalyticsService } from './analytics.service';

/**
 * Angular's own error handler, which writes to the console, plus a report of
 * each distinct error once per visit, so a failure students meet shows up
 * before somebody writes in about it.
 *
 * Not fatal: the app goes on after one of these, and a fatal exception is GA's
 * word for a crash.
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private analytics = inject(AnalyticsService);

  override handleError(error: unknown): void {
    super.handleError(error);
    this.analytics.trackOnce('exception', { description: describeError(error), fatal: false });
  }
}
