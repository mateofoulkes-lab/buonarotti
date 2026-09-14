# Buonarotti

Sandbox web experimental para explorar un **robot escultor** controlable por software/modelos visuales.

## MVP actual

- Three.js 0.186.0, sin build obligatorio.
- Brazo robótico 3D con seguimiento visual del efector.
- Plato giratorio para la pieza.
- Bloque de material representado como **corteza voxel sparse**: el interior se considera macizo de forma implícita y sólo se mantienen activas las celdas expuestas.
- Al remover material, las celdas internas vecinas pasan a ser la nueva superficie.
- Tres herramientas con radios de corte distintos.
- Cuatro vistas: principal, cenital, lateral y cámara de muñeca.
- Control manual por sliders y teclado.
- Auto demo de desbaste.
- API JS pública para futuros agentes/drivers.

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

## API del simulador

Disponible en `window.Buonarotti`:

```js
Buonarotti.moveToolTo(0.2, 1.5, 1.45)
Buonarotti.setTool('fine')
Buonarotti.rotateStock(30)
Buonarotti.carve()
Buonarotti.getState()
Buonarotti.reset()
```

Herramientas actuales: `coarse`, `fine`, `needle`.

## Próximos pasos

1. Separar `RobotDriver` del simulador para que el mismo protocolo pueda controlar un brazo real.
2. Agregar orientación completa del efector y cinemática inversa real.
3. Evolucionar la superficie voxel a chunks y/o marching cubes para una piel suave.
4. Permitir cargar un GLB/STL objetivo y calcular error geométrico contra la pieza actual.
5. Exponer capturas de las cámaras virtuales para un loop visual de agente: observar → decidir → cortar → volver a observar.
6. Incorporar herramientas no destructivas (pincel, marcador, sonda) además de las de desbaste.
