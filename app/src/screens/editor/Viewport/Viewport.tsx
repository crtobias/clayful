import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, Outlines, TransformControls } from '@react-three/drei'
import { Box3, Object3D, PMREMGenerator, PerspectiveCamera, Vector3 } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getGeometry, getOriginalMaterial } from '@/domain/scene/geometry'
import type { Part, Vec3 } from '@/domain/scene/model'
import { buildMaterial, imageMaterial } from '@/domain/materials/buildMaterial'
import { t } from '@/shared/i18n/es'
import type { CaptureFn, LookView, Tool } from '../types'
import styles from './Viewport.module.scss'

interface Props {
  parts: Part[]
  selectedId: string | null
  tool: Tool
  onSelect: (id: string | null) => void
  onTransformStart: () => void
  onTransformEnd: (id: string, t: { position: Vec3; rotation: Vec3; scale: Vec3 }) => void
  onCaptureReady: (fn: CaptureFn) => void
}

const GIZMO_MODE = { mover: 'translate', girar: 'rotate', escalar: 'scale' } as const
const PARTS_GROUP = 'clayful-parts'

export function Viewport({ parts, selectedId, tool, onSelect, onTransformStart, onTransformEnd, onCaptureReady }: Props) {
  const [selected, setSelected] = useState<Object3D | null>(null)

  return (
    <section className={styles.viewport} aria-label="Vista 3D">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.5, 3.5, 6], fov: 40 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={['#e8eaee']} />
        <SceneEnvironment />
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 8, 5]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
        <Grid infiniteGrid cellSize={0.5} sectionSize={2.5} cellColor="#d3d7de" sectionColor="#c3c8d1" fadeDistance={40} />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={20} blur={2.4} far={6} />

        <group name={PARTS_GROUP}>
          {parts.map((part) => (
            <PartMesh key={part.id} part={part} selected={part.id === selectedId} onSelect={onSelect} meshRef={part.id === selectedId ? setSelected : undefined} />
          ))}
        </group>

        {selected && tool !== 'elegir' && selectedId && (
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
        <CaptureBridge onReady={onCaptureReady} />
      </Canvas>

      {parts.length === 0 && <p className={styles.empty}>{t.noParts}</p>}
      <p className={styles.hint}>{t.hint}</p>
    </section>
  )
}

interface PartMeshProps {
  part: Part
  selected: boolean
  onSelect: (id: string) => void
  meshRef?: (obj: Object3D | null) => void
}

function PartMesh({ part, selected, onSelect, meshRef }: PartMeshProps) {
  const geometry = getGeometry(part.geometryId)
  const material = useMemo(
    () => (part.image ? imageMaterial(part.image) : buildMaterial(part.material, getOriginalMaterial(part.geometryId))),
    [part.image, part.material, part.geometryId],
  )
  if (!geometry) return null
  return (
    <mesh
      ref={meshRef}
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
      {selected && <Outlines thickness={3} screenspace color="#5b4cf0" />}
    </mesh>
  )
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
