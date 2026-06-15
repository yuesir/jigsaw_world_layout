/**
 * Layer registry — assigns a small integer to each layer name.
 *
 * The Clips container keeps one List per registered layer; the layer index
 * is used for z-stacking and render order. Mirrors the original "layers" Sym
 * group: background, bottom, primer, pieces, top.
 */
import { Sym } from '../reactive/sym';

let _nextOrdinal = 0;
const _layers: Map<string, number> = new Map();
const _syms: Map<string, Sym> = new Map();

/** Register (or fetch) the integer index for a layer name. */
export function layerIndex(name: string): number {
  let i = _layers.get(name);
  if (i === undefined) {
    i = _nextOrdinal++;
    _layers.set(name, i);
    _syms.set(name, Sym.register(name, i, 'layers'));
  }
  return i;
}

/** Resolve a layer index by name. */
export function getLayerIndex(name: string): number | null {
  return _layers.get(name) ?? null;
}

export function listLayers(): string[] {
  return Array.from(_layers.keys());
}
