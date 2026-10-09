import { ASPECTS, MOTION, TIME } from '../../shared';
import type { CameraState, Project, VisualSettings } from '../../shared';
import { cameraAt, clamp } from './motion';
import { DEMO, drawDemo } from './demo';
import { frameGeometry } from './geometry';
import { hasEmbeddedCursor } from './quality';
import { BackgroundRenderer } from './backgrounds';

const RENDER = {
  cursorReferenceWidth: 1600, clickRadius: 52, spotlightRadius: 145,
  radiusReferenceWidth: 1280,
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
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec2 u_pixels;
  uniform float u_radius;
  void main() {
    vec2 p = v_uv * u_pixels;
    vec2 q = abs(p - u_pixels * 0.5) - (u_pixels * 0.5 - vec2(u_radius));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
    float alpha = 1.0 - smoothstep(-1.0, 1.0, d);
    vec4 color = texture2D(u_texture, vec2(v_uv.x, 1.0 - v_uv.y));
    float coverage = color.a * alpha;
    gl_FragColor = vec4(color.rgb * coverage, coverage);
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
  private readonly output: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private readonly sourceCanvas = document.createElement('canvas');
  private readonly source: CanvasRenderingContext2D;
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
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
    this.program = program; this.buffer = gl.createBuffer(); this.texture = gl.createTexture();
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  get supports3D(): boolean { return Boolean(this.gl); }

  render(project: Project, time: number, video?: HTMLVideoElement | null, original = false): CameraState {
    const settings = project.settings;
    const camera = cameraAt(time, project.samples, project.clips, settings);
    if (original) { camera.zoom = 1; camera.x = 0.5; camera.y = 0.5; camera.rotateX = 0; camera.rotateY = 0; }
    let input: CanvasImageSource;
    if (project.sourceType === 'demo') {
      drawDemo(this.demoContext, time); input = this.demoCanvas;
    } else if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) input = video;
    else { this.drawBackground(settings); return camera; }
    this.drawBackground(settings);
    const { width, height } = this.canvas;
    const { width: frameWidth, height: frameHeight } = frameGeometry(width, height, project.width, project.height, settings.padding);
    const sourceWidth = Math.round(frameWidth);
    const sourceHeight = Math.round(frameHeight);
    if (this.sourceCanvas.width !== sourceWidth || this.sourceCanvas.height !== sourceHeight) {
      this.sourceCanvas.width = sourceWidth; this.sourceCanvas.height = sourceHeight;
    }
    this.source.clearRect(0, 0, sourceWidth, sourceHeight);
    const cropWidth = project.width / camera.zoom;
    const cropHeight = project.height / camera.zoom;
    const cropX = clamp(camera.x * project.width - cropWidth / 2, 0, project.width - cropWidth);
    const cropY = clamp(camera.y * project.height - cropHeight / 2, 0, project.height - cropHeight);
    this.source.drawImage(input, cropX, cropY, cropWidth, cropHeight, 0, 0, sourceWidth, sourceHeight);
    if (!original && project.samples.length > 0) this.drawCursor(camera, hasEmbeddedCursor(project) ? { ...settings, cursor: 'none' } : settings, project.width, cropX, cropY, cropWidth, cropHeight);
    const shadow = settings.shadow / 100;
    this.output.save();
    this.output.shadowColor = `rgba(0, 0, 0, ${shadow * RENDER.shadowScale})`;
    this.output.shadowBlur = frameWidth * 0.05 * shadow;
    this.output.shadowOffsetY = frameHeight * 0.045 * shadow;
    if (this.gl && this.program) {
      this.drawGL(camera, settings, frameWidth, frameHeight);
      this.output.drawImage(this.layer, 0, 0);
    } else {
      const x = (width - frameWidth) / 2;
      const y = (height - frameHeight) / 2;
      this.output.beginPath(); this.output.roundRect(x, y, frameWidth, frameHeight, settings.radius * width / RENDER.radiusReferenceWidth); this.output.fillStyle = '#ffffff'; this.output.fill();
      this.output.shadowBlur = 0; this.output.shadowOffsetY = 0;
      this.output.clip(); this.output.drawImage(this.sourceCanvas, x, y, frameWidth, frameHeight);
    }
    this.output.restore();
    return camera;
  }

  private drawBackground(settings: VisualSettings): void {
    const { width, height } = this.canvas;
    this.background.render(this.output, width, height, settings);
  }

  private drawGL(camera: CameraState, settings: VisualSettings, frameWidth: number, frameHeight: number): void {
    const gl = this.gl; const program = this.program;
    if (!gl || !program) return;
    const { width, height } = this.canvas;
    if (this.layer.width !== width || this.layer.height !== height) { this.layer.width = width; this.layer.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);
    gl.uniform2f(gl.getUniformLocation(program, 'u_size'), frameWidth / width, frameHeight / height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), width / height);
    gl.uniform2f(gl.getUniformLocation(program, 'u_rotation'), camera.rotateX * MOTION.degreesToRadians, camera.rotateY * MOTION.degreesToRadians);
    gl.uniform2f(gl.getUniformLocation(program, 'u_pixels'), frameWidth, frameHeight);
    gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), settings.radius * width / RENDER.radiusReferenceWidth);
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
    if (this.gl) { this.gl.deleteTexture(this.texture); this.gl.deleteProgram(this.program); this.gl.deleteBuffer(this.buffer); }
  }
}

export function canvasDimensions(aspect: VisualSettings['aspect'], height: number): readonly [number, number] {
  const ratio = ASPECTS[aspect];
  if (ratio < 1) return [Math.round(height * ratio / 2) * 2, height];
  return [Math.round(height * ratio / 2) * 2, height];
}
