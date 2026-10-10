/** 实时渲染带倒角的金属光标雕塑，输出透明图层供宣传片合成。 */
export interface ChromePose { yaw: number; pitch: number; roll: number; scale: number; light: number; }
interface Vector3 { x: number; y: number; z: number; }
interface Vertex2 { x: number; y: number; }
const MESH = { size: 880, depth: 0.18, bevel: 0.09, front: 0.27, innerScale: 0.84, perspective: 4.6 } as const;
const SILHOUETTE: readonly Vertex2[] = [
  { x: -0.62, y: 0.88 }, { x: -0.62, y: -0.61 }, { x: -0.13, y: -0.22 },
  { x: 0.19, y: -0.91 }, { x: 0.50, y: -0.76 }, { x: 0.19, y: -0.09 }, { x: 0.78, y: -0.09 },
];
const FRONT_FACES = [[0, 1, 2], [0, 2, 5], [0, 5, 6], [2, 3, 4], [2, 4, 5]] as const;
const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_normal;
uniform vec3 u_rotate;
uniform float u_scale;
varying vec3 v_normal;
varying vec3 v_position;
vec3 rotation(vec3 p) {
  float sy=sin(u_rotate.x),cy=cos(u_rotate.x),sx=sin(u_rotate.y),cx=cos(u_rotate.y),sz=sin(u_rotate.z),cz=cos(u_rotate.z);
  p=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy);
  p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);
  return vec3(p.x*cz-p.y*sz,p.x*sz+p.y*cz,p.z);
}
void main(){vec3 p=rotation(a_position);v_position=p;v_normal=rotation(a_normal);float w=1.0-p.z/${MESH.perspective};gl_Position=vec4(p.xy*u_scale,0.15-p.z*0.1,w);}
`;
const FRAGMENT = `
precision highp float;
varying vec3 v_normal;
varying vec3 v_position;
uniform float u_light;
void main(){
  vec3 n=normalize(v_normal);vec3 view=normalize(vec3(0.0,0.0,4.6)-v_position);vec3 r=reflect(-view,n);
  float soft=pow(max(0.0,dot(n,normalize(vec3(-0.6,0.8,1.3)))),0.7);
  float stripe=exp(-pow((r.y-0.14-r.x*0.33)*4.7,2.0));
  float narrow=exp(-pow((r.x+0.65)*14.0,2.0));
  float dark=exp(-pow((r.y+0.32+r.x*0.25)*7.0,2.0));
  float rim=pow(1.0-max(0.0,dot(n,view)),2.4);
  vec3 color=vec3(0.13)+vec3(0.68)*soft+vec3(0.88)*stripe+vec3(0.74)*narrow-vec3(0.40)*dark;
  float orange=exp(-pow((r.x-r.y*0.8+sin(u_light)*0.22)*10.0,2.0));
  color=mix(color,vec3(1.0,0.26,0.10),orange*0.55)+vec3(0.52)*rim;
  color=clamp(color,0.0,1.0);gl_FragColor=vec4(color,1.0);
}
`;

function normal(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const result = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const length = Math.hypot(result.x, result.y, result.z); return { x: result.x / length, y: result.y / length, z: result.z / length };
}

function geometry(): Float32Array {
  const values: number[] = [];
  const vertex = (index: number, z: number, scale: number): Vector3 => ({ x: SILHOUETTE[index].x * scale, y: SILHOUETTE[index].y * scale, z });
  const face = (a: Vector3, b: Vector3, c: Vector3): void => { const n = normal(a, b, c); for (const p of [a, b, c]) values.push(p.x, p.y, p.z, n.x, n.y, n.z); };
  for (const indexes of FRONT_FACES) {
    face(vertex(indexes[0], MESH.front, MESH.innerScale), vertex(indexes[1], MESH.front, MESH.innerScale), vertex(indexes[2], MESH.front, MESH.innerScale));
    face(vertex(indexes[0], -MESH.depth, 1), vertex(indexes[2], -MESH.depth, 1), vertex(indexes[1], -MESH.depth, 1));
  }
  for (let index = 0; index < SILHOUETTE.length; index++) {
    const next = (index + 1) % SILHOUETTE.length;
    const a = vertex(index, MESH.front, MESH.innerScale), b = vertex(next, MESH.front, MESH.innerScale), c = vertex(index, MESH.depth, 1), d = vertex(next, MESH.depth, 1);
    face(a, d, b); face(a, c, d);
    const e = vertex(index, -MESH.depth, 1), f = vertex(next, -MESH.depth, 1);
    face(c, f, d); face(c, e, f);
  }
  return new Float32Array(values);
}

export class ChromeCursor {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly shaders: WebGLShader[] = [];
  private readonly vertexCount: number;

  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = MESH.size; this.canvas.height = MESH.size;
    const gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('PROMO_CHROME_WEBGL_UNAVAILABLE'); this.gl = gl;
    const shader = (type: number, source: string): WebGLShader => {
      const result = gl.createShader(type); if (!result) throw new Error('PROMO_SHADER_CREATE_FAILED');
      gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(result); gl.deleteShader(result); throw new Error(message ?? 'PROMO_SHADER_FAILED'); }
      this.shaders.push(result); return result;
    };
    const program = gl.createProgram(), buffer = gl.createBuffer(); if (!program || !buffer) throw new Error('PROMO_GL_RESOURCE_FAILED');
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'PROMO_PROGRAM_FAILED');
    this.program = program; this.buffer = buffer;
    const mesh = geometry(); this.vertexCount = mesh.length / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW); gl.useProgram(program);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    for (const [name, offset] of [['a_position', 0], ['a_normal', 3]] as const) { const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT); }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  render(pose: ChromePose): HTMLCanvasElement {
    const gl = this.gl; gl.viewport(0, 0, MESH.size, MESH.size); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniform3f(gl.getUniformLocation(this.program, 'u_rotate'), pose.yaw, pose.pitch, pose.roll);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_scale'), pose.scale); gl.uniform1f(gl.getUniformLocation(this.program, 'u_light'), pose.light);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount); return this.canvas;
  }

  dispose(): void { this.gl.deleteBuffer(this.buffer); for (const shader of this.shaders) this.gl.deleteShader(shader); this.gl.deleteProgram(this.program); this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
