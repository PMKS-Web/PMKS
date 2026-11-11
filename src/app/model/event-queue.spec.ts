import { EventQueue } from './event-queue';

describe('EventQueue', () => {
  it('holds events until it is connected, then sends them in order', () => {
    const queue = new EventQueue();
    const seen: string[] = [];
    queue.push('app_start', { entry: 'link' });
    queue.push('playback_start');
    queue.connect((name, params) => seen.push(`${name} ${JSON.stringify(params ?? {})}`));
    queue.push('share', { method: 'copy_link' });
    expect(seen).toEqual([
      'app_start {"entry":"link"}',
      'playback_start {}',
      'share {"method":"copy_link"}',
    ]);
  });

  it('sends a once-per-visit event once for each set of parameters', () => {
    const queue = new EventQueue();
    const seen: string[] = [];
    queue.connect((name, params) => seen.push(`${name} ${params?.['graph'] ?? ''}`));
    queue.pushOnce('graph_open', { graph: 'Joint Position' });
    queue.pushOnce('graph_open', { graph: 'Joint Position' });
    queue.pushOnce('graph_open', { graph: 'Joint Velocity' });
    expect(seen).toEqual(['graph_open Joint Position', 'graph_open Joint Velocity']);
  });

  it('never lets a failing sink reach the app', () => {
    const queue = new EventQueue();
    queue.connect(() => {
      throw new Error('blocked');
    });
    expect(() => queue.push('new_project')).not.toThrow();
  });
});
