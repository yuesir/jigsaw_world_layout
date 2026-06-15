/**
 * Doubly-linked list with internal free-pool for node reuse.
 *
 * Each node has `prev`, `next`, `item`. Nodes are obtained via `_getNode(item)`
 * (which recycles from `_freeNodes` when possible) and released via `unlink()`,
 * `unlinkFirst()`, or `dispose()`.
 *
 * Public API:
 *   - addFirst / addLast / addBefore / addAfter
 *   - moveToBeginning / moveToEnd / moveBefore / moveAfter
 *   - unlinkFirst / unlinkLast / unlink
 *   - forEach (head → tail) / find / findLast (tail → head)
 *   - dispose(node)  — unlinks AND adds the node to free pool
 *   - sanityCheck()  — throws on cycle (debug)
 */
export interface LinkNode<T> {
  prev: LinkNode<T> | null;
  next: LinkNode<T> | null;
  item: T;
}

export class List<T> {
  head: LinkNode<T> | null = null;
  tail: LinkNode<T> | null = null;
  length = 0;
  private _freeNodes: LinkNode<T>[] = [];

  private _getNode(item: T): LinkNode<T> {
    if (this._freeNodes.length > 0) {
      const n = this._freeNodes.pop()!;
      n.item = item;
      n.prev = null;
      n.next = null;
      return n;
    }
    return { prev: null, next: null, item };
  }

  forEach(fn: (item: T, node: LinkNode<T>) => void): void {
    let n = this.head;
    while (n) {
      fn(n.item, n);
      n = n.next;
    }
  }

  addFirst(item: T): LinkNode<T> {
    const n = this._getNode(item);
    if (this.head) {
      n.next = this.head;
      this.head.prev = n;
      this.head = n;
    } else {
      this.head = n;
      this.tail = n;
    }
    this.length++;
    return n;
  }

  addLast(item: T): LinkNode<T> {
    const n = this._getNode(item);
    if (this.tail) {
      n.prev = this.tail;
      this.tail.next = n;
      this.tail = n;
    } else {
      this.head = n;
      this.tail = n;
    }
    this.length++;
    return n;
  }

  addBefore(item: T, ref: LinkNode<T>): LinkNode<T> {
    if (ref && !ref.item) throw new Error('List: reference to freed node not allowed');
    if (ref && ref.prev) {
      const n = this._getNode(item);
      n.next = ref;
      n.prev = ref.prev;
      ref.prev.next = n;
      ref.prev = n;
      this.length++;
      return n;
    }
    return this.addFirst(item);
  }

  addAfter(item: T, ref: LinkNode<T>): LinkNode<T> {
    if (ref && !ref.item) throw new Error('List: reference to freed node not allowed');
    if (ref && ref.next) {
      const n = this._getNode(item);
      n.next = ref.next;
      n.prev = ref;
      ref.next.prev = n;
      ref.next = n;
      this.length++;
      return n;
    }
    return this.addLast(item);
  }

  moveBefore(node: LinkNode<T>, ref: LinkNode<T>): void {
    this.unlink(node);
    this.addBefore(node.item, ref);
  }

  moveAfter(node: LinkNode<T>, ref: LinkNode<T>): void {
    this.unlink(node);
    this.addAfter(node.item, ref);
  }

  moveToBeginning(node: LinkNode<T>): boolean {
    if (node !== this.head) {
      this.moveBefore(node, this.head!);
      return true;
    }
    return false;
  }

  moveToEnd(node: LinkNode<T>): boolean {
    if (node !== this.tail) {
      this.moveAfter(node, this.tail!);
      return true;
    }
    return false;
  }

  unlinkFirst(): LinkNode<T> | null {
    if (!this.head) return null;
    const n = this.head;
    this.head = n.next;
    this.length--;
    if (this.head) {
      this.head.prev = null;
    } else {
      this.tail = null;
    }
    n.next = null;
    n.prev = null;
    return n;
  }

  unlinkLast(): LinkNode<T> | null {
    if (!this.tail) return null;
    const n = this.tail;
    this.tail = n.prev;
    this.length--;
    if (this.tail) {
      this.tail.next = null;
    } else {
      this.head = null;
    }
    n.next = null;
    n.prev = null;
    return n;
  }

  unlink(node: LinkNode<T>): void {
    if (this.head === node) {
      this.unlinkFirst();
      return;
    }
    if (this.tail === node) {
      this.unlinkLast();
      return;
    }
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    this.length--;
    node.prev = null;
    node.next = null;
  }

  find(pred: (item: T) => boolean): LinkNode<T> | null {
    let n = this.tail;
    while (n) {
      if (pred(n.item)) return n;
      n = n.prev;
    }
    return null;
  }

  findLast(pred: (item: T) => boolean): LinkNode<T> | null {
    // same as find (search tail→head) — kept for API compatibility
    return this.find(pred);
  }

  dispose(node: LinkNode<T>): T | null {
    const item = node.item;
    if (item == null) return null;
    this.unlink(node);
    node.item = null as unknown as T;
    node.prev = null;
    node.next = null;
    this._freeNodes.push(node);
    return item;
  }

  sanityCheck(): void {
    let n = this.head;
    while (n && n.next) {
      if (n.next === this.head) throw new Error('List: circular reference detected');
      n = n.next;
    }
  }
}
