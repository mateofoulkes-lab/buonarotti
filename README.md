# Buonarotti

Sandbox web experimental para explorar un **robot escultor** controlable por software/modelos visuales.

## MVP actual

- Three.js 0.186.0, sin build obligatorio.
- Brazo robótico 3D con seguimiento visual del efector.
- Plato giratorio para la pieza.
- Bloque de material representado como **corteza voxel sparse**: el interior se considera macizo de forma implícita y sólo se mantienen activas las celdas expuestas.
- **Desbaste estrictamente de afuera hacia adentro**: cada operación sólo puede remover celdas que ya estaban expuestas antes de esa pasada. Nunca desaparece material detrás de una costra intacta.
- Tres herramientas con radios de corte distintos.
- Cuatro vistas: principal, cenital, lateral y cámara de muñeca.
- Control manual por sliders y teclado.
- Auto demo de desbaste.
- Objetivo analítico de prueba: esfera protegida.
- Loader de múltiples depthmaps y campo objetivo multi-vista conservador.
- API JS pública para futuros agentes/drivers.

## Arquitectura

- `src/sparse-shell.js`: material sparse y frontera superficial activa.
- `src/outside-in-planner.js`: regla de corte outside-in y protección del objetivo.
- `src/reference-views.js`: carga de depthmaps y metadatos de vistas.
- `src/target-field.js`: fusión conservadora de vistas y clasificación de material sobrante.
- `app.js`: escena, robot, cámaras, UI y API pública.

## Probar localmente

Como usa módulos ES, conviene servir la carpeta con un servidor HTTP simple. Por ejemplo:

```bash
python -m http.server 8000
```

Después abrir `http://localhost:8000`.

## Controles

- `A / D`: mover herramienta en X.
- `W / S`: mover en Z.
- `R / F`: mover en Y.
- `Espacio`: desbastar mientras se mantiene presionado.
- Sliders: posición XYZ y rotación del plato.
- `Auto demo`: ejecuta una trayectoria automática sencilla para probar remoción continua.

## Modos de objetivo

### Libre
Sólo aplica la regla outside-in. Sirve para comprobar que la fresa ya no puede abrir huecos internos antes de retirar la corteza exterior.

### Esfera de prueba
Protege una esfera interna y permite retirar únicamente material exterior a ella. La esfera celeste wireframe es una referencia visual para verificar el comportamiento del planner.

### Depthmaps
Acepta varios PNG. Si el nombre contiene un ángulo (`depth_90.png`) se usa ese valor; también reconoce `front/frente`, `right/derecha`, `back/atras/trasera`, `left/izquierda`. Si no hay ángulos en los nombres, las vistas se distribuyen uniformemente alrededor de 360°.

Contrato provisional para los depthmaps de prueba:

- PNG normalizado al mismo encuadre/cubo de la pieza.
- Transparencia = fuera de la silueta del objeto.
- Escala de grises: `0` = superficie más lejana, `1` = superficie más cercana a esa cámara.
- Por ahora las cámaras objetivo se consideran ortográficas y giran alrededor del eje Y.
- El planner requiere consenso entre vistas antes de considerar un voxel como material seguro de retirar.

## API del simulador

Disponible en `window.Buonarotti`:

```js
Buonarotti.moveToolTo(0.2, 1.5, 1.45)
Buonarotti.setTool('fine')
Buonarotti.rotateStock(30)
Buonarotti.carve()
Buonarotti.setTargetMode('sphere')
Buonarotti.getState()
Buonarotti.reset()
```

Herramientas actuales: `coarse`, `fine`, `needle`.

## Siguiente prueba

Generar un set pequeño de depthmaps sintéticos conocidos —por ejemplo una figura simple con frente, 72°, 144°, 216° y 288°— y verificar que:

1. ninguna pasada saltee la corteza exterior;
2. el consenso multi-vista no coma material objetivo;
3. al repetir pasadas la forma converja desde afuera hacia la superficie estimada;
4. las zonas ambiguas queden intactas hasta contar con evidencia suficiente.

Después de eso podemos reemplazar los depthmaps sintéticos por depthmaps estimados a partir de fotografías reales.
