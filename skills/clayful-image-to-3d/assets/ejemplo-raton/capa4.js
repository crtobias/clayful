// Capa abierta adelante: los bordes se tocan arriba (en el botón) y se separan hacia el ruedo.
const Y0 = 0.655, Y1 = 0.24, R0 = 0.1, R1 = 0.32
const NU = 160, NV = 56
const pos = [], uv = [], idx = []
for (let j = 0; j <= NV; j++) {
  const t = j / NV
  const y = Y0 - t * (Y0 - Y1)
  const r = R0 + (R1 - R0) * Math.pow(t, 0.8)
  // Cerrada arriba (los bordes se tocan donde va el botón) y abierta hacia el ruedo.
  const gap = 0.004 + 0.15 * Math.pow(Math.max(0, t - 0.12) / 0.88, 1.3)
  for (let i = 0; i <= NU; i++) {
    const a = gap + (i / NU) * (2 * Math.PI - 2 * gap)
    pos.push(r * Math.sin(a), y, 0.92 * r * Math.cos(a))
    uv.push(a * r, y)
  }
}
const W = NU + 1
for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
  const a = j * W + i, b = a + 1, c = a + W, d = c + 1
  idx.push(a, c, b, b, c, d)
}
const g = new THREE.BufferGeometry()
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
g.setIndex(idx)
g.computeVertexNormals()
return clayful.add(g, { name: 'Capa', preset: 'tela', fabric: 'lana', color: '#93463f' })
