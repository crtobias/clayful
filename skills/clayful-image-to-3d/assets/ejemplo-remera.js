// Ejemplo: pegá sdf-kit.js antes. Remera de UNA capa, 2–3 cm más grande que el maniquí; después: simulate soltar.
// Remera ajustada: 2–3 cm más grande que el maniquí, mangas cortas y finas.
const SA = [0.24, 0.9], SB = [0.41, 0.718]  // sobre el eje del brazo del maniquí
const LEN = Math.hypot(SB[0] - SA[0], SB[1] - SA[1])
const dir = (() => { const dx = SB[0] - SA[0], dy = SB[1] - SA[1], l = Math.hypot(dx, dy); return [dx / l, dy / l] })()
const tee = (x, y, z) => {
  const d = roundBox(x, y - 0.64, z, 0.15, 0.28, 0.025, 0.15)
  return smin(d, capsule(Math.abs(x), y, z, SA[0], SA[1], SB[0], SB[1], 0.092, 0.078), 0.07)
}
const keep = (x, y, z) => {
  if (y < 0.3) return false                                     // ruedo
  if (Math.hypot(x, z - 0.015) < 0.1 && y > 0.95) return false  // cuello
  // Puños: solo la punta de cada manga (cerca de su eje), así la axila queda unida al torso.
  const px = Math.abs(x) - SA[0], py = y - SA[1]
  const t = px * dir[0] + py * dir[1]
  const off = Math.hypot(px - dir[0] * t, py - dir[1] * t, z)
  if (t > LEN - 0.01 && off < 0.14) return false
  return true
}
const g = nets(tee, [-0.62, 0.2, -0.26], [0.62, 1.12, 0.26], 0.009, keep)
const id = clayful.add(g, { name: 'Remera', preset: 'tela', fabric: 'algodon', color: '#c8303a' })
return { id, v: g.attributes.position.count }
