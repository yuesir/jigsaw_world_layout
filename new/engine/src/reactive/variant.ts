/**
 * Variant — a reactive value with listeners, locking, and validation.
 *
 * Inspired by jigex-prog.js's `Variant`. Every observable piece of state in
 * the engine should be a Variant: piece.state, piece.group, piece.hasMoved,
 * theme, capState, etc.
 *
 * Typical usage:
 *   const capState = new Variant(Sym.OFF, 'capState');
 *   capState.addListener((newVal, oldVal, source) => { ... });
 *   capState.val = Sym.CAPTURING;   // triggers listeners
 *
 * Validator:
 *   new Variant(0, 'count', {
 *     validator: (next, prev, source) => next >= 0,
 *   });
 *   v.val = -1;  // rejected, error message set
 *
 * Locking:
 *   v.lock();   // rejects all writes until unlock
 *   v.unlock();
 */
import { Sym } from './sym';

export type Validator = (next: unknown, prev: unknown, source: Variant<unknown>) => string | null;

export interface VariantOptions {
  validator?: Validator;
  /** When set, listeners can use lock/unlock semantics */
  logVerbosity?: number;
}

export type VariantListener<T> = (next: T, prev: T, source: Variant<T>, parent: unknown) => void;

export class Variant<T> {
  readonly name: string;
  private _value: T;
  private _listeners: VariantListener<T>[] | null = null;
  private _validator: Validator | null;
  private _errorMessage: string | null = null;
  private _locked = false;
  private _disposed = false;

  constructor(initial: T, name: string, opts: VariantOptions = {}) {
    this._value = initial;
    this.name = name;
    this._validator = opts.validator ?? null;
  }

  get val(): T {
    return this._value;
  }

  set val(next: T) {
    this.set(next);
  }

  get errorMessage(): string | null {
    return this._errorMessage;
  }

  get isLocked(): boolean {
    return this._locked;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  set(next: T): boolean {
    if (this._disposed) {
      throw new Error(`Cannot set disposed variant "${this.name}"`);
    }
    if (this._locked) {
      this._errorMessage = 'Variant is locked';
      return false;
    }
    const prev = this._value;
    if (this._validator) {
      const err = this._validator(next, prev, this as unknown as Variant<unknown>);
      if (err) {
        this._errorMessage = err;
        return false;
      }
    }
    if (Object.is(next, prev)) return true;
    this._value = next;
    this._errorMessage = null;
    if (this._listeners) {
      // copy array so listeners can remove themselves during iteration
      const ls = this._listeners.slice();
      for (const l of ls) {
        try {
          l(next, prev, this, this);
        } catch (e) {
          console.error(`Variant listener for "${this.name}" threw:`, e);
        }
      }
    }
    return true;
  }

  addListener(l: VariantListener<T>): this {
    if (!this._listeners) this._listeners = [];
    if (!this._listeners.includes(l)) this._listeners.push(l);
    return this;
  }

  removeListener(l: VariantListener<T>): boolean {
    if (!this._listeners) return false;
    const i = this._listeners.indexOf(l);
    if (i < 0) return false;
    this._listeners.splice(i, 1);
    return true;
  }

  removeAllListeners(): void {
    this._listeners = null;
  }

  lock(): void {
    this._locked = true;
  }

  unlock(): void {
    this._locked = false;
  }

  dispose(): void {
    this._disposed = true;
    this._listeners = null;
  }

  toString(): string {
    return `${this.name}: value=${String(this._value)}, #-listeners=${this._listeners?.length ?? 0}${this._locked ? ', locked' : ''}`;
  }

  /**
   * Convenience: define a Variant on a host object and replace it with a
   * getter/setter so consumers can write `host.prop = newVal` while listeners
   * stay attached.
   */
  static define<T>(host: object, propName: string, variant: Variant<T>): Variant<T> {
    Object.defineProperty(host, propName, {
      get: () => variant.val,
      set: (v: T) => {
        variant.val = v;
      },
      configurable: true,
      enumerable: true,
    });
    return variant;
  }
}

/** Common log-verbosity levels, matching jigex-prog.js */
export const LOG_NONE = 0;
export const LOG_FAILURES = 1;
export const LOG_CHANGES = 2;
export const LOG_ALL = 3;
export const LOG_DEBUG = 4;
