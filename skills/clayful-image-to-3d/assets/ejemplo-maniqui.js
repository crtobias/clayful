// Ejemplo: pegá sdf-kit.js antes de este código. Agrega el maniquí sobre el que cae la ropa.
// Maniquí: torso, cuello, cabeza y brazos fundidos en una sola forma cerrada.
const man = (x, y, z) => {
  let d = roundBox(x, y - 0.6, z, 0.16, 0.3, 0.03, 0.12)
  d = smin(d, capsule(x, y, z, 0, 0.95, 0, 1.12, 0.065, 0.06), 0.04)
  d = smin(d, Math.hypot(x, y - 1.22, z) - 0.11, 0.03)
  d = smin(d, capsule(Math.abs(x), y, z, 0.24, 0.9, 0.5, 0.62, 0.075, 0.06), 0.05)
  return d
}
const g = nets(man, [-0.62, 0.12, -0.22], [0.62, 1.38, 0.22], 0.014)
const id = clayful.add(g, { name: 'Maniquí', preset: 'plastico', color: '#d3d7de' })
return { id, v: g.attributes.position.count }
