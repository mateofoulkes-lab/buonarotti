# Buonarotti

Sandbox web experimental para explorar un **robot escultor** controlable por software/modelos visuales.

## Estado actual

- Three.js 0.186.0, sin build obligatorio.
- Brazo robótico 3D, plato giratorio y cuatro cámaras virtuales.
- Material como **corteza voxel sparse** con interior implícito.
- Regla global estricta **outside-in**: una capa removible completa queda bloqueada como frente actual y no se habilita la siguiente hasta agotarla. Esto aplica tanto al automático como al manual y evita perforaciones, costras y columnas exteriores olvidadas.
- Escultor automático que recorre el frente removible hasta que no queda material seguro.
- Tres herramientas: gruesa, fina y detalle.
- Desbaste manual momentáneo y modo enclavado `Desbaste fijo`.
- Velocidades x1, x4, x8 y x16.
- Tres presets de stock: cubo 3×3×3, alto 2.5×4×2.5 y chato 4×2×4.
- Objetivo analítico de esfera para pruebas.
- Loader de múltiples depthmaps y campo objetivo multi-vista conservador.
- API JS pública para futuros agentes/drivers.

## Arquitectura

- `src/sparse-shell.js`: stock sparse rectangular y frontera superficial.
- `src/outside-in-planner.js`: bloqueo de capas globales y protección del objetivo.
- `src/auto-sculptor.js`: recorrido automático de una corteza completa por pasada.
- `src/reference-views.js`: carga de depthmaps y metadatos de vistas.
- `src/target-field.js`: fusión conservadora de vistas y clasificación de material sobrante.
- `app.js`: escena, robot, cámaras, UI y API pública.

## Probar localmente

```bash
python -m http.server 8000
```

Después abrir `http://localhost:8000`.

## Escultura automática

1. Elegir `Esfera de prueba` o `Depthmaps`.
2. Si se usan depthmaps, cargarlos primero.
3. Elegir bloque, herramienta y velocidad.
4. Pulsar **Comenzar escultura**.
5. El sistema agota la corteza removible actual antes de comenzar la siguiente.
6. Se detiene solo cuando no queda material que el objetivo considere seguro retirar.

El botón cambia a **Detener escultura** mientras está activo. La UI muestra número de pasada y cantidad de voxeles pendientes en el frente actual.

## Manual

- `A / D`: mover herramienta en X.
- `W / S`: mover en Z.
- `R / F`: mover en Y.
- `Espacio` o mantener `Desbastar`: corte momentáneo.
- `Desbaste fijo`: deja la herramienta encendida mientras se mueve manualmente.

Incluso en manual, mantener la herramienta quieta no permite taladrar sucesivas capas en un solo punto: mientras quede material removible en la corteza global actual, el interior permanece bloqueado.

## Depthmaps

Acepta varios PNG. Si el nombre contiene un ángulo (`depth_90.png`) se usa ese valor; también reconoce `front/frente`, `right/derecha`, `back/atras/trasera`, `left/izquierda`. Si no hay ángulos en los nombres, las vistas se distribuyen uniformemente alrededor de 360°.

Contrato provisional:

- PNG normalizado al encuadre completo del bloque elegido.
- Transparencia = fuera de la silueta del objeto.
- Escala de grises: `0` = superficie más lejana, `1` = superficie más cercana a esa cámara.
- Cámaras objetivo ortográficas alrededor del eje Y.
- El planner exige consenso entre vistas antes de retirar material.
- Los presets rectangulares ajustan automáticamente el volumen ortográfico usado para interpretar cada vista.

## API

Disponible en `window.Buonarotti`:

```js
Buonarotti.setTargetMode('sphere')
Buonarotti.setBlockPreset('tall')
Buonarotti.setSpeed(8)
Buonarotti.startSculpt()
Buonarotti.stopSculpt()
Buonarotti.setCarveLatched(true)
Buonarotti.moveToolTo(0.2, 1.5, 1.45)
Buonarotti.setTool('fine')
Buonarotti.rotateStock(30)
Buonarotti.carve()
Buonarotti.getState()
Buonarotti.reset()
```

Herramientas actuales: `coarse`, `fine`, `needle`.

## Próxima prueba

Generar 5 depthmaps sintéticos conocidos —por ejemplo 0°, 72°, 144°, 216° y 288°— y comprobar que la figura converge desde el exterior sin columnas residuales ni perforaciones internas. Después pasamos a depthmaps estimados desde fotografías reales.
