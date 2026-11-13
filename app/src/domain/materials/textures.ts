import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { Pattern } from './params'

const SIZE = 256
const TAU = Math.PI * 2
const cache = new Map<string, Texture>()

/** Ruido de valores que se repite cada SIZE px (para que la textura no tenga costuras). */
function periodicNoise(cells: number, seed: number) {
  const grid: number[] = []
  for (let i = 0; i < cells * cells; i++) {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
    grid.push(x - Math.floor(x))
  }
  const at = (gx: number, gy: number) => grid[((gy + cells) % cells) * cells + ((gx + cells) % cells)]
  return (x: number, y: number) => {
    const fx = (x / SIZE) * cells, fy = (y / SIZE) * cells
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const tx = fx - ix, ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

/** Altura (0..1) de cada patrón. Todos los períodos dividen 256 para que el mosaico sea continuo. */
function heightFn(pattern: Pattern): (x: number, y: number) => number {
  switch (pattern) {
    case 'weave': {
      // Trama: hilos que pasan por arriba y por abajo, alternando.
      return (x, y) => {
        const cell = Math.floor(x / 8) + Math.floor(y / 8)
        const across = Math.sin((TAU * (y % 8)) / 16)
        const along = Math.sin((TAU * (x % 8)) / 16)
        return cell % 2 === 0 ? 0.5 + 0.5 * across : 0.5 + 0.5 * along
      }
    }
    case 'twill':
      // Sarga del jean: diagonales.
      return (x, y) => 0.5 + 0.5 * Math.sin((TAU * (x + y)) / 8) * (0.8 + 0.2 * Math.sin((TAU * y) / 4))
    case 'knit': {
      // Tejido de lana: columnas de "V".
      return (x, y) => {
        // Punto jersey: columnas de "V" gruesas, cada una con dos lazos.
        const col = x % 32
        const side = col < 16 ? col : 31 - col
        const rowPos = (y + side * 0.9) % 16
        const loop = Math.sin((Math.PI * rowPos) / 16)
        const edge = Math.sin((Math.PI * (col % 16)) / 16)
        return Math.max(0, loop) ** 0.7 * edge ** 0.5
      }
    }
    case 'burlap': {
      // Arpillera: hilos gruesos e irregulares, con huecos entre medio.
      const n = periodicNoise(16, 5)
      return (x, y) => {
        const cx = x % 16, cy = y % 16
        const over = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0
        const warp = Math.max(0, Math.sin((Math.PI * cx) / 16)) ** 0.6
        const weft = Math.max(0, Math.sin((Math.PI * cy) / 16)) ** 0.6
        const h = over ? Math.max(warp * 0.9, weft * 0.6) : Math.max(weft * 0.9, warp * 0.6)
        return h * (0.75 + 0.25 * n(x, y))
      }
    }
    case 'fuzz': {
      // Pelusa: lana, terciopelo.
      const n1 = periodicNoise(64, 7), n2 = periodicNoise(128, 8)
      return (x, y) => 0.5 * n1(x, y) + 0.5 * n2(x, y)
    }
    case 'grain': {
      const n1 = periodicNoise(32, 1), n2 = periodicNoise(64, 2)
      return (x, y) => 0.65 * n1(x, y) + 0.35 * n2(x, y)
    }
    case 'wood': {
      const n = periodicNoise(4, 3)
      return (x, y) => 0.5 + 0.5 * Math.sin(TAU * (y / SIZE) * 8 + 2.5 * n(x, y))
    }
  }
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  return [canvas, ctx, ctx.createImageData(SIZE, SIZE)]
}

function finish(canvas: HTMLCanvasElement, repeat: number): Texture {
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 8
  return tex
}

/** Mapa de normales a partir de la altura del patrón (relieve de la tela, el cuero…). */
export function normalTexture(pattern: Pattern, repeat: number): Texture {
  const key = `n:${pattern}:${repeat}`
  const hit = cache.get(key)
  if (hit) return hit
  const h = heightFn(pattern)
  const [canvas, ctx, img] = makeCanvas()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = h((x - 1 + SIZE) % SIZE, y) - h((x + 1) % SIZE, y)
      const dy = h(x, (y - 1 + SIZE) % SIZE) - h(x, (y + 1) % SIZE)
      const len = Math.hypot(dx, dy, 0.5)
      const i = (y * SIZE + x) * 4
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((0.5 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = finish(canvas, repeat)
  cache.set(key, tex)
  return tex
}

/** Mapa de color en grises (se multiplica por el color del material). Para la madera. */
export function colorTexture(pattern: Pattern, repeat: number, contrast = 0.28): Texture {
  const key = `c:${pattern}:${repeat}:${contrast}`
  const hit = cache.get(key)
  if (hit) return hit
  const h = heightFn(pattern)
  const [canvas, ctx, img] = makeCanvas()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = 255 * (1 - contrast + contrast * h(x, y))
      const i = (y * SIZE + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = finish(canvas, repeat)
  tex.colorSpace = SRGBColorSpace
  cache.set(key, tex)
  return tex
}
