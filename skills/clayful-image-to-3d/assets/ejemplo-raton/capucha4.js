// Cuello de capucha con corte en V adelante (los dos extremos bajan hacia el botón).
const torusY = (x, y, z, cx, cy, cz, R, r) => Math.hypot(Math.hypot(x - cx, z - cz) - R, y - cy) - r
const capucha = (x, y, z) => torusY(x, y - Math.max(0, -z) * 0.3, z, 0, 0.685, -0.005, 0.118, 0.036)
// V: se saca el frente; el corte es más ancho arriba que abajo.
const keep = (x, y, z) => !(z > 0 && Math.abs(Math.atan2(x, z)) < 0.1 + Math.max(0, y - 0.65) * 4)
const g = nets(capucha, [-0.2, 0.6, -0.17], [0.2, 0.78, 0.15], 0.005, keep)
return clayful.add(g, { name: 'Capucha', preset: 'tela', fabric: 'lana', color: '#93463f' })
