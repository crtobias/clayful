// Ratón con volumen en la cara: hocico que sobresale, boquita marcada y orejas cóncavas.
const MZ = [0, 0.762, 0.112], MR = [0.072, 0.052, 0.058]   // hocico
const muzzleZ = (x, y) => MZ[2] + MR[2] * Math.sqrt(Math.max(0, 1 - (x / MR[0]) ** 2 - ((y - MZ[1]) / MR[1]) ** 2))
const raton = (x, y, z) => {
  const ax = Math.abs(x)
  let d = sphere(x, y, z, 0, 0.82, 0, 0.16)
  d = smin(d, ellipsoid(x, y, z, ...MZ, ...MR), 0.035)
  d = smin(d, ellipsoid(x, y, z, 0, 0.44, 0, 0.17, 0.22, 0.13), 0.05)
  // Orejas: disco con una concavidad adelante.
  let ear = ellipsoid(ax, y, z, 0.135, 0.99, -0.01, 0.088, 0.093, 0.03)
  ear = sub(ear, ellipsoid(ax, y, z, 0.135, 0.985, 0.022, 0.062, 0.066, 0.024))
  d = smin(d, ear, 0.02)
  // Piernas, hombros y bracitos (bajo la capa).
  d = smin(d, capsule3(ax, y, z, 0.065, 0.3, 0, 0.065, 0.06, 0, 0.05, 0.045), 0.04)
  d = smin(d, capsule3(ax, y, z, 0.1, 0.6, 0, 0.16, 0.58, 0.01, 0.065, 0.055), 0.04)
  d = smin(d, capsule3(ax, y, z, 0.16, 0.58, 0.01, 0.21, 0.4, 0.05, 0.05, 0.042), 0.03)
  // Boca: una curvita hundida debajo de la nariz (dos arcos, como una "w" suave).
  for (const s of [-1, 1]) {
    const x0 = 0, x1 = s * 0.024, xm = s * 0.012
    const y0 = 0.768, y1 = 0.762, ym = 0.757
    d = sub(d, capsule3(x, y, z, x0, y0, muzzleZ(x0, y0), xm, ym, muzzleZ(xm, ym), 0.0045, 0.004))
    d = sub(d, capsule3(x, y, z, xm, ym, muzzleZ(xm, ym), x1, y1, muzzleZ(x1, y1), 0.004, 0.0035))
  }
  d = sub(d, capsule3(x, y, z, 0, 0.785, muzzleZ(0, 0.785), 0, 0.768, muzzleZ(0, 0.768), 0.0035, 0.0035))
  return d
}
const g = nets(raton, [-0.26, 0.03, -0.2], [0.26, 1.1, 0.2], 0.0045)
return { id: clayful.add(g, { name: 'Ratón', preset: 'arcilla', color: '#8c8c94' }), v: g.attributes.position.count }
