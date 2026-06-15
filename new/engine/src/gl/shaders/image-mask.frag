#version 300 es
// Image + mask fragment shader.
//
// Uses the red channel of the mask as the alpha multiplier for the image.
// This is the simple "color-key / luma-key" mode used by the engine for
// shaped sprites (jigsaw pieces use a more complex shader with bevel+shadow).
//
//   alpha = mask.r
//   fragColor = (image.rgb * alpha * v_opacity, alpha * v_opacity)
precision mediump float;

uniform sampler2D u_image;
uniform sampler2D u_mask;

in vec2 v_texCoord0;
in vec2 v_texCoord1;
in float v_opacity;

out vec4 fragColor;

void main() {
  vec4 px = texture(u_image, v_texCoord0);
  vec4 mx = texture(u_mask, v_texCoord1);
  float a = mx.r * v_opacity;
  fragColor = vec4(px.rgb * a, a);
}
