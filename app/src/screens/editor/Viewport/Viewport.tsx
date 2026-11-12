import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, EdgesGeometry, Group, Mesh, Object3D, PMREMGenerator,
  PerspectiveCamera, Plane, Quaternion, Raycaster, Vector2, Vector3, type Intersection,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getGeometry, getOriginalMaterial } from '@/domain/scene/geometry'
import type { Part, Vec3 } from '@/domain/scene/model'
import { buildMaterial, imageMaterial } from '@/domain/materials/buildMaterial'
import { mirrorDab, moveGrab, sculptDab, startGrab, tipWeight, type Dab, type Grab, type SculptBrush } from '@/domain/sculpt/brushes'
import { mirrorPaint, paintDab, pickColor } from '@/domain/paint/paint'
import { refresh } from '@/shared/lib/meshOps'
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

      {parts.length === 0 && <p className={styles.empty}>{t.noParts}</p>}
      <p className={styles.hint}>{hint}</p>
    </section>
  )
}

interface PartMeshProps {
  part: Part
  showBox: boolean
  onSelect: (id: string) => void
  meshes: MutableRefObject<Map<string, Mesh>>
  onSelectedRef?: (obj: Object3D | null) => void
}

function PartMesh({ part, showBox, onSelect, meshes, onSelectedRef }: PartMeshProps) {
  const geometry = getGeometry(part.geometryId)
  const vertexColors = Boolean(geometry?.hasAttribute('color'))
  const material = useMemo(
    () => (part.image ? imageMaterial(part.image) : buildMaterial(part.material, getOriginalMaterial(part.geometryId), vertexColors)),
    [part.image, part.material, part.geometryId, vertexColors],
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

/** Esculpir y pintar: el cursor muestra la forma de la punta sobre la superficie y los trazos editan la malla. */
function StrokeController({ selectedId, mode, sculpt, paint, hooks, onSelect, meshes }: StrokeProps) {
  const { gl, camera, controls } = useThree()
  const cursor = useRef<Group>(null)
  const settings = useRef({ selectedId, mode, sculpt, paint, hooks, onSelect })
  useEffect(() => { settings.current = { selectedId, mode, sculpt, paint, hooks, onSelect } })

  const isPaint = mode === 'pintar'
  const texture = useMemo(
    () => cursorTexture(isPaint ? { kind: 'paint', softness: paint.softness, color: paint.tool === 'goma' ? '#ffffff' : paint.color } : { kind: 'sculpt', tip: sculpt.tip, angle: sculpt.angle }),
    [isPaint, paint.softness, paint.color, paint.tool, sculpt.tip, sculpt.angle],
  )
  useEffect(() => () => texture.dispose(), [texture])
  const arrowSign = !isPaint && ['sumar', 'inflar'].includes(sculpt.brush) ? 1 : !isPaint && ['quitar', 'cortar'].includes(sculpt.brush) ? -1 : 0

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const orbit = controls as unknown as { enabled: boolean } | null

    let stroke: null | {
      mesh: Mesh
      geometry: BufferGeometry
      last: Vector3 | null
      /** Última posición del puntero en pantalla (para rellenar huecos si el mouse va rápido). */
      x: number
      y: number
      grab?: Grab
      plane?: Plane
      startLocal?: Vector3
    } = null

    const castAt = (x: number, y: number): Intersection | undefined => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects([...meshes.current.values()], false)[0]
    }
    const cast = (e: PointerEvent) => castAt(e.clientX, e.clientY)

    const localHit = (mesh: Mesh, hit: Intersection) => {
      const center = mesh.worldToLocal(hit.point.clone())
      const g = mesh.geometry
      const nor = g.attributes.normal
      const f = hit.face!
      const normal = new Vector3(
        nor.getX(f.a) + nor.getX(f.b) + nor.getX(f.c),
        nor.getY(f.a) + nor.getY(f.b) + nor.getY(f.c),
        nor.getZ(f.a) + nor.getZ(f.b) + nor.getZ(f.c),
      ).normalize()
      const scale = (Math.abs(mesh.scale.x) + Math.abs(mesh.scale.y) + Math.abs(mesh.scale.z)) / 3 || 1
      return { center, normal, scale }
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
      const r = s.mode === 'pintar' ? s.paint.size : s.sculpt.size
      c.scale.setScalar(r)
    }

    const dab = (mesh: Mesh, hit: Intersection, e: PointerEvent) => {
      const s = settings.current
      const g = stroke!.geometry
      const { center, normal, scale } = localHit(mesh, hit)
      if (s.mode === 'esculpir') {
        let brush: SculptBrush = s.sculpt.brush
        if (e.shiftKey) brush = 'suavizar'
        else if (e.altKey) brush = brush === 'sumar' ? 'quitar' : brush === 'quitar' || brush === 'cortar' ? 'sumar' : brush
        if (brush === 'arrastrar') return
        const d: Dab = { center, normal, radius: s.sculpt.size / scale, strength: s.sculpt.strength, tip: s.sculpt.tip, angle: s.sculpt.angle }
        sculptDab(g, brush, d)
        const m = s.sculpt.mirror ? mirrorDab(d) : null
        if (m) sculptDab(g, brush, m)
        refresh(g, true, false)
      } else {
        const d = { center, normal, radius: s.paint.size / scale, color: s.paint.tool === 'goma' ? '#ffffff' : s.paint.color, softness: s.paint.softness, opacity: 0.75 }
        paintDab(g, d)
        const m = s.paint.mirror ? mirrorPaint(d) : null
        if (m) paintDab(g, m)
        refresh(g, false, true)
      }
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

      const geometry = s.hooks.onStrokeStart(partId)
      if (!geometry) return
      mesh.geometry = geometry // la versión nueva se ve ya, sin esperar a React
      if (orbit) orbit.enabled = false
      el.setPointerCapture(e.pointerId)
      stroke = { mesh, geometry, last: hit.point.clone(), x: e.clientX, y: e.clientY }
      if (s.mode === 'esculpir' && s.sculpt.brush === 'arrastrar') {
        const { center, normal, scale } = localHit(mesh, hit)
        stroke.grab = startGrab(geometry, { center, normal, radius: s.sculpt.size / scale, strength: 1, tip: s.sculpt.tip, angle: s.sculpt.angle })
        stroke.plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()).negate(), hit.point)
        stroke.startLocal = center
      } else {
        dab(mesh, hit, e)
      }
    }

    const move = (e: PointerEvent) => {
      const hit = cast(e)
      showCursor(hit)
      if (!stroke) return
      const s = settings.current
      if (stroke.grab && stroke.plane && stroke.startLocal) {
        const r = el.getBoundingClientRect()
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        const p = raycaster.ray.intersectPlane(stroke.plane, new Vector3())
        if (!p) return
        const delta = stroke.mesh.worldToLocal(p).sub(stroke.startLocal)
        moveGrab(stroke.geometry, stroke.grab, delta)
        refresh(stroke.geometry, true, false)
        return
      }
      const spacing = (s.mode === 'pintar' ? s.paint.size : s.sculpt.size) * 0.25
      // Recorre el tramo en pantalla de a 6 px para que el trazo no quede punteado.
      const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y) / 6))
      for (let i = 1; i <= steps; i++) {
        const h = i === steps ? hit : castAt(stroke.x + ((e.clientX - stroke.x) * i) / steps, stroke.y + ((e.clientY - stroke.y) * i) / steps)
        if (!h || h.object !== stroke.mesh) continue
        if (stroke.last && stroke.last.distanceTo(h.point) < spacing) continue
        stroke.last = h.point.clone()
        dab(stroke.mesh, h, e)
      }
      stroke.x = e.clientX
      stroke.y = e.clientY
    }

    const up = (e: PointerEvent) => {
      if (orbit) orbit.enabled = true
      if (!stroke) return
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      stroke = null
    }

    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
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

type CursorKind = { kind: 'sculpt'; tip: Parameters<typeof tipWeight>[0]; angle: number } | { kind: 'paint'; softness: number; color: string }

/** Textura del cursor: la forma real de la punta (la misma función que usa el pincel) con su caída. */
function cursorTexture(k: CursorKind): CanvasTexture {
  const N = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(N, N)
  const tint = k.kind === 'paint' ? hexToRgb(k.color) : hexToRgb(ACCENT)
  const line = k.kind === 'paint' ? [22, 24, 29] : [58, 46, 196]
  const a = k.kind === 'sculpt' ? (k.angle * Math.PI) / 180 : 0
  const weight = (px: number, py: number) => {
    if (k.kind === 'paint') {
      const d = Math.hypot(px, py)
      const inner = 1 - Math.max(0.02, k.softness)
      return d >= 1 ? 0 : d <= inner ? 1 : 1 - (d - inner) / (1 - inner)
    }
    const du = px * Math.cos(a) + py * Math.sin(a), dv = -px * Math.sin(a) + py * Math.cos(a)
    return tipWeight(k.tip, du, dv, 0, 1)
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1, py = -(((y + 0.5) / N) * 2 - 1)
      const w = weight(px, py)
      // Borde: donde el peso cae a cero (para ver exactamente hasta dónde llega).
      const step = 2 / N
      const edge = w > 0 && (weight(px + step, py) === 0 || weight(px - step, py) === 0 || weight(px, py + step) === 0 || weight(px, py - step) === 0)
      const i = (y * N + x) * 4
      if (edge) { img.data[i] = line[0]; img.data[i + 1] = line[1]; img.data[i + 2] = line[2]; img.data[i + 3] = 230; continue }
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
