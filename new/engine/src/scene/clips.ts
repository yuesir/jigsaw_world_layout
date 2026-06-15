/**
 * Clips — multi-layer container of Clip instances.
 *
 * Each layer is a doubly-linked list (utils.List). The list order encodes
 * z-order: head is bottom of stack, tail is top.
 *
 * Mirrors the original `O.clips` array-of-lists.
 */
import { List } from '../utils/list';
import { layerIndex, getLayerIndex } from './layers';
import type { Clip } from './clip';

export class Clips {
  private _layers: List<Clip>[] = [];

  /** Number of layers. Must be initialized before adding clips. */
  initLayers(count: number): void {
    if (this._layers.length === count) return;
    this._layers = new Array(count);
    for (let i = 0; i < count; i++) this._layers[i] = new List<Clip>();
  }

  /** Add a clip to a named layer; returns the node for later removal. */
  add(layerName: string, clip: Clip): ReturnType<List<Clip>['addLast']> {
    const idx = layerIndex(layerName);
    while (this._layers.length <= idx) this._layers.push(new List<Clip>());
    const node = this._layers[idx]!.addLast(clip);
    clip._node = node;
    return node;
  }

  remove(layerName: string, clip: Clip): void {
    const idx = getLayerIndex(layerName);
    if (idx == null || !clip._node) return;
    this._layers[idx]!.dispose(clip._node);
    clip._node = null;
  }

  layer(name: string): List<Clip> | null {
    const idx = getLayerIndex(name);
    if (idx == null) return null;
    return this._layers[idx] ?? null;
  }

  layerAt(idx: number): List<Clip> | null {
    return this._layers[idx] ?? null;
  }

  layerCount(): number {
    return this._layers.length;
  }

  count(): number {
    let n = 0;
    for (const l of this._layers) n += l.length;
    return n;
  }

  /** Move every clip in `layerName` to the top of its layer. */
  moveLayerToTop(layerName: string): void {
    const layer = this.layer(layerName);
    if (!layer) return;
    for (let n = layer.tail; n; ) {
      const next = n.prev;
      layer.moveToEnd(n);
      n = next;
    }
  }

  /**
   * Find topmost clip at (x, y) on a given layer. Optional `ignoreHidden`
   * skips clips with opacity 0.
   */
  getClipAt(x: number, y: number, layerIdx: number, ignoreHidden = true): Clip | null {
    const l = this._layers[layerIdx];
    if (!l) return null;
    const node = l.find((c) => {
      if (ignoreHidden && (!c.opacity || !c._active)) return false;
      return c.containsPoint(x, y);
    });
    return node ? node.item : null;
  }
}
