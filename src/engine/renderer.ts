import { ASPECTS, MOTION, resolveTimeline, TIME } from '../../shared';
import type { CameraState, Project, VisualSettings } from '../../shared';
import { cameraAt, clamp } from './motion';
import { DEMO, drawDemo } from './demo';
import { frameGeometry } from './geometry';
import { hasEmbeddedCursor } from './quality';
import { BackgroundRenderer } from './backgrounds';
import { FrameGlass, frameMaterial, GLASS_MATERIAL } from './frame-glass';
import type { FrameMaterial } from './frame-glass';
import { drawSubtitles } from './subtitles';

const RENDER = {
  cursorReferenceWidth: 1600, clickRadius: 52, spotlightRadius: 145,
  shadowScale: 0.55, verticalTiltScale: 0.7,
} as const;
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  uniform vec2 u_size;
  uniform float u_aspect;
  uniform vec2 u_rotation;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    vec3 p = vec3(a_position.x * u_size.x * u_aspect, a_position.y * u_size.y, 0.0);
    float cx = cos(u_rotation.x); float sx = sin(u_rotation.x);
    float cy = cos(u_rotation.y); float sy = sin(u_rotation.y);
    p = vec3(p.x * cy, p.y, -p.x * sy);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float w = 1.0 - p.z / 3.8;
    gl_Position = vec4(p.x / u_aspect, p.y, 0.0, w);
  }
`;
const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform sampler2D u_backdrop;
  uniform vec2 u_pixels;
  uniform vec2 u_output;
  uniform float u_radius;
  uniform float u_outset;
  uniform float u_strength;
  uniform float u_blur;
  uniform float u_feather;
  vec4 videoAt(vec2 uv) {
    return texture2D(u_texture, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0));
  }
  vec3 frostedVideo(vec2 uv) {
    vec2 step = vec2(u_blur) / u_pixels;
    vec3 color = videoAt(uv).rgb * ${GLASS_MATERIAL.centerWeight};
    color += (videoAt(uv + vec2(step.x, 0.0)).rgb + videoAt(uv - vec2(step.x, 0.0)).rgb
      + videoAt(uv + vec2(0.0, step.y)).rgb + videoAt(uv - vec2(0.0, step.y)).rgb) * ${GLASS_MATERIAL.axialWeight};
    color += (videoAt(uv + step).rgb + videoAt(uv - step).rgb
      + videoAt(uv + vec2(step.x, -step.y)).rgb + videoAt(uv + vec2(-step.x, step.y)).rgb) * ${GLASS_MATERIAL.cornerWeight};
    return color;
  }
  void main() {
    vec2 p = v_uv * (u_pixels + vec2(u_outset * 2.0)) - vec2(u_outset);
    vec2 q = abs(p - u_pixels * 0.5) - (u_pixels * 0.5 - vec2(u_radius));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
    float alpha = 1.0 - smoothstep(-u_feather, u_feather, d);
    vec2 uv = p / u_pixels;
    vec4 color = videoAt(uv);
    float coverage = color.a * alpha;
    vec3 glass = vec3(0.0);
    float glassAlpha = 0.0;
    if (u_strength > 0.0 && d > -u_blur) {
      vec3 blurred = frostedVideo(uv);
      color.rgb = mix(color.rgb, blurred, smoothstep(-u_blur, 0.0, d) * u_strength * ${GLASS_MATERIAL.edgeMix});
      vec2 backdropUV = vec2(gl_FragCoord.x / u_output.x, 1.0 - gl_FragCoord.y / u_output.y);
      glass = mix(texture2D(u_backdrop, backdropUV).rgb, blurred, u_strength * ${GLASS_MATERIAL.reflection});
      glass = mix(glass, vec3(1.0), u_strength * (${GLASS_MATERIAL.tint} + ${GLASS_MATERIAL.highlight} * exp(-abs(d) / u_feather)));
      glassAlpha = u_strength * ${GLASS_MATERIAL.opacity} * (1.0 - smoothstep(0.0, max(u_outset, 1.0), max(d, 0.0)));
    }
    float rimCoverage = glassAlpha * (1.0 - coverage);
    gl_FragColor = vec4(color.rgb * coverage + glass * rimCoverage, coverage + rimCoverage);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('SHADER_CREATE_FAILED');
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'SHADER_COMPILE_FAILED');
  return shader;
}

export class VideoRenderer {
  private readonly background = new BackgroundRenderer();
  private readonly glass = new FrameGlass();
  private readonly output: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private readonly sourceCanvas = document.createElement('canvas');
  private readonly source: CanvasRenderingContext2D;
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private backdropTexture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private readonly demoCanvas = document.createElement('canvas');
  private readonly demoContext: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const output = canvas.getContext('2d', { alpha: false });
    const source = this.sourceCanvas.getContext('2d');
    const demoContext = this.demoCanvas.getContext('2d');
    if (!output || !source || !demoContext) throw new Error('CANVAS_UNAVAILABLE');
    this.output = output; this.source = source; this.demoContext = demoContext;
    this.demoCanvas.width = DEMO.width; this.demoCanvas.height = DEMO.height;
    this.gl = this.layer.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (this.gl) this.initializeGL(this.gl);
  }

  private initializeGL(gl: WebGLRenderingContext): void {
    const program = gl.createProgram();
    if (!program) throw new Error('PROGRAM_CREATE_FAILED');
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('PROGRAM_LINK_FAILED');
    this.program = program; this.buffer = gl.createBuffer(); this.texture = gl.createTexture(); this.backdropTexture = gl.createTexture();
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    for (const [unit, texture] of [[gl.TEXTURE0, this.texture], [gl.TEXTURE1, this.backdropTexture]] as const) {
      gl.activeTexture(unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_backdrop'), 1);
  }

  get supports3D(): boolean { return Boolean(this.gl); }

  render(project: Project, time: number, video?: HTMLVideoElement | null, original = false): CameraState {
    const settings = project.settings;
    const mapping = resolveTimeline(project, time);
    const camera = cameraAt(mapping.sourceTime, mapping.samples, mapping.clips, settings);
    if (original) { camera.zoom = 1; camera.x = 0.5; camera.y = 0.5; camera.rotateX = 0; camera.rotateY = 0; }
    let input: CanvasImageSource;
    if (mapping.sourceType === 'demo') {
      drawDemo(this.demoContext, mapping.sourceTime); input = this.demoCanvas;
    } else if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) input = video;
    else { this.drawBackground(settings); drawSubtitles(this.output, project.editing?.subtitles ?? [], time, this.canvas.width, this.canvas.height); return camera; }
    this.drawBackground(settings);
    const backdropChanged = this.glass.prepare(this.canvas, settings);
    const { width, height } = this.canvas;
    const { width: frameWidth, height: frameHeight } = frameGeometry(width, height, mapping.width, mapping.height, settings.padding);
    const material = frameMaterial(settings, width, frameWidth, frameHeight);
    const sourceWidth = Math.round(frameWidth);
    const sourceHeight = Math.round(frameHeight);
    if (this.sourceCanvas.width !== sourceWidth || this.sourceCanvas.height !== sourceHeight) {
      this.sourceCanvas.width = sourceWidth; this.sourceCanvas.height = sourceHeight;
    }
    this.source.clearRect(0, 0, sourceWidth, sourceHeight);
    const cropWidth = mapping.width / camera.zoom;
    const cropHeight = mapping.height / camera.zoom;
    const cropX = clamp(camera.x * mapping.width - cropWidth / 2, 0, mapping.width - cropWidth);
    const cropY = clamp(camera.y * mapping.height - cropHeight / 2, 0, mapping.height - cropHeight);
    this.source.drawImage(input, cropX, cropY, cropWidth, cropHeight, 0, 0, sourceWidth, sourceHeight);
    if (!original && mapping.samples.length > 0) this.drawCursor(camera, hasEmbeddedCursor({ ...project, cursorEmbedded: mapping.cursorEmbedded, sourceType: mapping.sourceType }) ? { ...settings, cursor: 'none' } : settings, mapping.width, cropX, cropY, cropWidth, cropHeight);
    const shadow = settings.shadow / 100;
    this.output.save();
    this.output.shadowColor = `rgba(0, 0, 0, ${shadow * RENDER.shadowScale})`;
    this.output.shadowBlur = frameWidth * 0.05 * shadow;
    this.output.shadowOffsetY = frameHeight * 0.045 * shadow;
    if (this.gl && this.program) {
      this.drawGL(camera, material, frameWidth, frameHeight, backdropChanged);
      this.output.drawImage(this.layer, 0, 0);
    } else {
      const surface = this.glass.composite(this.sourceCanvas, width, height, frameWidth, frameHeight, material);
      this.output.drawImage(surface, (width - frameWidth) / 2 - material.outset, (height - frameHeight) / 2 - material.outset);
    }
    this.output.restore();
    drawSubtitles(this.output, project.editing?.subtitles ?? [], time, width, height);
    return camera;
  }

  private drawBackground(settings: VisualSettings): void {
    const { width, height } = this.canvas;
    this.background.render(this.output, width, height, settings);
  }

  private drawGL(camera: CameraState, material: FrameMaterial, frameWidth: number, frameHeight: number, backdropChanged: boolean): void {
    const gl = this.gl; const program = this.program;
    if (!gl || !program) return;
    const { width, height } = this.canvas;
    if (this.layer.width !== width || this.layer.height !== height) { this.layer.width = width; this.layer.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.backdropTexture);
    if (backdropChanged) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.glass.backdrop);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);
    gl.uniform2f(gl.getUniformLocation(program, 'u_size'), (frameWidth + material.outset * 2) / width, (frameHeight + material.outset * 2) / height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), width / height);
    gl.uniform2f(gl.getUniformLocation(program, 'u_rotation'), camera.rotateX * MOTION.degreesToRadians, camera.rotateY * MOTION.degreesToRadians);
    gl.uniform2f(gl.getUniformLocation(program, 'u_pixels'), frameWidth, frameHeight);
    gl.uniform2f(gl.getUniformLocation(program, 'u_output'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), material.radius);
    gl.uniform1f(gl.getUniformLocation(program, 'u_outset'), material.outset);
    gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), material.strength);
    gl.uniform1f(gl.getUniformLocation(program, 'u_blur'), material.blur);
    gl.uniform1f(gl.getUniformLocation(program, 'u_feather'), material.feather);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawCursor(camera: CameraState, settings: VisualSettings, projectWidth: number, cropX: number, cropY: number, cropWidth: number, cropHeight: number): void {
    const ctx = this.source;
    const x = (camera.cursorX * projectWidth - cropX) / cropWidth * this.sourceCanvas.width;
    const sourceProjectHeight = projectWidth * cropHeight / cropWidth;
    const y = (camera.cursorY * sourceProjectHeight - cropY) / cropHeight * this.sourceCanvas.height;
    const size = settings.cursorSize * this.canvas.width / RENDER.cursorReferenceWidth;
    ctx.save();
    if (settings.spotlight) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, RENDER.spotlightRadius * size / 28);
      glow.addColorStop(0, '#ffffff53'); glow.addColorStop(1, '#ffffff00');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
    }
    if (settings.clickEffect && camera.clickAge >= 0 && camera.clickAge < TIME.clickDuration) {
      const progress = camera.clickAge / TIME.clickDuration;
      ctx.strokeStyle = `rgba(30, 30, 30, ${1 - progress})`;
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - progress) * 0.25})`;
      ctx.lineWidth = size * 0.1;
      ctx.beginPath(); ctx.arc(x, y, size * (0.45 + progress * 1.7), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (settings.cursor === 'dot') {
      ctx.beginPath(); ctx.arc(x, y, size * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#222222'; ctx.lineWidth = size * 0.09; ctx.stroke();
    } else if (settings.cursor === 'arrow') {
      ctx.translate(x, y); ctx.rotate(-0.14);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 0.08, size);
      ctx.lineTo(size * 0.35, size * 0.7); ctx.lineTo(size * 0.61, size * 1.09);
      ctx.lineTo(size * 0.82, size * 0.95); ctx.lineTo(size * 0.56, size * 0.57);
      ctx.lineTo(size * 0.97, size * 0.5); ctx.closePath();
      ctx.shadowColor = '#00000066'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#222222'; ctx.lineWidth = size * 0.07; ctx.lineJoin = 'round'; ctx.stroke();
    }
    ctx.restore();
  }

  dispose(): void {
    this.background.dispose();
    this.glass.dispose();
    if (this.gl) { this.gl.deleteTexture(this.texture); this.gl.deleteTexture(this.backdropTexture); this.gl.deleteProgram(this.program); this.gl.deleteBuffer(this.buffer); }
  }
}

export function canvasDimensions(aspect: VisualSettings['aspect'], height: number): readonly [number, number] {
  const ratio = ASPECTS[aspect];
  if (ratio < 1) return [Math.round(height * ratio / 2) * 2, height];
  return [Math.round(height * ratio / 2) * 2, height];
}
