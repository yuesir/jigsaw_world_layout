/**
 * StateCell — explicit finite state machine driven by (event, currentState) pairs.
 *
 * Define a set of states, then register handlers for `(state, event) → nextState`.
 * `handleEvent(event)` looks up the handler for the current state and runs it.
 *
 *   const cell = new StateCell<'idle' | 'running' | 'done'>(['idle', 'running', 'done'], { name: 'lifecycle' });
 *   cell.onEvent('start', 'idle', () => 'running');
 *   cell.handleEvent('start');  // cell.state === 'running'
 *
 * Handlers can return:
 *   - a string (the new state)
 *   - null/undefined (state unchanged)
 *   - `{ cancel: true }` (state unchanged, no-op)
 *   - `{ newState: 'foo' }`
 */
import type { Sym } from './sym';

export type StateCellState = string | Sym;

export interface StateCellOptions {
  name?: string;
  initial?: StateCellState;
  log?: boolean;
  logger?: { log: (...args: unknown[]) => void };
}

export type StateHandler<S extends StateCellState, E, C> = (
  event: E,
  ctx: C,
) => S | { newState: S; cancel?: boolean } | null | undefined;

export class StateCell<S extends StateCellState, E = string, C = unknown> {
  readonly name: string;
  private _state: S;
  private readonly _definedStates: S[];
  private readonly _handlers: Map<S, Map<E, StateHandler<S, E, C>>> = new Map();
  private _context: C;
  private readonly _log: boolean;
  private readonly _logger: { log: (...args: unknown[]) => void };

  constructor(definedStates: S[], opts: StateCellOptions = {}, context: C = {} as C) {
    if (!definedStates || definedStates.length === 0) {
      throw new Error('StateCell: must define at least one state');
    }
    this._definedStates = definedStates;
    this._state = (opts.initial ?? definedStates[0]!) as S;
    this._context = context;
    this.name = opts.name ?? '<nameless cell>';
    this._log = !!opts.log;
    this._logger = opts.logger ?? console;
  }

  get state(): S {
    return this._state;
  }

  get definedStates(): readonly S[] {
    return this._definedStates;
  }

  onEvent(event: E, state: S, handler: StateHandler<S, E, C>): this {
    let m = this._handlers.get(state);
    if (!m) {
      m = new Map();
      this._handlers.set(state, m);
    }
    m.set(event, handler);
    return this;
  }

  handleEvent(event: E, ctx?: C): boolean {
    const merged = ctx !== undefined ? { ...this._context, ...(ctx as object) } : this._context;
    const m = this._handlers.get(this._state);
    const h = m ? m.get(event) : null;
    if (!h) {
      this._log && this._logger.log(`${this.name}: [${String(event)}], ${String(this._state)} (no handler)`);
      return false;
    }
    let result: ReturnType<StateHandler<S, E, C>>;
    try {
      result = h(event, merged);
    } catch (e) {
      this._logger.log(`${this.name}: handler threw`, e);
      return false;
    }
    if (result == null) {
      // no change
      this._log && this._logger.log(`${this.name}: [${String(event)}], ${String(this._state)} (no change)`);
      return true;
    }
    const d: { newState: S; cancel?: boolean } =
      result && typeof result === 'object' && 'newState' in (result as object)
        ? (result as { newState: S; cancel?: boolean })
        : { newState: result as S };
    if (d.cancel) {
      this._log && this._logger.log(`${this.name}: [${String(event)}], ${String(this._state)} (canceled)`);
      return false;
    }
    const next = d.newState;
    if (!this._definedStates.includes(next)) {
      this._logger.log(`${this.name}: invalid new state ${String(next)}`);
      return false;
    }
    const prev = this._state;
    this._state = next;
    this._log && this._logger.log(`${this.name}: [${String(event)}], ${String(prev)} ➜ ${String(next)}`);
    return true;
  }
}
