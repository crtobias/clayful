// Cola: cadena de cápsulas finas que sale de atrás y se curva.
const P = [[0, 0.3, -0.11], [0.0, 0.2, -0.26], [0.04, 0.1, -0.4], [0.13, 0.06, -0.52], [0.26, 0.08, -0.58], [0.36, 0.15, -0.56]]
const cola = (x, y, z) => {
  let d = 1e9
  for (let i = 0; i < P.length - 1; i++) {
    const r1 = 0.02 - i * 0.002, r2 = 0.02 - (i + 1) * 0.002
    d = smin(d, capsule3(x, y, z, ...P[i], ...P[i + 1], r1, r2), 0.01)
  }
  return d
}
const g = nets(cola, [-0.06, 0.02, -0.64], [0.42, 0.34, -0.06], 0.006)
return clayful.add(g, { name: 'Cola', preset: 'arcilla', color: '#b8b8bd' })
