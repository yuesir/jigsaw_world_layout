#version 300 es
// Image-only fragment shader.
//
//   alpha = texture(u_image, v_texCoord0).a * v_opacity
//   fragColor = (rgb * alpha, alpha)
precision mediump float;

uniform sampler2D u_image;

in vec2 v_texCoord0;
in float v_opacity;

out vec4 fragColor;

void main() {
  vec4 px = texture(u_image, v_texCoord0);
  float a = px.a * v_opacity;
  fragColor = vec4(px.rgb * a, a);
}
