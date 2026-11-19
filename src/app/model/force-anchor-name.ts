import { Force } from './force';
import { Link, RealLink } from './link';

/**
 * The bar a force remembers, followed through a change of the bar's name.
 *
 * A link is named after its joint letters, so an edit that changes its joints
 * -- a merge by drop, a split, a joint deleted from a welded body -- renames
 * it. A force that still remembered the old name was written into the URL
 * under a bar that no longer exists, and the reader refuses such a URL whole:
 * every undo entry saved after the rename failed to open (#322).
 */
export function renameAnchors(forces: readonly Force[], from: string, to: string): void {
  if (from === to) return;
  forces.forEach((force) => {
    if (force.anchoredTo === from) force.anchoredTo = to;
  });
}

/**
 * The bar a force is written under: the one it remembers while that bar is
 * still drawn, and otherwise the body that carries it now.
 *
 * The fallback is the safety net for a rename nothing followed. A remembered
 * name exists so an unweld can give the force back to the right member; a
 * name the reader cannot find serves no such purpose, and costs the whole URL.
 */
export function anchorToWrite(force: Force, links: readonly Link[]): string {
  const remembered = force.anchoredTo;
  if (remembered === undefined) return force.link.id;
  const drawn = links.some(
    (link) =>
      link.id === remembered ||
      (link instanceof RealLink && link.subset.some((leaf) => leaf.id === remembered))
  );
  return drawn ? remembered : force.link.id;
}
