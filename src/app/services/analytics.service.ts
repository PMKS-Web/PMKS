import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { initializeAnalytics, isSupported, logEvent, setUserProperties } from 'firebase/analytics';
import { environment } from '../../environments/environment';
import { AnalyticsArgs, AnalyticsEventName, REPORTING_HOST } from '../model/analytics-events';
import { EventParams, EventQueue, EventSink } from '../model/event-queue';

/**
 * Google Analytics, through the framework-agnostic Firebase JS SDK (which
 * replaced @angular/fire, whose Angular peer range blocked the upgrades).
 *
 * Every event is typed in `model/analytics-events.ts`, and `docs/analytics.md`
 * is the list with what each is for. Three things this does that the SDK
 * alone does not:
 *
 * - **Only app.pmksplus.com reports.** Every deploy is a production build, so
 *   without this each branch preview and deploy preview counted as students in
 *   the live property. Anywhere else each event goes to `console.debug`, which
 *   is how to check one on a preview.
 * - **Events wait for the SDK** (`EventQueue`), rather than being dropped.
 * - **The page is reported as `/`.** A shared mechanism is the query string,
 *   up to a thousand characters of somebody's drawing, and GA would otherwise
 *   record it as the page's address.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly queue = new EventQueue();

  constructor() {
    if (window.location.hostname !== REPORTING_HOST) {
      this.queue.connect((name, params) => console.debug('[analytics]', name, params ?? {}));
      return;
    }
    // Unavailable in some contexts (blocked cookies, unsupported browsers);
    // the app must not break because of tracking, and the queue must not grow.
    isSupported()
      .then((supported) => this.queue.connect(supported ? toFirebase() : () => undefined))
      .catch(() => this.queue.connect(() => undefined));
  }

  /** Report an event. Before the SDK is ready it waits. */
  track<K extends AnalyticsEventName>(name: K, ...args: AnalyticsArgs<K>): void {
    this.queue.push(name, args[0] as EventParams | undefined);
  }

  /** Report an event once per visit for each set of parameters. */
  trackOnce<K extends AnalyticsEventName>(name: K, ...args: AnalyticsArgs<K>): void {
    this.queue.pushOnce(name, args[0] as EventParams | undefined);
  }
}

function toFirebase(): EventSink {
  const analytics = initializeAnalytics(initializeApp(environment.firebase), {
    config: { page_location: `${window.location.origin}/` },
  });
  // Registered as a user-scoped custom dimension, so a change in behavior can
  // be read against the release that made it.
  setUserProperties(analytics, { app_version: environment.appVersion });
  return (name, params) => logEvent(analytics, name, params);
}
