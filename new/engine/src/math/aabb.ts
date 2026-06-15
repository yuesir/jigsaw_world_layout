/**
 * Axis-aligned bounding box.
 */
export class AABB {
  constructor(
    public left = 0,
    public top = 0,
    public right = 0,
    public bottom = 0,
  ) {}

  set(left: number, top: number, right: number, bottom: number): this {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    return this;
  }

  width(): number {
    return this.right - this.left;
  }

  height(): number {
    return this.bottom - this.top;
  }

  contains(x: number, y: number): boolean {
    return x >= this.left && x < this.right && y >= this.top && y < this.bottom;
  }

  intersects(o: AABB): boolean {
    return !(o.left >= this.right || o.right <= this.left || o.top >= this.bottom || o.bottom <= this.top);
  }
}
