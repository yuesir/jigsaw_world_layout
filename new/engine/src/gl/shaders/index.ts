/**
 * Vite ?raw import for GLSL source strings.
 */
import commonVert from './common.vert?raw';
import colorFrag from './color.frag?raw';
import imageFrag from './image.frag?raw';
import imageMaskFrag from './image-mask.frag?raw';

export const SHADERS = {
  commonVert,
  colorFrag,
  imageFrag,
  imageMaskFrag,
};
