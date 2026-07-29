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
| 5 | Impresión ESC/POS configurable | ✅ hecho — falta el logo |
| 6 | Corte del día, turnos, respaldos automáticos | ✅ hecho |
| 7 | Empaquetado final e instalador | ⬜ siguiente |

El plan completo está en `PROPUESTA-RESTA-v2.md`.

**Lo siguiente: Fase 7 (instalador y empaquetado).**

⚠️ **Pendientes que faltan para dar la v2 por terminada:**

1. **El logo del ticket.** La v1.3.0 sí lo imprime. Aquí el bloque `logo()`
   existe y `rasterABytes()` ya sabe mandar una imagen a la térmica, pero
   falta convertir el SVG de ONCE a puntos desde Node (sin canvas).
2. **El actualizador desde GitHub** que tenía la v1.3.0 (botón 🔄).

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
npm test             # las pruebas (deben pasar 274/274)
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
