// Ojos y nariz: piezas aparte, con brillo, apenas metidas en la cabeza.
const ojos = (x, y, z) => ellipsoid(Math.abs(x), y, z, 0.063, 0.836, 0.142, 0.016, 0.021, 0.012)
const nariz = (x, y, z) => ellipsoid(x, y, z, 0, 0.79, 0.168, 0.017, 0.013, 0.012)
const a = clayful.add(nets(ojos, [-0.1, 0.8, 0.11], [0.1, 0.87, 0.17], 0.0025), { name: 'Ojos', preset: 'plastico', color: '#121111', amount: 0.85 })
const b = clayful.add(nets(nariz, [-0.03, 0.77, 0.14], [0.03, 0.81, 0.19], 0.002), { name: 'Nariz', preset: 'plastico', color: '#3b2622', amount: 0.7 })
return [a, b]
