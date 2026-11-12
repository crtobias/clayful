import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry, Group, Matrix4, Mesh, Object3D, PMREMGenerator,
  PerspectiveCamera, Plane, Quaternion, Raycaster, SRGBColorSpace, ShaderMaterial, Vector2, Vector3, type Intersection,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getGeometry, getOriginalMaterial } from '@/domain/scene/geometry'
import type { Part, Vec3 } from '@/domain/scene/model'
import { buildMaterial, imageMaterial } from '@/domain/materials/buildMaterial'
import { moveGrab, sculptDab, snakeDab, startGrab, strokeContext, type Grab, type SculptBrush, type StrokeContext } from '@/domain/sculpt/brushes'
import { blurDab, gradientFill, paintDab, pickColor, smearDab } from '@/domain/paint/paint'
import { refresh } from '@/shared/lib/meshOps'
import { tipWeight, type Tip } from '@/shared/lib/brushShape'
import { symmetryCopies, transformDelta } from '@/shared/lib/symmetry'
import { t } from '@/shared/i18n/es'
import type { CaptureFn, EditHooks, LookView, Mode, PaintSettings, SculptSettings, Tool } from '../types'
import styles from './Viewport.module.scss'

interface Props {
  parts: Part[]
  selectedId: string | null
  mode: Mode
  tool: Tool
  sculpt: SculptSettings
  paint: PaintSettings
  hooks: EditHooks
  onSelect: (id: string | null) => void
  onTransformStart: () => void
  onTransformEnd: (id: string, t: { position: Vec3; rotation: Vec3; scale: Vec3 }) => void
  onCaptureReady: (fn: CaptureFn) => void
}

const GIZMO_MODE = { mover: 'translate', girar: 'rotate', escalar: 'scale' } as const
const PARTS_GROUP = 'clayful-parts'
const ACCENT = '#5b4cf0'

export function Viewport(props: Props) {
  const { parts, selectedId, mode, tool, onSelect, onTransformStart, onTransformEnd, onCaptureReady } = props
  const [selected, setSelected] = useState<Object3D | null>(null)
  const meshes = useRef(new Map<string, Mesh>())
  const hint = mode === 'esculpir' ? t.sculptHint : mode === 'pintar' ? t.paintHint : t.hint

  return (
    <section className={`${styles.viewport} ${mode !== 'modelar' ? styles.editing : ''}`} aria-label="Vista 3D">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.5, 3.5, 6], fov: 40 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={() => { if (mode === 'modelar') onSelect(null) }}
      >
        <color attach="background" args={['#e8eaee']} />
        <SceneEnvironment />
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 8, 5]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
        <Grid infiniteGrid cellSize={0.5} sectionSize={2.5} cellColor="#d3d7de" sectionColor="#c3c8d1" fadeDistance={40} />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={20} blur={2.4} far={6} />

        <group name={PARTS_GROUP}>
          {parts.map((part) => (
            <PartMesh
              key={part.id}
              part={part}
              showBox={part.id === selectedId && mode === 'modelar'}
              showMask={mode === 'esculpir'}
              onSelect={onSelect}
              meshes={meshes}
              onSelectedRef={part.id === selectedId ? setSelected : undefined}
            />
          ))}
        </group>

        {mode === 'modelar' && selected && tool !== 'elegir' && selectedId && (
          <TransformControls
            object={selected}
            mode={GIZMO_MODE[tool]}
            onMouseDown={onTransformStart}
            onMouseUp={() => onTransformEnd(selectedId, {
              position: selected.position.toArray() as Vec3,
              rotation: [selected.rotation.x, selected.rotation.y, selected.rotation.z],
              scale: selected.scale.toArray() as Vec3,
            })}
          />
        )}
        <OrbitControls makeDefault />
        {mode !== 'modelar' && <StrokeController {...props} meshes={meshes} />}
        <CaptureBridge onReady={onCaptureReady} />
      </Canvas>

      {mode === 'pintar' && props.paint.stencil && <img className={styles.stencil} src={props.paint.stencil} alt="" />}
      {parts.length === 0 && <p className={styles.empty}>{t.noParts}</p>}
      <p className={styles.hint}>{hint}</p>
    </section>
  )
}

interface PartMeshProps {
  part: Part
  showBox: boolean
  showMask: boolean
  onSelect: (id: string) => void
  meshes: MutableRefObject<Map<string, Mesh>>
  onSelectedRef?: (obj: Object3D | null) => void
}

function PartMesh({ part, showBox, showMask, onSelect, meshes, onSelectedRef }: PartMeshProps) {
  const geometry = getGeometry(part.geometryId)
  const vertexColors = Boolean(geometry?.hasAttribute('color'))
  const material = useMemo(
    () => (part.image ? imageMaterial(part.image) : buildMaterial(part.material, getOriginalMaterial(part.geometryId), vertexColors, Boolean(part.lowPoly))),
    [part.image, part.material, part.geometryId, vertexColors, part.lowPoly],
  )
  if (!geometry) return null
  return (
    <mesh
      ref={(obj: Mesh | null) => {
        if (obj) { obj.userData.partId = part.id; meshes.current.set(part.id, obj) } else meshes.current.delete(part.id)
        onSelectedRef?.(obj)
      }}
      name={part.name}
      geometry={geometry}
      material={material}
      position={part.position}
      rotation={part.rotation}
      scale={part.scale}
      castShadow={!part.image}
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onSelect(part.id) }}
    >
      {showBox && <SelectionBox geometry={geometry} />}
      {showMask && geometry.hasAttribute('mask') && <MaskOverlay geometry={geometry} />}
    </mesh>
  )
}

/** Marca de selección: una caja fina alrededor de la parte (se ve a través). */
function SelectionBox({ geometry }: { geometry: BufferGeometry }) {
  const [edges, center] = useMemo(() => {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const size = box.getSize(new Vector3()).addScalar(0.04)
    return [new EdgesGeometry(new BoxGeometry(size.x, size.y, size.z)), box.getCenter(new Vector3())]
  }, [geometry])
  return (
    <lineSegments geometry={edges} position={center} renderOrder={10} raycast={() => null}>
      <lineBasicMaterial color={ACCENT} transparent opacity={0.7} depthTest={false} />
    </lineSegments>
  )
}

type StrokeProps = Props & { meshes: MutableRefObject<Map<string, Mesh>> }

type RGB = [number, number, number]

/** Lee una imagen en memoria para la plantilla. */
function useStencil(url: string | null) {
  const [data, setData] = useState<ImageData | null>(null)
  useEffect(() => {
    if (!url) { setData(null); return }
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      setData(ctx.getImageData(0, 0, c.width, c.height))
    }
    img.src = url
  }, [url])
  return data
}

/**
 * Esculpir y pintar: el cursor muestra la forma de la punta sobre la superficie y los trazos editan la malla.
 * Cada pincelada se repite según la simetría (espejo X/Y/Z y radial).
 */
function StrokeController({ selectedId, mode, sculpt, paint, hooks, onSelect, meshes }: StrokeProps) {
  const { gl, camera, controls } = useThree()
  const cursor = useRef<Group>(null)
  const stencil = useStencil(mode === 'pintar' ? paint.stencil : null)
  const settings = useRef({ selectedId, mode, sculpt, paint, hooks, onSelect, stencil })
  useEffect(() => { settings.current = { selectedId, mode, sculpt, paint, hooks, onSelect, stencil } })

  const isPaint = mode === 'pintar'
  const texture = useMemo(
    () => cursorTexture(isPaint
      ? { tip: paint.tip, angle: paint.angle, softness: paint.softness, color: paint.tool === 'goma' ? '#ffffff' : paint.color, line: [22, 24, 29] }
      : { tip: sculpt.tip, angle: sculpt.angle, color: sculpt.brush === 'mascara' ? '#16181d' : ACCENT, line: [58, 46, 196] }),
    [isPaint, paint.tip, paint.angle, paint.softness, paint.color, paint.tool, sculpt.tip, sculpt.angle, sculpt.brush],
  )
  useEffect(() => () => texture.dispose(), [texture])
  const arrowSign = !isPaint && ['sumar', 'inflar', 'arcilla', 'capa'].includes(sculpt.brush) ? 1 : !isPaint && ['quitar', 'cortar', 'pliegue'].includes(sculpt.brush) ? -1 : 0

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const orbit = controls as unknown as { enabled: boolean } | null
    /** Fin del último trazo de pintura (para Shift+clic = línea recta). */
    let lastEnd: { mesh: Mesh; point: Vector3 } | null = null

    let stroke: null | {
      mesh: Mesh
      geometry: BufferGeometry
      /** Low poly: rehace la versión facetada (una vez por cuadro como mucho). */
      regenerate?: () => BufferGeometry
      pending?: number
      last: Vector3 | null
      lastHit: Intersection | null
      x: number
      y: number
      grabs?: { grab: Grab; m: Matrix4 }[]
      plane?: Plane
      startLocal?: Vector3
      snake?: Vector3
      ctx?: StrokeContext
      carry?: (RGB | null)[]
      gradient?: { base: Float32Array; from: Vector3 }
      timer?: ReturnType<typeof setInterval>
      e: PointerEvent
    } = null

    const castAt = (x: number, y: number): Intersection | undefined => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects([...meshes.current.values()], false)[0]
    }
    const cast = (e: PointerEvent) => castAt(e.clientX, e.clientY)
    const toScreen = (p: Vector3) => {
      const r = el.getBoundingClientRect()
      const v = p.clone().project(camera)
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }

    const localHit = (mesh: Mesh, hit: Intersection) => {
      const center = mesh.worldToLocal(hit.point.clone())
      const nor = mesh.geometry.attributes.normal
      const f = hit.face!
      const normal = new Vector3(
        nor.getX(f.a) + nor.getX(f.b) + nor.getX(f.c),
        nor.getY(f.a) + nor.getY(f.b) + nor.getY(f.c),
        nor.getZ(f.a) + nor.getZ(f.b) + nor.getZ(f.c),
      ).normalize()
      const scale = (Math.abs(mesh.scale.x) + Math.abs(mesh.scale.y) + Math.abs(mesh.scale.z)) / 3 || 1
      return { center, normal, scale }
    }

    /** Plantilla: color de un vértice según dónde cae en la pantalla. */
    const stencilSampler = (mesh: Mesh) => {
      const img = settings.current.stencil
      if (!img) return undefined
      const r = el.getBoundingClientRect()
      const k = Math.min(r.width / img.width, r.height / img.height)
      const w = img.width * k, h = img.height * k
      const ox = (r.width - w) / 2, oy = (r.height - h) / 2
      const v = new Vector3()
      const c = new Color()
      return (x: number, y: number, z: number): RGB | null => {
        v.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera)
        const px = ((v.x + 1) / 2) * r.width - ox, py = ((1 - v.y) / 2) * r.height - oy
        if (px < 0 || py < 0 || px >= w || py >= h) return null
        const i = (Math.floor(py / k) * img.width + Math.floor(px / k)) * 4
        if (img.data[i + 3] < 10) return null
        c.setRGB(img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255, SRGBColorSpace)
        return [c.r, c.g, c.b]
      }
    }

    const showCursor = (hit: Intersection | undefined) => {
      const c = cursor.current
      if (!c) return
      const s = settings.current
      const onSelected = hit && hit.object.userData.partId === s.selectedId
      c.visible = Boolean(onSelected)
      if (!hit || !onSelected) return
      const n = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld)
      c.position.copy(hit.point).addScaledVector(n, 0.003)
      c.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n))
      c.scale.setScalar(s.mode === 'pintar' ? s.paint.size : s.sculpt.size)
    }

    /** Low poly en vivo: después de editar la malla lisa, rehace la facetada en el próximo cuadro. */
    const redisplay = () => {
      const st = stroke
      if (!st?.regenerate || st.pending) return
      st.pending = requestAnimationFrame(() => {
        st.pending = undefined
        st.mesh.geometry = st.regenerate!()
      })
    }

    /** Una pincelada (con todas sus copias de simetría). */
    const dab = (mesh: Mesh, hit: Intersection, e: PointerEvent) => {
      const s = settings.current
      const g = stroke!.geometry
      const { center, normal, scale } = localHit(mesh, hit)
      if (s.mode === 'esculpir') {
        let brush: SculptBrush = s.sculpt.brush
        if (e.shiftKey && brush !== 'mascara') brush = 'suavizar'
        if (brush === 'arrastrar' || brush === 'gancho') return
        const radius = s.sculpt.size / scale
        for (const copy of symmetryCopies(center, normal, s.sculpt.symmetry, radius * 0.35)) {
          sculptDab(g, brush, {
            center: copy.center, normal: copy.normal, radius, tip: s.sculpt.tip,
            angle: copy.flipped ? 180 - s.sculpt.angle : s.sculpt.angle, strength: s.sculpt.strength, invert: e.altKey,
          }, stroke!.ctx)
        }
        refresh(g, brush !== 'mascara', false, brush === 'mascara')
        redisplay()
        return
      }
      const p = s.paint
      const radius = p.size / scale
      const copies = symmetryCopies(center, normal, p.symmetry, radius * 0.35)
      copies.forEach((copy, k) => {
        const shape = { center: copy.center, normal: copy.normal, radius, tip: p.tip, angle: copy.flipped ? 180 - p.angle : p.angle, softness: p.softness }
        if (p.tool === 'difuminar') {
          stroke!.carry ??= []
          stroke!.carry[k] = smearDab(g, shape, stroke!.carry[k] ?? null, p.strength)
        } else if (p.tool === 'suavizar') {
          blurDab(g, shape, p.strength)
        } else {
          const goma = p.tool === 'goma'
          paintDab(g, {
            ...shape,
            color: goma ? '#ffffff' : p.color,
            blend: goma ? 'mezclar' : p.blend,
            opacity: p.tool === 'aerografo' ? p.strength * 0.12 : p.strength,
            sample: goma ? undefined : stencilSampler(mesh),
          })
        }
      })
      refresh(g, false, true)
      redisplay()
    }

    /** Recorre un tramo en pantalla de a 6 px para que el trazo no quede punteado. */
    const sweep = (fromX: number, fromY: number, toX: number, toY: number, e: PointerEvent, finalHit?: Intersection) => {
      if (!stroke) return
      const s = settings.current
      const spacing = (s.mode === 'pintar' ? s.paint.size * (s.paint.tool === 'aerografo' ? 0.1 : 0.25) : s.sculpt.size * 0.25)
      const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY) / 6))
      for (let i = 1; i <= steps; i++) {
        const h = i === steps && finalHit ? finalHit : castAt(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
        if (!h || h.object !== stroke.mesh) continue
        stroke.lastHit = h
        if (stroke.last && stroke.last.distanceTo(h.point) < spacing) continue
        stroke.last = h.point.clone()
        dab(stroke.mesh, h, e)
      }
    }

    const dragPlane = (point: Vector3) => new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()).negate(), point)
    const pointerOnPlane = (e: PointerEvent, plane: Plane) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, new Vector3())
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const hit = cast(e)
      if (!hit) return
      const s = settings.current
      const partId = hit.object.userData.partId as string
      if (partId !== s.selectedId) { s.onSelect(partId); if (orbit) orbit.enabled = false; return }
      const mesh = hit.object as Mesh
      if (s.mode === 'pintar' && s.paint.tool === 'gotero') { s.hooks.onPick(pickColor(mesh.geometry, mesh.worldToLocal(hit.point.clone()))); return }
      if (s.mode === 'pintar' && s.paint.tool === 'balde') { s.hooks.onFill(partId); return }

      const started = s.hooks.onStrokeStart(partId)
      if (!started) return
      const { geometry, regenerate } = started
      // La versión nueva se ve ya, sin esperar a React (en low poly, la facetada).
      mesh.geometry = regenerate ? regenerate() : geometry
      if (orbit) orbit.enabled = false
      el.setPointerCapture(e.pointerId)
      stroke = { mesh, geometry, regenerate, last: null, lastHit: hit, x: e.clientX, y: e.clientY, e }
      // En low poly el rayo pega en la facetada: el centro se toma igual (mismo espacio), la malla que se edita es la lisa.
      const { center, normal, scale } = localHit(mesh, hit)

      if (s.mode === 'esculpir') {
        const b = s.sculpt.brush
        const radius = s.sculpt.size / scale
        if (b === 'capa') stroke.ctx = strokeContext(geometry)
        if (b === 'arrastrar') {
          stroke.grabs = symmetryCopies(center, normal, s.sculpt.symmetry, radius * 0.35).map((c) => ({
            grab: startGrab(geometry, { center: c.center, normal: c.normal, radius, tip: s.sculpt.tip, angle: s.sculpt.angle }),
            m: c.matrix,
          }))
          stroke.plane = dragPlane(hit.point)
          stroke.startLocal = center
          return
        }
        if (b === 'gancho') {
          stroke.plane = dragPlane(hit.point)
          stroke.snake = center
          return
        }
      } else if (s.paint.tool === 'degradado') {
        stroke.gradient = { base: Float32Array.from(geometry.attributes.color.array as ArrayLike<number>), from: center }
        return
      } else if (e.shiftKey && lastEnd && lastEnd.mesh === mesh) {
        // Línea recta desde donde terminó el trazo anterior.
        const a = toScreen(lastEnd.point), b = toScreen(hit.point)
        sweep(a.x, a.y, b.x, b.y, e, hit)
        return
      }
      dab(mesh, hit, e)
      stroke.last = hit.point.clone()
      if (s.mode === 'pintar' && s.paint.tool === 'aerografo') {
        // El aerógrafo sigue cargando color aunque no muevas el mouse.
        stroke.timer = setInterval(() => { if (stroke?.lastHit) dab(stroke.mesh, stroke.lastHit, stroke.e) }, 60)
      }
    }

    const move = (e: PointerEvent) => {
      const hit = cast(e)
      showCursor(hit)
      if (!stroke) return
      stroke.e = e
      const s = settings.current
      if (stroke.grabs && stroke.plane && stroke.startLocal) {
        const p = pointerOnPlane(e, stroke.plane)
        if (!p) return
        const delta = stroke.mesh.worldToLocal(p).sub(stroke.startLocal)
        for (const { grab, m } of stroke.grabs) moveGrab(stroke.geometry, grab, transformDelta(delta, m))
        refresh(stroke.geometry, true, false)
        redisplay()
        return
      }
      if (stroke.snake && stroke.plane) {
        const p = pointerOnPlane(e, stroke.plane)
        if (!p) return
        const target = stroke.mesh.worldToLocal(p)
        const delta = target.clone().sub(stroke.snake)
        const scale = (Math.abs(stroke.mesh.scale.x) + Math.abs(stroke.mesh.scale.y) + Math.abs(stroke.mesh.scale.z)) / 3 || 1
        const radius = s.sculpt.size / scale
        const normal = camera.getWorldDirection(new Vector3()).negate().transformDirection(stroke.mesh.matrixWorld.clone().invert())
        for (const c of symmetryCopies(stroke.snake, normal, s.sculpt.symmetry, radius * 0.35)) {
          snakeDab(stroke.geometry, { center: c.center, normal: c.normal, radius, tip: s.sculpt.tip, angle: s.sculpt.angle }, transformDelta(delta, c.matrix), s.sculpt.strength)
        }
        stroke.snake = target
        stroke.plane = dragPlane(p)
        refresh(stroke.geometry, true, false)
        redisplay()
        return
      }
      if (stroke.gradient) {
        if (!hit || hit.object !== stroke.mesh) return
        const to = stroke.mesh.worldToLocal(hit.point.clone())
        gradientFill(stroke.geometry, stroke.gradient.base, stroke.gradient.from, to, s.paint.color, s.paint.color2, s.paint.blend, s.paint.strength)
        refresh(stroke.geometry, false, true)
        redisplay()
        return
      }
      sweep(stroke.x, stroke.y, e.clientX, e.clientY, e, hit && hit.object === stroke.mesh ? hit : undefined)
      stroke.x = e.clientX
      stroke.y = e.clientY
    }

    const up = (e: PointerEvent) => {
      if (orbit) orbit.enabled = true
      if (!stroke) return
      if (stroke.timer) clearInterval(stroke.timer)
      if (stroke.pending) { cancelAnimationFrame(stroke.pending); stroke.pending = undefined }
      if (stroke.regenerate) stroke.mesh.geometry = stroke.regenerate()
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (stroke.lastHit) lastEnd = { mesh: stroke.mesh, point: stroke.lastHit.point.clone() }
      stroke = null
    }

    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (stroke?.timer) clearInterval(stroke.timer)
      if (orbit) orbit.enabled = true
    }
  }, [gl, camera, controls, meshes])

  return (
    <group ref={cursor} visible={false} renderOrder={20}>
      <mesh raycast={() => null} renderOrder={20}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      {arrowSign !== 0 && (
        <mesh raycast={() => null} position={[0, 0, arrowSign * 0.45]} rotation={[arrowSign > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]} renderOrder={21}>
          <coneGeometry args={[0.12, 0.3, 16]} />
          <meshBasicMaterial color={ACCENT} depthTest={false} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  )
}

interface CursorLook {
  tip: Tip
  angle: number
  softness?: number
  color: string
  line: [number, number, number]
}

/** Textura del cursor: la forma real de la punta (la misma función que usa el pincel) con su caída y su borde. */
function cursorTexture(k: CursorLook): CanvasTexture {
  const N = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(N, N)
  const tint = hexToRgb(k.color)
  const a = (k.angle * Math.PI) / 180
  const weight = (px: number, py: number) => {
    const du = px * Math.cos(a) + py * Math.sin(a), dv = -px * Math.sin(a) + py * Math.cos(a)
    return tipWeight(k.tip, du, dv, 0, 1, k.softness)
  }
  const step = 2 / N
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1, py = -(((y + 0.5) / N) * 2 - 1)
      const w = weight(px, py)
      const edge = w > 0 && (weight(px + step, py) === 0 || weight(px - step, py) === 0 || weight(px, py + step) === 0 || weight(px, py - step) === 0)
      const i = (y * N + x) * 4
      if (edge) { img.data[i] = k.line[0]; img.data[i + 1] = k.line[1]; img.data[i + 2] = k.line[2]; img.data[i + 3] = 230; continue }
      img.data[i] = tint[0]; img.data[i + 1] = tint[1]; img.data[i + 2] = tint[2]
      img.data[i + 3] = Math.round(w * 140)
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Máscara visible: oscurece las zonas protegidas. */
const maskMaterial = new ShaderMaterial({
  vertexShader: 'attribute float mask; varying float vMask; void main() { vMask = mask; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying float vMask; void main() { if (vMask < 0.01) discard; gl_FragColor = vec4(0.08, 0.08, 0.12, vMask * 0.6); }',
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})

function MaskOverlay({ geometry }: { geometry: BufferGeometry }) {
  return <mesh geometry={geometry} material={maskMaterial} raycast={() => null} renderOrder={5} />
}

/** Luz de ambiente generada localmente (sin internet) para que vidrio y metal reflejen algo. */
function SceneEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

const VIEW_DIRS: Record<Exclude<LookView, 'actual'>, Vec3> = {
  frente: [0, 0.15, 1],
  atras: [0, 0.15, -1],
  izquierda: [-1, 0.15, 0],
  derecha: [1, 0.15, 0],
  arriba: [0, 1, 0.001],
  perspectiva: [1, 0.75, 1],
}

/** Le da al editor una función para sacar fotos de la escena (la usa la herramienta `look`). */
function CaptureBridge({ onReady }: { onReady: (fn: CaptureFn) => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    onReady((view) => {
      let cam = camera
      if (view !== 'actual') {
        const group = scene.getObjectByName(PARTS_GROUP)
        const box = group ? new Box3().setFromObject(group) : new Box3()
        const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3())
        const size = box.isEmpty() ? 2 : box.getSize(new Vector3()).length()
        const dir = new Vector3(...VIEW_DIRS[view]).normalize()
        const persp = (camera as PerspectiveCamera).clone()
        persp.position.copy(center).addScaledVector(dir, size * 1.3 + 1.5)
        persp.lookAt(center)
        persp.updateMatrixWorld()
        cam = persp
      }
      gl.render(scene, cam)
      const src = gl.domElement
      const k = Math.min(1, 1024 / Math.max(src.width, src.height))
      const out = document.createElement('canvas')
      out.width = Math.round(src.width * k)
      out.height = Math.round(src.height * k)
      out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height)
      return out.toDataURL('image/jpeg', 0.85)
    })
  }, [gl, scene, camera, onReady])
  return null
}
