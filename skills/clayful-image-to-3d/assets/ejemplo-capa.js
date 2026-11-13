// Ejemplo: capa prolija en anillos parejos (no usa el kit). Después: set_material tela + simulate soltar con pin "arriba" (queda abotonada al cuello).
// Capa prolija: malla en anillos parejos (sin serrucho en el ruedo), abierta adelante como en la referencia.
const Y0 = 0.655, Y1 = 0.24, R0 = 0.1, R1 = 0.32
const NU = 160, NV = 56, OVER = 0.32 // OVER: cuánto se cruzan los dos lados adelante (radianes)
const pos = [], uv = [], idx = []
for (let j = 0; j <= NV; j++) {
  const t = j / NV
  const y = Y0 - t * (Y0 - Y1)
  const r = R0 + (R1 - R0) * Math.pow(t, 0.8)
  for (let i = 0; i <= NU; i++) {
    const a = -OVER / 2 + (i / NU) * (2 * Math.PI + OVER)
    // El lado que cruza por encima va 1,5 cm más afuera.
    const outer = a > 2 * Math.PI - OVER / 2 ? Math.min(1, (a - (2 * Math.PI - OVER / 2)) / 0.08) : 0
    const rr = r + 0.015 * outer
    pos.push(rr * Math.sin(a), y, 0.92 * rr * Math.cos(a))
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
