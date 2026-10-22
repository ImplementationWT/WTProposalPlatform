// Stable-fluids dye simulation behind the cursor's nebula trail, after Pavel Dobryakov's
// WebGL Fluid Simulation (MIT). WebGL2 only: createFluid returns null when it can't run.

// Tuned for slow, drifting space smoke rather than splashy liquid: the sim runs at half speed,
// pushes gently, and keeps vorticity low so it billows instead of whipping around.
const CONFIG = {
  simResolution: 128,
  dyeResolution: 1024,
  timeScale: 0.5,
  densityDissipation: 0.7,
  velocityDissipation: 0.5,
  pressure: 0.8,
  pressureIterations: 20,
  curl: 12,
  splatRadius: 0.0026,
  splatForce: 2200,
}

const VERTEX = `
precision highp float;
attribute vec2 aPosition;
uniform vec2 texelSize;
varying vec2 vUv, vL, vR, vT, vB;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const HEADER = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv, vL, vR, vT, vB;
`

const SHADERS = {
  clear: `
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,

  splat: `
uniform sampler2D uTarget;
uniform float aspectRatio, radius;
uniform vec3 color;
uniform vec2 point;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
}`,

  advection: `
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize;
uniform float dt, dissipation;
void main () {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
}`,

  divergence: `
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

  curl: `
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,

  vorticity: `
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}`,

  pressure: `
uniform sampler2D uPressure, uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`,

  gradientSubtract: `
uniform sampler2D uPressure, uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`,

  // Premultiplied output: black dye is fully transparent, so the starfield shows through.
  display: `
uniform sampler2D uTexture;
void main () {
  vec3 c = min(texture2D(uTexture, vUv).rgb, vec3(1.0));
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`,
}

type Uniforms = Record<string, WebGLUniformLocation>

interface FBO {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  attach(unit: number): number
}

interface DoubleFBO {
  read: FBO
  write: FBO
  swap(): void
}

export interface Fluid {
  /** x/y and dx/dy in normalized canvas coordinates, origin bottom-left; size scales the radius. */
  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number], size?: number): void
  step(dt: number): void
  render(): void
  resize(): void
  clear(): void
  destroy(): void
}

export function createFluid(canvas: HTMLCanvasElement): Fluid | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return null

  try {
    return build(gl, canvas)
  } catch {
    return null
  }
}

function build(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement): Fluid {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
    return shader
  }
  const vertex = compile(gl.VERTEX_SHADER, VERTEX)
  const program = (fragment: string) => {
    const p = gl.createProgram()!
    gl.attachShader(p, vertex)
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEADER + fragment))
    gl.bindAttribLocation(p, 0, 'aPosition')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program')
    const uniforms: Uniforms = {}
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(p, i)!.name
      uniforms[name] = gl.getUniformLocation(p, name)!
    }
    return () => {
      gl.useProgram(p)
      return uniforms
    }
  }
  const programs = Object.fromEntries(Object.entries(SHADERS).map(([k, src]) => [k, program(src)])) as Record<
    keyof typeof SHADERS,
    () => Uniforms
  >

  // Full-screen quad on attribute 0.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)

  const blit = (target: FBO | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  const created: FBO[] = []
  const fbo = (width: number, height: number): FBO => {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null)
    const framebuffer = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('RGBA16F not renderable')
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const target = {
      texture,
      fbo: framebuffer,
      width,
      height,
      attach(unit: number) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return unit
      },
    }
    created.push(target)
    return target
  }
  const doubleFbo = (width: number, height: number): DoubleFBO => {
    const pair = {
      read: fbo(width, height),
      write: fbo(width, height),
      swap() {
        ;[pair.read, pair.write] = [pair.write, pair.read]
      },
    }
    return pair
  }

  const resolution = (res: number) => {
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight
    const min = Math.round(res)
    const max = Math.round(res * Math.max(aspect, 1 / aspect))
    return aspect > 1 ? [max, min] : [min, max]
  }

  let velocity: DoubleFBO, dye: DoubleFBO, pressure: DoubleFBO, divergence: FBO, curl: FBO
  const release = () => {
    for (const t of created.splice(0)) {
      gl.deleteTexture(t.texture)
      gl.deleteFramebuffer(t.fbo)
    }
  }
  const init = () => {
    release()
    canvas.width = Math.max(1, canvas.clientWidth)
    canvas.height = Math.max(1, canvas.clientHeight)
    const [sw, sh] = resolution(CONFIG.simResolution)
    const [dw, dh] = resolution(CONFIG.dyeResolution)
    velocity = doubleFbo(sw, sh)
    dye = doubleFbo(dw, dh)
    pressure = doubleFbo(sw, sh)
    divergence = fbo(sw, sh)
    curl = fbo(sw, sh)
  }
  init()

  const step = (realDt: number) => {
    const dt = realDt * CONFIG.timeScale
    gl.disable(gl.BLEND)
    const tx = 1 / velocity.read.width
    const ty = 1 / velocity.read.height

    let u = programs.curl()
    gl.uniform2f(u.texelSize, tx, ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    blit(curl)

    u = programs.vorticity()
    gl.uniform2f(u.texelSize, tx, ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    gl.uniform1i(u.uCurl, curl.attach(1))
    gl.uniform1f(u.curl, CONFIG.curl)
    gl.uniform1f(u.dt, dt)
    blit(velocity.write)
    velocity.swap()

    u = programs.divergence()
    gl.uniform2f(u.texelSize, tx, ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    blit(divergence)

    u = programs.clear()
    gl.uniform1i(u.uTexture, pressure.read.attach(0))
    gl.uniform1f(u.value, CONFIG.pressure)
    blit(pressure.write)
    pressure.swap()

    u = programs.pressure()
    gl.uniform2f(u.texelSize, tx, ty)
    gl.uniform1i(u.uDivergence, divergence.attach(0))
    for (let i = 0; i < CONFIG.pressureIterations; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    u = programs.gradientSubtract()
    gl.uniform2f(u.texelSize, tx, ty)
    gl.uniform1i(u.uPressure, pressure.read.attach(0))
    gl.uniform1i(u.uVelocity, velocity.read.attach(1))
    blit(velocity.write)
    velocity.swap()

    u = programs.advection()
    gl.uniform2f(u.texelSize, tx, ty)
    const v = velocity.read.attach(0)
    gl.uniform1i(u.uVelocity, v)
    gl.uniform1i(u.uSource, v)
    gl.uniform1f(u.dt, dt)
    gl.uniform1f(u.dissipation, CONFIG.velocityDissipation)
    blit(velocity.write)
    velocity.swap()

    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    gl.uniform1i(u.uSource, dye.read.attach(1))
    gl.uniform1f(u.dissipation, CONFIG.densityDissipation)
    blit(dye.write)
    dye.swap()
  }

  const splat = (x: number, y: number, dx: number, dy: number, color: [number, number, number], size = 1) => {
    const aspect = canvas.width / canvas.height
    // Deltas are fractions of each axis; scale them so a diagonal stroke pushes diagonally.
    if (aspect < 1) dx *= aspect
    if (aspect > 1) dy /= aspect
    const u = programs.splat()
    gl.uniform1f(u.aspectRatio, aspect)
    gl.uniform2f(u.point, x, y)
    gl.uniform1f(u.radius, CONFIG.splatRadius * size * Math.max(aspect, 1))
    gl.uniform1i(u.uTarget, velocity.read.attach(0))
    gl.uniform3f(u.color, dx * CONFIG.splatForce, dy * CONFIG.splatForce, 0)
    blit(velocity.write)
    velocity.swap()
    gl.uniform1i(u.uTarget, dye.read.attach(0))
    gl.uniform3f(u.color, ...color)
    blit(dye.write)
    dye.swap()
  }

  return {
    splat,
    step,
    render() {
      const u = programs.display()
      gl.uniform1i(u.uTexture, dye.read.attach(0))
      blit(null)
    },
    resize: init,
    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    },
    // Keeps the context alive: getContext() on this canvas hands it back on remount (StrictMode).
    destroy() {
      release()
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    },
  }
}
