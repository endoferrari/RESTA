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
| Comprobante sin papel | `impresora.ticket` apaga SÓLO el ticket del cobro (de fábrica encendido). Apagado, la cuenta se cierra igual y el ticket queda guardado con su folio; lo único que no pasa es que salga papel. **El cajón de dinero se sigue abriendo** al cobrar en efectivo: se manda el pulso solo, sin papel, porque hay que dar el cambio. |
| Comprobante a petición | Al que lo pide se le imprime con un botón, en dos sitios: la ventana de «cuenta cerrada» (donde pasa casi siempre, con el cambio en la mano) y **Corte de caja → Últimos tickets**, para el que regresa al rato. Ese botón **fuerza** el papel aunque el comprobante esté apagado — si respetara el interruptor no haría nada justo cuando hace falta. |
| Últimos tickets | Viven en **Corte de caja**, que es donde Rosendo dijo que era el sitio (2-sep-2026). Se llenan **solos al entrar**, con los de hoy y los más recientes arriba: buscar un ticket para reimprimirlo no puede costar teclear una fecha, porque quien va a esa pantalla ya tiene a alguien esperando enfrente. El bloque va FUERA de «turno abierto» —el cliente puede volver antes de que se abra la caja— y se refresca solo cada vez que se cobra una mesa, porque `app.js` recarga el corte con cada `cuenta.cambio`. Los días de atrás siguen en «Ventas de un día», justo debajo. |
| Copia marcada | Todo comprobante reimpreso sale con **COPIA** en el encabezado, la fecha del cobro (no la del papel) y el renglón «no es un cobro nuevo». Sin esa marca habría dos tickets con el mismo folio sueltos por el bar, y al cuadrar la caja a mano uno de los dos se contaría de más. Un ticket anulado se marca **TICKET ANULADO**, que pesa más que la copia. |
| Actualizarse | RESTA **se baja su propio instalador** y lo abre. Nunca por el navegador: en la laptop del bar Windows perdió con qué abrir un enlace y el botón viejo murió en silencio. Antes de ejecutarlo comprueba que venga de las publicaciones de RESTA, que pese lo que GitHub dijo y que la huella sha256 coincida. |
| Submenús | Se arman **tocando**, en `cliente/js/vistas/submenu-editor.js`: las respuestas son etiquetas y la condición «sólo si antes eligió…» se marca de una lista con las respuestas que ya existen, así no se puede escribir mal. Trae plantillas (copa, cerveza, digestivo) y **copiar el submenú de otro producto**. El formato guardado NO cambió: sigue siendo el texto de siempre, y el modo texto sigue ahí para quien lo prefiera. |
| Impresora dormida | Que el primer intento falle **no es una avería**: es la antena Bluetooth despertando. La cola reintenta a los 0,8 s (antes 5 s) y el foquito se queda **ámbar** los primeros 3 intentos. Pintar de rojo lo normal enseña a la caja a ignorar el foquito, y el día que de verdad falte papel nadie le hace caso. |
| Repetir un producto | Cada renglón de la cuenta trae **− y ＋** pegados a su cantidad. El ＋ anota otro igual **con el mismo detalle, sin volver a abrir el submenú**: «otra igual» ya trae contestado «puesto, con Coca». El − quita uno **sin preguntar «¿seguro?»** —el ＋ está al lado y lo devuelve—, y los toques se atienden en fila, uno tras otro, para que tocar ＋ tres veces seguidas no choque contra la versión de la cuenta. |
| Motivo al quitar | Se pide **sólo si lo que se quita alcanza a algo que ya salió a barra** (`cuantas > porComandar`), no por el mero hecho de que el renglón tenga algo mandado. El servidor descuenta primero lo que no ha salido, así que un renglón con «2 sin mandar» aguanta dos bajas sin estorbar a nadie. |
| Plantilla de la carta | Se baja **llena** (`GET /api/carta/plantilla`), se corrige en Excel y se sube. La columna **Clave** ata cada renglón a su producto: permite renombrar sin duplicar, y es lo que distingue «mi carta completa» de «la lista del proveedor». Sólo con ella se ofrece dar de baja lo que falte — y **dar de baja, nunca borrar**, con la lista enfrente y la casilla apagada. |

---

## Contexto de la instalación real

- Negocio: **ONCE Social Lounge**
- Impresora en producción (recomprobado el 2-sep-2026 en la laptop del bar):
  se llama **`POS-80`** en Windows —no `POSPrinter POS80`, que era el nombre
  viejo— y está en el puerto **`COM4`**.
- ⚠️ **El número de puerto COM NO es fijo: cambia al reemparejar.** El
  25-ago-2026 la impresora estaba en `COM3` y el entrante en `COM4`; el
  2-sep-2026, después de volver a emparejarla, quedó **al revés**. Nunca
  confiar en el número: hay que preguntarle a Windows cuál puerto está atado
  a la dirección de la impresora. El que sirve es el que trae
  `..._LOCALMFG&005D\..._6632419C81FD_...` en su `InstanceId`; el que trae
  `..._000000000000_...` es el puerto Bluetooth *entrante* y no lleva a
  ninguna parte. Se averigua con:
  `Get-PnpDevice -Class Ports | ForEach-Object { "$($_.FriendlyName) -> $($_.InstanceId)" }`
- ✅ **La impresora es Bluetooth CLÁSICO (SPP), no BLE.** Ya no es una duda:
  el puerto bueno es `Serie estándar sobre el vínculo Bluetooth`, atado al
  aparato `BTHENUM\DEV_6632419C81FD` («Bluetooth Printer»), dirección
  `66:32:41:9C:81:FD`. Windows sí puede imprimir en ella.
- ⚠️ **El emparejamiento se puede caer solo.** El 2-sep-2026 la impresora
  aparecía «sin emparejar» aunque su llave seguía en el registro, no existía
  ningún puerto COM, y la impresora `POS-80` de Windows estaba en
  `PendingDeletion` con una página de prueba de 6 MB atorada en la cola. Se
  arregló así, en este orden: (1) parar la cola de impresión, borrar
  `C:\Windows\System32\spool\PRINTERS\FP*.SHD` y `.SPL`, arrancarla otra vez;
  (2) volver a emparejar la impresora; (3) recrear la impresora de Windows
  apuntando al puerto COM nuevo. Síntoma para reconocerlo: `Get-Printer`
  dice `Error, PendingDeletion` y `Get-PnpDevice -Class Ports` no devuelve
  nada.
- ⚠️ **La causa de que el emparejamiento se caiga sola es el «Inicio rápido»
  de Windows** (`HiberbootEnabled`, encontrado encendido el 2-sep-2026). Con
  él, «Apagar» no apaga: Windows congela el estado del Bluetooth y lo
  descongela al prender. Pero la impresora sí se apagó de verdad, así que
  Windows despierta creyendo cosas que ya no son ciertas y la vinculación se
  rompe. Se apaga con `v2/instalacion/5-IMPRESORA-CLAVADA-EN-COM4.ps1`, que
  además **clava el puerto en COM4 buscando a la impresora por su dirección
  Bluetooth**, mueve a quien esté sentado ahí, y reserva el número para que
  ningún aparato nuevo lo pida. Se deshace con `-Deshacer`; se mira sin
  tocar nada con `-SoloVer`.
- ⚠️ **CADA actualización vuelve a poner el arranque automático.** El
  `customInstall` de `escritorio/instalador.nsh` escribe la clave
  `HKLMSoftwareMicrosoftWindowsCurrentVersionRunRESTA` y recrea el
  acceso directo «RESTA» del escritorio — **también al actualizar**, no sólo
  en la primera instalación. Comprobado el 2-sep-2026 al instalar la 2.0.15
  encima de la 2.0.14. Mientras la v1 siga siendo la caja hay que volver a
  correr `v2/instalacion/1-PREPARAR-V2-AISLADA.bat` como administrador
  **después de cada actualización**; si no, la v2 arranca sola al prender la
  laptop y compite por la impresora con la v1. Se comprueba con:
  `Get-ItemProperty 'HKLM:SoftwareMicrosoftWindowsCurrentVersionRun' -Name RESTA`
- ⚠️ **La v1 y la v2 se pelean por la impresora.** La v1 imprime por el
  **spooler** de Windows (`C:\RESTA\agente-impresion.ps1`, que escucha en el
  puerto HTTP 9100); la v2 escribe **directo al puerto COM**. Son dos caminos
  al mismo aparato: mientras el trabajo de uno está en vuelo, el puerto está
  ocupado para el otro. Además el agente de la v1 arranca **dos veces** —hay
  dos accesos directos, «ONCE Agente Impresion.lnk» y «RESTA Impresion.lnk»,
  al mismo `.vbs`— y el segundo siempre muere sin poder tomar el 9100. Nada
  de esto se toca mientras la v1 siga en producción; el día que se apague la
  v1, hay que quitar los dos accesos directos.
- ⚠️ **En la laptop del bar los datos de la v2 NO están en `C:\RESTA`, sino en
  `C:\RESTA-V2`.** Los aparta ahí `1-PREPARAR-V2-AISLADA.bat`, con la variable
  de entorno `RESTA_DATOS` del usuario, para que la v2 no toque nada de la v1
  mientras la vieja siga siendo la caja. La base buena —42 cuentas y 34
  tickets reales al 2-sep-2026— es `C:\RESTA-V2\resta.db`. En `C:\RESTA` quedó
  una `resta.db` de 4 KB abandonada, de antes del aislamiento: **leer esa da
  respuestas falsas**. Antes de mirar ajustes de producción, comprobar primero
  `[Environment]::GetEnvironmentVariable('RESTA_DATOS','User')`.
- Ajustes reales de la impresora al 2-sep-2026 (en `C:\RESTA-V2\resta.db`):
  `impresora.modo = com`, `impresora.com = COM4`, `impresora.nombre = POS-80`,
  `impresora.activa = 1`, `impresora.comanda = 0` (la comanda de barra está
  apagada a propósito; el ticket y la cuenta sí salen).
- 🛑 **El modo `com` NUNCA había funcionado.** Comprobado en la laptop del bar
  el 2-sep-2026: cada ticket moría en 2 s con «El puerto de la impresora es
  COM4, pero no se deja abrir», mientras el puerto se abría perfecto en 64 ms
  desde Windows. La impresora estaba encendida, emparejada y lista. Eran dos
  fallos encadenados, y los dos culpaban a la impresora:

  1. **Node NO puede escribir en un puerto COM de Windows.** Un puerto serie
     exige abrirse en EXCLUSIVA y libuv siempre abre compartiendo, así que
     `writeFile('\\\\.\\COM4')` —y `open()` con cualquier bandera— falla con
     un `UNKNOWN: unknown error` que no dice nada. No es un permiso ni un
     ajuste: no se puede, y punto. **Se hace por PowerShell, con el
     `SerialPort` de .NET.** Cuesta ~1 s por ticket, y ése es el precio.
  2. **`mode COM4:` falla SIEMPRE en un puerto Bluetooth virtual** («El
     dispositivo COM4 no está disponible en este momento»), porque la
     velocidad de un enlace de radio no se puede fijar. Usarlo como prueba de
     que el puerto existe era lo que hacía que RESTA se rindiera sin llegar a
     tocarlo. Ya no se usa en la ruta Bluetooth.

  Tres detalles del arreglo que **no se deben quitar**:
  · Se espera a que `BytesToWrite` llegue a 0 antes de cerrar. Cerrar de golpe
    corta el ticket: .NET da por escrito lo que aún está en la cola de la
    radio, y lo último del papel es justo el comando de cortar.
  · Se reintenta **sólo `Open()`, nunca `Write()`**. Al cobrar salen comanda y
    ticket casi juntos y el segundo se encuentra el puerto todavía tomado
    («Se ha denegado el acceso al puerto»); reintentar la escritura sacaría el
    ticket dos veces y descuadraría la caja.
  · Si el puerto apuntado no contesta, se busca el verdadero por dirección
    Bluetooth y **se apunta el número nuevo** (`impresora.com`), para no pagar
    la búsqueda en cada ticket ni enseñar un puerto falso en Configuración.
- ⚠️ **La antena Bluetooth es USB y Windows tiene permiso para dormirla.**
  Es la causa de que el primer ticket después de un rato tranquilo marque
  error y salga al minuto. Se arregla corriendo, una vez y como
  administrador, `v2/instalacion/3-BLUETOOTH-SIEMPRE-DESPIERTO.ps1`
  (se deshace con `-Deshacer`). No toca la impresora ni el emparejamiento.
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
