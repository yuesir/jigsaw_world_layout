/**
 * Sym — ordered enumeration with optional grouping for global lookup.
 *
 * Each Sym carries a stable ordinal (for sorting / comparison) and a name.
 * Syms can be collected into a named group, then looked up by name or ordinal:
 *
 *   const FOO = Sym.group('foo')
 *     .add('resting', 0)
 *     .add('active', 1)
 *     .build();
 *
 *   FOO.get('active')           // → Sym(1, 'active')
 *   FOO.getByOrdinal(0)         // → Sym(0, 'resting')
 *   FOO.get('active').ordinal   // 1
 */
export class Sym {
  readonly name: string;
  readonly ordinal: number;
  readonly group: string | null;

  constructor(name: string, ordinal: number, group: string | null = null) {
    this.name = name;
    this.ordinal = ordinal;
    this.group = group;
  }

  toString(): string {
    return this.name;
  }

  toFullString(): string {
    const ord = this.ordinal;
    return (this.group ? `${this.group}:` : '') + this.name + (ord === undefined ? '' : ` (${ord})`);
  }

  eq(other: Sym): boolean {
    return this.ordinal === other.ordinal;
  }

  neq(other: Sym): boolean {
    return this.ordinal !== other.ordinal;
  }

  gt(other: Sym): boolean {
    return this.ordinal > other.ordinal;
  }

  gte(other: Sym): boolean {
    return this.ordinal >= other.ordinal;
  }

  lt(other: Sym): boolean {
    return this.ordinal < other.ordinal;
  }

  lte(other: Sym): boolean {
    return this.ordinal <= other.ordinal;
  }

  /** [lo, hi] inclusive */
  bet(lo: Sym, hi: Sym): boolean {
    return this.ordinal >= lo.ordinal && this.ordinal <= hi.ordinal;
  }

  static _groups = new Map<string, Map<string | number, Sym>>();

  static getGroup(groupName: string): Map<string | number, Sym> {
    let m = Sym._groups.get(groupName);
    if (!m) {
      m = new Map();
      Sym._groups.set(groupName, m);
    }
    return m;
  }

  /** Register a Sym into a named group. */
  static register(name: string, ordinal: number, group: string): Sym {
    const m = Sym.getGroup(group);
    const existing = m.get(name);
    if (existing) return existing;
    const s = new Sym(name, ordinal, group);
    m.set(name, s);
    m.set(ordinal, s);
    return s;
  }

  static get(group: string, name: string | number): Sym | null {
    return Sym.getGroup(group).get(name) ?? null;
  }
}
