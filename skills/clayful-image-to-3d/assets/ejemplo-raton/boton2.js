// Botón: donde se juntan las puntas de la capucha y los bordes de la capa, arriba al frente.
const cape = clayful.part('Capa'), g = clayful.geometry('Capa')
const p = g.attributes.position, n = g.attributes.normal
let best = -1, bz = -1e9
for (let i = 0; i < p.count; i++) {
  const y = p.getY(i) + cape.position[1], x = p.getX(i) + cape.position[0]
  if (y < 0.615 || y > 0.645 || Math.abs(x) > 0.02) continue
  const z = p.getZ(i) + cape.position[2]
  if (z > bz) { bz = z; best = i }
}
const at = [p.getX(best) + cape.position[0], p.getY(best) + cape.position[1], p.getZ(best) + cape.position[2]]
const bot = new THREE.SphereGeometry(0.02, 20, 12)
bot.scale(1, 1, 0.45)
return clayful.add(bot, { name: 'Botón', position: [at[0], at[1], at[2] + 0.008], preset: 'plastico', color: '#4a2c22' })
