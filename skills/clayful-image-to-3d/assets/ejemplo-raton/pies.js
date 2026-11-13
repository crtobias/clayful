// Medias blancas (como las botitas del dibujo) y zapatos básicos con suela plana.
const medias = (x, y, z) => capsule3(Math.abs(x), y, z, 0.065, 0.19, 0.005, 0.065, 0.06, 0.012, 0.056, 0.058)
const zapato = (x, y, z) => {
  const ax = Math.abs(x)
  let d = smin(ellipsoid(ax, y, z, 0.066, 0.045, 0.035, 0.06, 0.042, 0.092), capsule3(ax, y, z, 0.066, 0.05, 0.0, 0.066, 0.075, 0.0, 0.058, 0.058), 0.03)
  return Math.max(d, -y)   // suela plana en el piso
}
const m = clayful.add(nets(medias, [-0.14, 0.03, -0.08], [0.14, 0.26, 0.1], 0.005), { name: 'Medias', preset: 'arcilla', color: '#f2efe9' })
const z = clayful.add(nets(zapato, [-0.15, -0.01, -0.09], [0.15, 0.14, 0.15], 0.004), { name: 'Zapatos', preset: 'plastico', color: '#5b3a2b', amount: 0.35 })
return [m, z]
