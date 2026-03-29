import Phaser from 'phaser';

const FRAGMENT_SHADER = [
  '#define SHADER_NAME MATCHCROW_POSTFX_FS',
  'precision mediump float;',
  'uniform sampler2D uMainSampler;',
  'uniform vec2 resolution;',
  'uniform float time;',
  'uniform float scanlineStrength;',
  'uniform float vignetteStrength;',
  'uniform float gradeStrength;',
  'uniform float noiseStrength;',
  'uniform float chromaStrength;',
  'uniform float bloomStrength;',
  'uniform float bloomThreshold;',
  'varying vec2 outTexCoord;',
  'float hash(vec2 p) {',
  '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
  '}',
  'vec3 extractBright(vec3 color) {',
  '  return max(color - vec3(bloomThreshold), vec3(0.0));',
  '}',
  'void main ()',
  '{',
  '  vec2 uv = outTexCoord;',
  '  vec2 px = 1.0 / resolution;',
  '  vec2 centered = uv - 0.5;',
  '  vec2 aberration = centered * chromaStrength * px * 6.0;',
  '  vec3 base;',
  '  base.r = texture2D(uMainSampler, clamp(uv + aberration, 0.0, 1.0)).r;',
  '  base.g = texture2D(uMainSampler, uv).g;',
  '  base.b = texture2D(uMainSampler, clamp(uv - aberration, 0.0, 1.0)).b;',
  '  vec3 bloom = vec3(0.0);',
  '  vec2 blur = px * 1.5;',
  '  bloom += extractBright(texture2D(uMainSampler, uv).rgb) * 0.22;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2( blur.x, 0.0), 0.0, 1.0)).rgb) * 0.12;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2(-blur.x, 0.0), 0.0, 1.0)).rgb) * 0.12;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2(0.0,  blur.y), 0.0, 1.0)).rgb) * 0.12;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2(0.0, -blur.y), 0.0, 1.0)).rgb) * 0.12;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + blur, 0.0, 1.0)).rgb) * 0.08;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2(-blur.x, blur.y), 0.0, 1.0)).rgb) * 0.08;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv + vec2(blur.x, -blur.y), 0.0, 1.0)).rgb) * 0.08;',
  '  bloom += extractBright(texture2D(uMainSampler, clamp(uv - blur, 0.0, 1.0)).rgb) * 0.08;',
  '  vec3 color = base + bloom * bloomStrength;',
  '  vec3 graded = vec3(',
  '    color.r * 1.03 + color.g * 0.05,',
  '    color.g * 1.00 + color.r * 0.015,',
  '    color.b * 0.92',
  '  );',
  '  color = mix(color, graded, gradeStrength);',
  '  float scanMask = 0.5 + 0.5 * sin((uv.y * resolution.y) * 3.14159265 + time * 8.0);',
  '  float scanline = 1.0 - scanlineStrength * (0.09 + 0.11 * scanMask);',
  '  vec2 grid = abs(fract(uv * resolution) - 0.5);',
  '  float pixelGrid = 1.0 - scanlineStrength * 0.025 * smoothstep(0.42, 0.5, max(grid.x, grid.y));',
  '  float vignette = smoothstep(0.18, 0.78, length(uv - vec2(0.5)));',
  '  color *= scanline * pixelGrid;',
  '  color *= 1.0 - vignette * vignetteStrength;',
  '  float noise = hash(floor(uv * resolution * 0.5 + vec2(time * 45.0, time * 27.0))) - 0.5;',
  '  color += noise * noiseStrength;',
  '  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);',
  '}',
].join('\n');

export const MATCHCROW_POSTFX_PIPELINE_KEY = 'MatchCrowPostFX';

export class MatchCrowPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  time = 0;
  scanlineStrength = 0.75;
  vignetteStrength = 0.28;
  gradeStrength = 0.22;
  noiseStrength = 0.02;
  chromaStrength = 0.12;
  bloomStrength = 0.18;
  bloomThreshold = 0.68;

  constructor(game: Phaser.Game) {
    super({
      game,
      fragShader: FRAGMENT_SHADER,
    });
  }

  onPreRender(): void {
    this.set2f('resolution', this.renderer.width, this.renderer.height);
    this.set1f('time', this.time);
    this.set1f('scanlineStrength', this.scanlineStrength);
    this.set1f('vignetteStrength', this.vignetteStrength);
    this.set1f('gradeStrength', this.gradeStrength);
    this.set1f('noiseStrength', this.noiseStrength);
    this.set1f('chromaStrength', this.chromaStrength);
    this.set1f('bloomStrength', this.bloomStrength);
    this.set1f('bloomThreshold', this.bloomThreshold);
  }
}
