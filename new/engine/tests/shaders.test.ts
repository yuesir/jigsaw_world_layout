import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GLSL ES requires `#version` to be the very first line of a shader source
 * (preceded only by BOM / whitespace). If a JSDoc-style block comment
 * sneaks in front of it, the driver falls back to GLSL ES 1.00 and
 * rejects the `in` / `out` qualifiers used by the 3.00 vertex/fragment
 * shaders.
 *
 * This test pins the requirement: every shipped .vert / .frag MUST start
 * with `#version 300 es` on line 1.
 */
describe('shader source files', () => {
  const SHADER_DIR = join(__dirname, '..', 'src', 'gl', 'shaders');
  const files = ['common.vert', 'color.frag', 'image.frag', 'image-mask.frag'] as const;

  for (const name of files) {
    it(`${name} starts with '#version 300 es' on line 1`, () => {
      const src = readFileSync(join(SHADER_DIR, name), 'utf-8');
      const firstLine = src.split(/\r?\n/, 1)[0]!;
      expect(firstLine.trim()).toBe('#version 300 es');
    });

    it(`${name} declares precision qualifier`, () => {
      const src = readFileSync(join(SHADER_DIR, name), 'utf-8');
      expect(src).toMatch(/precision\s+(lowp|mediump|highp)\s+float/);
    });
  }
});
