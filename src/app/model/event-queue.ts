export type EventParams = Record<string, string | number | boolean>;
export type EventSink = (name: string, params?: EventParams) => void;

/**
 * Events held until there is somewhere to send them, then sent in order.
 *
 * The analytics SDK loads behind a promise, and the first events of a visit --
 * how the reader arrived -- are raised before it resolves. They used to be
 * dropped.
 */
export class EventQueue {
  private sink: EventSink | undefined;
  private readonly waiting: [string, EventParams | undefined][] = [];
  private readonly sent = new Set<string>();

  /** Where events go from now on, with everything waiting sent first. */
  connect(sink: EventSink): void {
    this.sink = sink;
    for (const [name, params] of this.waiting.splice(0)) this.send(name, params);
  }

  push(name: string, params?: EventParams): void {
    if (this.sink) this.send(name, params);
    else this.waiting.push([name, params]);
  }

  /**
   * Once per visit for each set of parameters. Opening the same graph forty
   * times is one reader who found it, not forty events.
   */
  pushOnce(name: string, params?: EventParams): void {
    const key = `${name} ${JSON.stringify(params ?? {})}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.push(name, params);
  }

  private send(name: string, params: EventParams | undefined): void {
    try {
      this.sink!(name, params);
    } catch {
      // Reporting is never worth an error in the app -- and the error handler
      // reports errors through here, so one thrown would come straight back.
    }
  }
}
