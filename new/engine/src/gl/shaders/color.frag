#version 300 es
// Solid color fragment shader.
//
//   fragColor = (u_color.rgb, u_color.a * v_opacity)
//
// v_color / v_state / v_rot are interpolated from the vertex stage but
// not used here — kept in the shader signature so the engine can switch
// between color / image / image-mask shaders without re-binding attribs.
precision mediump float;

in float v_color;
in float v_opacity;
in float v_state;
in vec2 v_rot;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color * v_opacity;
}
