#version 300 es
// GLSL ES 3.00 vertex shader used by every Clip.
//
// Per-vertex layout (15 floats, 60 bytes):
//   0  pos.x
//   1  pos.y
//   2  scale.x
//   3  scale.y
//   4  trans.x
//   5  trans.y
//   6  rot.x    (cos θ)
//   7  rot.y    (sin θ)
//   8  state    (free 32-bit slot for shader-specific data)
//   9  color    (free 32-bit slot)
//  10  opacity
//  11  tex0.u
//  12  tex0.v
//  13  tex1.u
//  14  tex1.v
//
// Position transform mirrors jigex-prog.js:
//   gl_Position.x = (scale.x * rot.x * pos.x) + (invAspect * scale.y * rot.y * pos.y) + trans.x
//   gl_Position.y = (aspect    * scale.x * -rot.y * pos.x) + (scale.y * rot.x * pos.y) + trans.y
//
// Notes:
//  - We always use .x/.y swizzles (rather than .s/.t) for GLSL parser
//    portability.
//  - a_pos.xy is a unit quad in [-1, 1] space. a_scale encodes width/height
//    in OGL units. a_trans is the OGL translation already pre-computed by
//    PosPoint.
precision highp float;

uniform float u_aspect;
uniform float u_invAspect;

in vec2 a_pos;
in vec2 a_texCoord0;
in vec2 a_texCoord1;
in float a_color;
in float a_opacity;
in float a_state;
in vec2 a_trans;
in vec2 a_scale;
in vec2 a_rot;

out vec2 v_texCoord0;
out vec2 v_texCoord1;
out float v_color;
out float v_opacity;
out float v_state;
out vec2 v_rot;

void main() {
  v_texCoord0 = a_texCoord0;
  v_texCoord1 = a_texCoord1;
  v_color = a_color;
  v_opacity = a_opacity;
  v_state = a_state;
  v_rot = a_rot;

  float rx = a_rot.x;
  float ry = a_rot.y;

  gl_Position.x = (a_scale.x * rx * a_pos.x) + (u_invAspect * a_scale.y * ry * a_pos.y) + a_trans.x;
  gl_Position.y = (u_aspect * a_scale.x * -ry * a_pos.x) + (a_scale.y * rx * a_pos.y) + a_trans.y;
  gl_Position.z = 0.0;
  gl_Position.w = 1.0;
}
