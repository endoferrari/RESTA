# RESTA — Contexto del proyecto

Punto de venta para **ONCE Social Lounge** (bar restaurante).
Se está reconstruyendo desde cero en `v2/`. La versión vieja (`RESTA.html`)
sigue en producción y **no se toca**.

---

## Con quién estás trabajando

**Rosendo no es programador.** Trabaja por vibecoding: tiene ideas y
necesidades del negocio, no conocimientos técnicos.

- **Responde siempre en español.**
- Explica las decisiones por su **consecuencia práctica en el bar**
  ("si se va la luz, pasa X"), no por su nombre técnico.
- No des por hecho que puede depurar un error. Si algo falla, dale el
  comando exacto y qué debe salir.
- Cada bloque de trabajo debe terminar en **algo que él pueda comprobar a
  simple vista**, no en "confía en mí, ya casi".
- No le pidas que elija entre opciones técnicas sin explicarle el costo
  de cada una en términos del negocio.

---

## Estado actual

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Esqueleto: servidor, base de datos, migraciones, diagnóstico | ✅ hecho |
| 1 | Menú, familias, importador de datos de la v1.3.0 | ✅ hecho — la carta real de ONCE ya está adentro |
| 2 | Núcleo de dinero: cortesías, descuentos, propinas, división | ✅ hecho |
| 3 | Mesas y cuentas en vivo, PIN de mesero | ✅ hecho |
| 4 | Cobro completo (efectivo, tarjeta, mixto, parciales) | ✅ hecho |
| 5 | Impresión ESC/POS configurable | ✅ hecho — con logo |
| 6 | Corte del día, turnos, respaldos automáticos | ✅ hecho |
| 7 | Empaquetado final e instalador | ⬜ siguiente |

El plan completo está en `PROPUESTA-RESTA-v2.md`.

**Lo siguiente: Fase 7 (instalador y empaquetado).**

⚠️ **Pendientes que faltan para dar la v2 por terminada:**

1. ~~El actualizador desde GitHub~~ ✅ **hecho, y mejor que el de la v1**:
   RESTA se baja su propio instalador (`servidor/actualizaciones.js`), le
   comprueba el tamaño y la huella sha256 que publica GitHub, y con un botón
   se cierra y lo abre. **No usa el navegador**: el 25-ago-2026 desapareció
   Chrome de la laptop del bar, Windows se quedó sin saber con qué abrir un
   enlace, y el botón viejo —que era un `<a target="_blank">`— dejó de hacer
   absolutamente nada, sin error ni aviso.
2. **La lista de «lo vendido hoy» con cantidades**, que Rosendo pidió.
   El servidor ya la calcula —`vendidoHoy()` en `datos/repos/almacen.js`,
   ruta `GET /api/almacen/vendido`, y `api.vendidoHoy()` en el cliente—
   pero **ninguna pantalla la enseña**. Es código muerto.

✅ **El logo del ticket YA sale** (comprobado el 29-jul-2026). Se convierte a
puntos en el NAVEGADOR con canvas —Node no puede dibujar— una sola vez desde
`cliente/js/logo-once.js`, se guarda en `ajustes.ticket_logo_raster` y de ahí
va en los bytes de la térmica como `GS v 0`: 72 bytes de ancho × 161 de alto.

✅ **La fase 7 ya está armada a medias:** existen `escritorio/principal.js`,
`escritorio/instalador.nsh`, los iconos, el script `npm run empaquetar` y
`.github/workflows/compilar-windows.yml`. Lo que falta es que el `.exe` se
compile de verdad y se pruebe en la laptop del bar.

Nada de la impresión se puede probar de verdad en Linux. Para eso está el
modo `simulada`, que escribe el papel a `datos-dev/tickets/`.

La fase 1 estaba dada por bloqueada por falta del respaldo `.json`, pero no
hacía falta: **el menú real de ONCE estaba escrito dentro del código de la
v1.3.0** (`MENU_ONCE`, 55 productos con sus precios y submenús). De ahí se
sacó. El respaldo `.json` sigue siendo útil, pero sólo para dos cosas: los
productos que Rosendo haya capturado a mano después de la v1.3.0, y el
historial de ventas (que se importa hasta la fase 4, cuando existan sus
tablas).

---

## Reglas que no se rompen

1. **Todo el dinero en centavos enteros.** Nunca decimales, nunca floats.
   Para leer lo que teclea una persona se usa `aCentavos()` de
   `nucleo/dinero.js`, que parte el texto y **nunca multiplica por 100**
   (`1.005 * 100` da `100.49999999999999` y se pierde un centavo).

2. **Las dependencias van en un solo sentido:**
   `cliente → servidor → nucleo → datos`
   `nucleo/` no importa nada de `servidor/` ni de `datos/`. Es cálculo puro.
   Por eso se puede probar sin levantar nada.

3. **El cliente no calcula dinero.** La tablet manda "agregué 2 cervezas a la
   mesa 4"; el servidor decide precio, descuento y total. Una tablet con
   datos viejos no puede corromper una cuenta.

4. **`npm test` debe pasar antes de cualquier commit.** Si falla, no se sube.

5. **Nada se borra: todo se registra.** Cancelar una cuenta la marca como
   cancelada con motivo y responsable. La tabla `eventos` sólo crece.

6. **Cada acción del cliente lleva folio único** (cabecera
   `X-Folio-Operacion`). Si llega repetida, el servidor devuelve el resultado
   guardado en vez de volver a ejecutarla. Sin esto habrá cobros duplicados.

7. **El diseño no cambia.** Los colores de `cliente/css/tokens.css` son los
   de la v1, copiados literalmente. Ningún archivo escribe un color a mano.

8. **Las migraciones ya aplicadas no se editan.** Si hay que cambiar el
   esquema, se crea `002_...sql`. La laptop del bar tendrá meses de ventas.

9. **Los comentarios del código se escriben en español**, explicando el
   *porqué* de la decisión, no el *qué* hace la línea.

---

## Comandos

```bash
cd v2
npm install          # una sola vez
npm test             # las pruebas (deben pasar 411/411)
npm run servidor     # levanta RESTA en http://localhost:8080
npm run dev          # lo mismo, en la ventana de escritorio
```

Requiere **Node 22 o superior**.

---

## Estructura

```
v2/
├─ nucleo/       Reglas puras de negocio. Sin pantallas, sin base de datos.
│   ├─ dinero.js     centavos, formato, reparto sin perder centavos
│   ├─ cuenta.js     cortesías, descuentos, propinas, cobro, cambio
│   ├─ opciones.js   el submenú del mesero (derecho/puesto/campechano…)
│   ├─ permisos.js   quién puede qué (mesero anota, caja cobra)
│   ├─ corte.js      totales del turno y cuánto debe haber en el cajón
│   └─ almacen.js    porciones, cobertura y proyección por día de semana
├─ datos/        SQLite y migraciones
│   ├─ rutas-datos.js   dónde vive todo (C:\RESTA en Windows)
│   ├─ conexion.js      WAL, pragmas, transacciones
│   ├─ migrador.js      aplica los .sql pendientes, una vez cada uno
│   ├─ menu-once.js     la carta real de ONCE (55 productos, en centavos)
│   ├─ sembrar-menu.js  pone la carta si la base está vacía
│   ├─ importar-v1.js   lee el respaldo .json de la v1.3.0
│   ├─ respaldo.js      copia en caliente de resta.db, retención 30 días
│   ├─ repos/           una función por consulta, nada de SQL suelto
│   └─ migraciones/
├─ servidor/     Fastify + WebSocket
│   ├─ index.js         arranque y apagado limpio
│   ├─ red.js           IP para las tablets
│   ├─ idempotencia.js  el folio por acción, para no cobrar dos veces
│   ├─ tiempo-real.js   avisa a todas las pantallas cuando algo cambia
│   ├─ auth.js          el pase de cada tablet y el freno a los PIN
│   └─ rutas/           salud · menu · sesion · cuentas · cobro ·
│                        impresion · turnos · configuracion · almacen
├─ cliente/      Lo que se ve. JS con módulos ES, SIN paso de build.
│   ├─ estado.js        qué sabe esta tablet ahora mismo
│   ├─ ui.js            avisos y ventanitas (nada de alert())
│   └─ vistas/          pin · mesas · cuenta · cobro · carta ·
│                        impresora · corte · configuracion · almacen
│   └─ qr.js            el QR de las tablets, calculado sin internet
├─ impresion/    La miniprinter
│   ├─ documento.js   bloques del papel + vista en texto (para probar sin papel)
│   ├─ escpos.js      bytes de la térmica, CP850, el arreglo del modo chino
│   ├─ salidas.js     simulada · red 9100 · spooler Windows · puerto COM
│   ├─ plantillas.js  ticket · cuenta · comanda · corte · prueba
│   └─ cola.js        reintentos y el foquito de estado
├─ escritorio/   Ventana Electron, bandeja, instalador NSIS
└─ pruebas/      node:test
```

---

## Decisiones ya tomadas (no volver a preguntar)

| Tema | Decisión |
|---|---|
| Instalación | Instalador `.exe` único (NSIS), arranca solo al prender la laptop |
| Base de datos | SQLite en modo WAL, en `C:\RESTA\resta.db`. Nunca en OneDrive. |
| Tablets | Navegador contra `http://IP-LAPTOP:8080`. No instalan nada. |
| Sin WiFi | La tablet **se bloquea** con barra roja. No hay modo offline. |
| Meseros | PIN de 4 dígitos. Máximo 10, normalmente 2. Roles: admin / caja / mesero. |
| Meseros NO pueden | Cobrar, aplicar descuentos ni cancelar. Sólo anotar y mandar comanda. |
| Propina | Se calcula sobre el **subtotal** (después del descuento), no sobre el bruto. |
| Descuento al pagar por partes | Se reparte proporcionalmente, para que la suma cuadre con el total. |
| Impresión | ESC/POS RAW. Tres salidas configurables desde la interfaz: red (TCP 9100), spooler de Windows, puerto COM (Bluetooth). |
| Firma de código | **No se paga.** Windows mostrará SmartScreen; está documentado en `v2/LEEME.md`. |
| Compilar el `.exe` | **Siempre en GitHub Actions**, nunca en Linux. Ver `.github/workflows/`. |
| Módulos nuevos | **Almacén SÍ** (Rosendo lo pidió el 29-jul-2026). Sin reservaciones, CFDI ni nube. |
| Inventario | **Se puede apagar** (`almacen.activo`, de fábrica en `0`). Apagado no se enseña por ningún lado, pero por dentro se sigue anotando lo que sale de lo ya controlado. Se enciende en Configuración → El sistema, y se arranca con un **arqueo** (`almacen.arqueo_inicial`). |
| Arqueo | Anotar una cantidad **da de alta** ese producto en el almacén. Sin eso habría que marcar 40 casillas antes de poder contar la primera botella, y nadie llega al final. |
| Comanda sin papel | `impresora.comanda` apaga SÓLO la comanda de barra/cocina. El ticket del cobro, la cuenta del cliente y el corte siguen saliendo. «Mandar a barra» sigue marcando qué salió. |
| Actualizarse | RESTA **se baja su propio instalador** y lo abre. Nunca por el navegador: en la laptop del bar Windows perdió con qué abrir un enlace y el botón viejo murió en silencio. Antes de ejecutarlo comprueba que venga de las publicaciones de RESTA, que pese lo que GitHub dijo y que la huella sha256 coincida. |
| Plantilla de la carta | Se baja **llena** (`GET /api/carta/plantilla`), se corrige en Excel y se sube. La columna **Clave** ata cada renglón a su producto: permite renombrar sin duplicar, y es lo que distingue «mi carta completa» de «la lista del proveedor». Sólo con ella se ofrece dar de baja lo que falte — y **dar de baja, nunca borrar**, con la lista enfrente y la casilla apagada. |

---

## Contexto de la instalación real

- Negocio: **ONCE Social Lounge**
- Impresora en producción: **XPRINTER XP-Q200II**, térmica 80 mm, **USB**,
  llamada `POSPrinter POS80` en Windows.
- Rosendo tiene además una miniprinter **Bluetooth** que aún no ha probado.
  ⚠️ Si resulta ser **BLE**, Windows no puede imprimir en ella y no hay
  arreglo por código. Debe ser Bluetooth clásico / SPP.
- La v1.3.0 guarda todo en `localStorage` de Chrome + `C:\RESTA\Respaldos`.
  Esa fragilidad es el motivo principal de la v2.

---

## Entorno

- **Desarrollo:** Linux (la máquina de Rosendo)
- **Producción:** Windows 11 (la laptop del bar)
- La impresora y el instalador **no se pueden probar en Linux**. Para eso
  existe el modo de impresora `simulada`, que escribe el ticket a un archivo
  en vez de mandarlo a papel.

---

## Referencia de la versión vieja

El código bueno de la v1 está en **`github.com/endoferrari/RESTA`, v1.3.0**
(2759 líneas). El `RESTA.html` de la carpeta local es una versión anterior,
más corta, **desactualizada**. Al buscar cómo funcionaba algo en la v1,
usar siempre el de GitHub.

La v1.3.0 tiene: logo en ticket, descuentos, propinas, cortesías, familias
de productos, comanda a barra/cocina, cierre de turno, teclado en pantalla,
respaldo automático a carpeta y actualizador desde GitHub. **Todo eso debe
existir en la v2 antes de considerarla terminada.**
