---
name: clayful-image-to-3d
description: Armar un modelo 3D en Clayful (por su MCP) a partir de imágenes de referencia o de una descripción, por fases con evidencia (capturas con look comparadas contra la referencia). Personajes, criaturas, ropa, muebles, props, cortinas, banderas, comida. Usala cuando el usuario quiera un modelo hecho en Clayful, o cuando pida un modelo y estén disponibles las herramientas mcp__clayful__*. Regla clave: toda tela (ropa, cortinas, banderas, manteles, capas, sábanas, almohadones, bolsas, toldos) se hace con el material Tela y la física de Clayful, nunca con pliegues hechos a mano.
license: MIT
---

# Clayful: de imagen a 3D

Versión para Clayful de `blender-image-to-3d`: mismo método (medir, silueta antes que detalle, evidencia en cada etapa), con las herramientas de Clayful en vez de Python en Blender.

Clayful trabaja en **metros, Y arriba, piso en y = 0, el frente mira a +Z**.

## Herramientas

| Para qué | Herramienta |
|---|---|
| Ver la escena | `scene_info`, `look` (frente, atras, izquierda, derecha, arriba, perspectiva) |
| Formas básicas | `add_shape`, `transform`, `duplicate`, `rename`, `delete` |
| Formas a medida | `run_code` con el kit `assets/sdf-kit.js` (formas que se funden en **una sola malla**) |
| Material de un clic | `set_material` (arcilla, tela + tipo, gelatina, vidrio, metal, madera, plastico) |
| Esculpir | `sculpt_stroke` (sumar, quitar, arcilla, capa, aplanar, suavizar, inflar, pellizcar, pliegue, arrastrar, gancho, cortar, mascara), `mask`, `add_detail` |
| Pintar | `paint_stroke`, `paint_gradient`, `fill_color` |
| **Física** | `simulate`: `soltar` (la pieza se vuelve tela y cae), `tapar` (cae una tela nueva encima), `gelatina` |
| Estilo | `set_low_poly` con `detail` 0 (muy facetado) a 1 (casi liso) |
| Entregar | `export_glb` |

Todo se deshace con `undo`.

## Regla de oro: las telas se hacen con la física

**Ropa, cortinas, banderas, manteles, capas, sábanas, almohadones, bolsas, toldos, ponchos, bufandas, velas de barco y todo lo que sea de tela usa SIEMPRE el material Tela y la física de Clayful.**

- No hagas los pliegues a mano ni con pinceles: los arma la física. Los pinceles van **después** de la simulación y solo para retocar.
- Elegí el tipo de tela según la referencia. Cada tipo trae su rigidez:
  - algodón: remeras, sábanas
  - jean: pantalones, camperas
  - lana: suéteres, bufandas
  - punto: tejidos gruesos
  - seda: pañuelos, vestidos livianos
  - raso: cortinas brillantes, vestidos de fiesta
  - terciopelo: cortinas de teatro, capas reales
  - arpillera: bolsas, sacos
  - cuero: camperas de cuero, delantales
- Cómo se hace cada caso:

| Caso | Cómo |
|---|---|
| Ropa puesta (remera, pantalón, vestido, capa) | 1) El cuerpo o maniquí como pieza propia. 2) La prenda como **una sola capa abierta** (ruedo, cuello, puños como agujeros), 2–3 cm más grande que el cuerpo, con el kit. 3) `set_material` tela + tipo. 4) `simulate` `soltar` (densidad 60–90). La prenda cae y se apoya en hombros y caderas. |
| Cortina, bandera, cartel colgado | Un `plano` vertical del tamaño de la tela → tela → `simulate` `soltar` con `pin: "arriba"` (el borde de arriba queda fijo y el resto cuelga). |
| Mantel, sábana, tela sobre algo | `simulate` `tapar` sobre el objeto, con `size` para el tamaño de la tela. |
| Almohadón, puf, bolsa cerrada | Forma cerrada con tela → `soltar`: cae y queda como almohadón arrugado (conserva algo de aire). |
| Algo blando que rebota (slime, flan) | Material `gelatina` (amount = dureza) → `simulate` `gelatina`. |

- Si la tela queda muy rígida o muy blanda, repetí `soltar` con otro `stiffness` (0 = seda, 1 = cuero). Siempre arranca de la forma original.
- La gravedad (`gravity` 0–3) compite con la rigidez: más gravedad dobla más.
- **Prolijidad:** para capas, faldas, cortinas y todo lo que tenga un borde a la vista, armá la tela como una **grilla en anillos parejos** (`assets/ejemplo-capa.js`) en vez de con `nets`: el ruedo sale derecho, sin serrucho, y la física queda pareja.
- **Capas y ponchos:** que los dos lados se crucen adelante (uno 1–2 cm más afuera) y simulá con `pin: "arriba"`: el cuello queda abotonado y el resto cae. Poné hombros o brazos debajo para que la capa se abra en A.
- Para la ropa, una prenda que atraviesa el cuerpo sale mal: dejá 2–3 cm de holgura y alineá las mangas al eje del brazo. Mirá `assets/ejemplo-maniqui.js` y `assets/ejemplo-remera.js`.

## Regla del pelo: hebras con física

**Pelo, pelaje, melenas, barbas, flequillos, colas peludas y bigotes se hacen con la herramienta `hair`, no esculpidos.**

- Son hebras de verdad: la raíz queda pegada a la piel, caen con la gravedad y chocan con la parte, igual que la tela.
- Quedan en una parte aparte, "Pelo de …", que sigue a la parte cuando la movés.
- **Largo:**
  - 0,3–1 cm: pelaje de rata o ratón;
  - 2–8 cm: pelo corto o animal de peluche;
  - 20–80 cm: melena que cae.
- **Rigidez:**
  - 0,7–0,9: pelaje parado;
  - 0,1–0,3: pelo que cae.
- **Densidad:**
  - 2–4 hebras/cm² para melenas (más es lento);
  - 4–8 para pelaje corto.
- Orden: primero la forma y la pintura de la piel, después `hair` `crecer` (sin `points` = toda la parte; con `points` + `radius` = solo esa zona: cabeza, cola, cejas). Después `peinar` (con `comb`), `recortar` o `borrar` para dar forma, y `caer` si moviste o giraste la parte.
- **Para juegos (low poly):** al final, `hair` `mechones` con `clump` 0,01–0,03 m (o `set_low_poly` sobre la parte "Pelo de …": la barra decide el tamaño de los mechones). Las hebras se juntan en mechones facetados y bajan de cientos de miles de triángulos a unos miles; `clump: 0` las vuelve a soltar. Con `points` se hace solo en una zona.
- Para la cabeza de un personaje: hacé crecer en la parte de arriba y atrás, no en la cara, y recortá el flequillo.
- En la app: modo Esculpir → pinceles Pelo, Peinar, Recortar, Mechones y Borrar pelo, con Largo, Densidad, Grosor, Rigidez y Color. El panel muestra los triángulos.

## Ejemplo de referencia para ropa

Antes de hacer ropa, mirá el **Ratón con capa** (de crtobias), que viene en la Biblioteca de Clayful:
- `library_list` muestra los modelos y `library_add` con id `raton-con-capa` lo pone en la escena, para mirarlo con `look`.
- El código paso a paso está en `assets/ejemplo-raton/`. Orden: `cuerpo2` → `ojos` → `pies` → `cola` → `capa4` (soltar con `pin: "arriba"`, densidad 95, rigidez 0,5) → `capucha4` (soltar) → `boton2`.
- Qué copiar:
  - el cuerpo va debajo, con hombros y brazos, para que la tela se apoye;
  - la prenda es una grilla de anillos parejos;
  - la abertura crece hacia el ruedo;
  - se fija arriba;
  - los detalles (botón, cuello) van después de simular.

Si el usuario guardó modelos propios ("Mis modelos"), también aparecen en `library_list`: usalos como punto de partida cuando pida algo parecido.

## Fases

Cada fase termina con un **control**:
1. `look` desde frente, izquierda y perspectiva (y desde la cámara de la referencia, si se puede).
2. Comparar contra la referencia y anotar las diferencias **en números**: "cabeza 15% más alta", "brazos 4 cm cortos". Para medir, usá `scene_info` y `run_code` con el `boundingBox`.
3. Corregir y repetir hasta que no queden diferencias grandes.
4. Mostrarle al usuario la captura, lo que falta y lo que se inventó (lo que la referencia no mostraba).

### 0. Leer la referencia

Antes de tocar nada, escribí un brief corto:
- qué es;
- su tamaño real, en metros;
- 6 a 10 proporciones medidas en la imagen (cabezas de alto, ancho de hombros contra alto…);
- las partes, en orden de construcción, y **cuáles son de tela**;
- el material de cada parte;
- qué se infiere porque no se ve.

Preguntá solo lo que la imagen no dice (tamaño real si no hay escala, estilo low poly o liso). Si el usuario dice "dale", seguí con valores por defecto: tamaño realista, liso.

### 1. Bloqueo y silueta

- Masas grandes nada más. Un personaje lleva torso, cabeza, cadera y extremidades; un mueble, su caja y sus patas.
- Con `run_code` y el kit, fundí las formas con `smin` para que cada pieza quede como **una sola malla**.
- Separá en partes lo que tiene otro material o se mueve aparte: ojos, ropa, accesorios.
- Control: la silueta tiene que leerse en gris (arcilla) desde frente y de costado.

### 2. Formas

- Primero las formas secundarias: músculos grandes, volúmenes de pelo, cortes de paneles.
- Después el detalle, con `sculpt_stroke` y `symmetry` x para que quede parejo.
- No agregues detalle chico hasta que la silueta esté bien.

### 3. Telas

Aplicá la regla de oro de arriba. La ropa va **sobre** el cuerpo terminado de la fase 2.

### 4. Materiales y pintura

- `set_material` por parte.
- Pintá después de simular la tela, porque la pintura viaja con la malla.
- `paint_gradient` para degradados; `fill_color` para pintar una parte entera de un color.

### 5. Estilo (opcional)

- `set_low_poly` con `detail` 0.2–0.6 para un look de juego low poly.
- Con poco detalle se mezclan los colores pintados chicos: subí el detalle si se pierde un logo.

### 6. Entrega

- `export_glb` con la ruta que pida el usuario.
- Decí qué partes son tela simulada, qué se infirió y qué quedó fuera de tolerancia.

## Lecciones

- Pintar con `paint_stroke`: el punto tiene que estar **sobre** la superficie (calculalo: en una esfera de radio r, z = √(r² − x² − y²)). Si queda unos milímetros afuera, casi no pinta.
- Si una pieza se ve "de vidrio" (desde adelante se ve el interior de atrás), sus caras miran hacia adentro: dalas vuelta con `clayful.edit(parte, g => { intercambiar índices 1 y 2 de cada triángulo })`. El kit ya genera las caras hacia afuera.
- Cara con profundidad (mejor que solo pintada): hocico como elipsoide fundido con `smin`; boca hundida con `sub` de cápsulas finas sobre la superficie del hocico; orejas cóncavas restando un elipsoide adelante; **ojos y nariz como piezas aparte** de plástico brillante, apenas metidas en la cabeza. Después pintá el blanco del hocico y el rosado de las orejas.
- Pies: zapatos básicos = elipsoide alargado hacia adelante + `Math.max(d, -y)` para la suela plana.
- Ejemplo completo de personaje (ratón con capa): `assets/ejemplo-raton/` — orden: cuerpo2, ojos, pies, cola, capa4 (+ soltar con pin arriba), capucha4 (+ soltar), boton2.

## Reglas de trabajo

- Medí y después modelá. Cada número sale del brief o se marca como inferido.
- Silueta antes que forma, forma antes que detalle, tela simulada antes que pintura.
- La evidencia es `look`, no suponer que quedó bien.
- `run_code` corre en la ventana del usuario: no dejes bucles largos. Si una forma tarda, subí `H` (celda) en `nets`.
- Las simulaciones tardan entre 5 y 30 segundos. Avisá antes de correr varias.
