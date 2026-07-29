# RESTA v2 — Propuesta de reconstrucción

**Fecha:** 29 de julio de 2026
**De:** análisis del código actual (local + GitHub)
**Para:** rosendo

---

## ⚠️ Primero: lo local está desactualizado

Antes de nada, esto es importante porque cambia el punto de partida:

| | Carpeta local `RESTA/` | GitHub `endoferrari/RESTA` |
|---|---|---|
| Líneas de código | 1,179 | **2,759** |
| Versión | sin versionar | **v1.3.0** (3 de julio de 2026) |
| Impresión | ventana de Windows (`window.print`) | **agente ESC/POS RAW** en puerto 9100 |
| Logo en ticket | no | **sí** |
| Descuentos / cortesías | no | **sí** |
| Propinas | no | **sí** |
| Familias (categorías) | no | **sí** |
| Comanda a barra/cocina | no | **sí** |
| Cierre de turno | no | **sí** |
| Teclado en pantalla | no | **sí** |
| Respaldo automático a carpeta | no | **sí** |
| Botón de actualizar desde GitHub | no | **sí** |
| Instalador | no | `INSTALAR.bat` + guía de impresora |

**El archivo local es una versión vieja.** Si empezamos a trabajar sobre él, perdemos
como la mitad del trabajo ya hecho. **La referencia real es GitHub v1.3.0.**

También descubrí el contexto real de la instalación, que no me habías dicho:

- El negocio se llama **ONCE Social Lounge**
- La impresora en producción es una **XPRINTER XP-Q200II, térmica de 80 mm, por USB**
- En Windows aparece con el nombre `POSPrinter POS80`
- Los datos viven en `C:\RESTA` y en el `localStorage` de Chrome

Esto último es la parte frágil: **si alguien limpia el historial de Chrome o cambia
de perfil, se borra todo.** Ese es el problema #1 que v2 resuelve.

---

## Diagnóstico: qué está bien y qué no aguanta crecer

### Lo que está bien y NO se toca

- ✅ **El diseño.** La paleta verde/ámbar, las tarjetas, los mosaicos de colores, la
  tipografía. Se conserva idéntico, sólo pasa a archivos CSS separados.
- ✅ **La navegación.** Mesas → Cuenta → Cobro → Corte. El flujo es correcto.
- ✅ **El dinero en centavos enteros.** Esto lo hiciste bien y es de las decisiones
  más importantes de un punto de venta: nunca hay errores de redondeo.
- ✅ **La foto del precio al momento de anotar.** Si subes el precio de la cerveza a
  medio servicio, las cuentas abiertas conservan el precio viejo. Correcto.
- ✅ **El `escape` de textos.** Estás escapando el HTML, no hay inyección. Bien.
- ✅ **La idea del ESC/POS RAW.** El agente de PowerShell va por el camino correcto:
  mandar bytes crudos al spooler de Windows es *la* forma de imprimir en térmica.

### Lo que impide llevarlo a nivel profesional

| # | Problema | Qué pasa en el bar |
|---|---|---|
| 1 | **Los datos viven en el navegador** | Un perfil de Chrome borrado = todas las ventas perdidas. Sin red de seguridad. |
| 2 | **Un solo dispositivo** | No hay forma de conectar tablets. Cada navegador tendría su propia realidad y sus propias mesas. |
| 3 | **Sin transacciones** | Si se va la luz a media escritura de `localStorage`, el JSON puede quedar corrupto y se pierde **todo**, no la última venta. |
| 4 | **Todo se guarda de golpe** | Cada clic reescribe el archivo completo. Con 3,000 tickets acumulados eso empieza a lagear notablemente. |
| 5 | **2,759 líneas en un archivo** | Cambiar algo del cobro sin romper el corte es cada vez más arriesgado. No hay dónde poner una prueba. |
| 6 | **Cero pruebas automáticas** | Un error en el cálculo de descuento + propina + división entre personas sólo se descubre cobrando mal a un cliente. |
| 7 | **El agente de impresión es aparte** | Un proceso de PowerShell suelto, con CORS, en el puerto 9100. Si no arrancó, no imprime y nadie sabe por qué. |
| 8 | **Nadie firma nada** | No se sabe qué mesero anotó qué, ni quién canceló una cuenta, ni quién aplicó una cortesía. |
| 9 | **Se puede borrar sin rastro** | `data-accion="borrar-ventas"` borra el historial. No queda registro de que se borró. |
| 10 | **Sin manejo de errores** | Si algo truena a media función, la app queda en un estado raro y hay que recargar. |

---

## La propuesta: monolito nuclear

**Una sola aplicación.** Un solo instalador, un solo proceso, una sola base de datos.
Sin Docker, sin nube, sin servicios externos, sin cuentas de nada. Si se cae el
internet, el bar sigue vendiendo. Todo pasa dentro de la laptop.

### El dibujo

```
        LAPTOP (caja) — se instala una vez, arranca sola al prender
        ┌───────────────────────────────────────────────────┐
        │  RESTA.exe                                        │
        │                                                   │
        │   ┌── Ventana de caja (pantalla completa)         │
        │   │                                               │
        │   ├── Servidor interno (puerto 8080)              │
        │   │     · reglas de negocio                       │
        │   │     · tiempo real (WebSocket)                  │
        │   │     · cola de impresión                        │
        │   │                                               │
        │   ├── Base de datos SQLite  →  C:\RESTA\datos\    │
        │   │                                               │
        │   └── Respaldos automáticos →  C:\RESTA\respaldos\│
        └───────────────┬───────────────────────────────────┘
                        │
              WiFi del local (sin internet)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   📱 Tablet 1     📱 Tablet 2     📱 Tablet 3
   (mesero Ana)   (mesero Luis)   (mesero Pepe)
   abre http://192.168.1.50:8080 en el navegador
                        │
                        └──► 🖨️ Miniprinter (USB o Bluetooth)
```

Las tablets **no instalan nada**. Abren el navegador, escanean un QR la primera vez
y se agrega a la pantalla de inicio como si fuera una app. Funciona igual en Android
barato, en iPad o en otra laptop.

---

## Decisiones técnicas (y por qué)

### 1. Base de datos: SQLite, no el navegador

SQLite es un archivo único (`resta.db`) que se comporta como una base de datos de
verdad. Es la base de datos más usada del mundo — está en tu celular, en tu coche y
en los aviones. En modo WAL soporta que caja y tres tablets escriban al mismo tiempo
sin pisarse.

**Lo que esto te da concretamente:**

- **Transacciones.** Un cobro se guarda completo o no se guarda. Nunca a medias.
- **Si se va la luz a media venta**, al volver la base está íntegra. Se pierde esa
  venta, no el mes.
- **Respaldar es copiar un archivo.** Se puede copiar en caliente, con el bar lleno.
- **Consultas instantáneas.** El corte de un día con 500 tickets sale en milisegundos
  aunque tengas 3 años de historia.
- **Se abre con cualquier visor gratuito** si algún día quieres sacar datos a Excel.

### 2. Nada de "confiar en el cliente"

Hoy, la tablet calcularía el total y lo mandaría. En v2 **la tablet no calcula nada**:
manda "agregué 2 cervezas a la mesa 4" y el servidor decide precio, total, descuento
y todo lo demás. Una tablet con un error, con la hora mal o con una versión vieja
del menú **no puede** corromper una cuenta.

### 3. Cada acción lleva folio propio (idempotencia)

Este es el detalle que separa un POS de juguete de uno serio.

Cada acción que sale de una tablet lleva un identificador único. Si el mesero toca
"Cobrar" dos veces porque se tardó, o si el WiFi parpadea y la petición se reenvía,
**el servidor reconoce que ya procesó esa acción y devuelve el mismo resultado sin
cobrar dos veces.**

Sin esto, tarde o temprano tienes un cobro duplicado y un cliente enojado.

### 4. Dos meseros, una mesa (bloqueo optimista)

Cada cuenta tiene un número de versión. Si Ana y Luis abren la mesa 7 al mismo tiempo
y ambos anotan, el segundo recibe un aviso *"esta cuenta cambió, mira lo nuevo"* y la
pantalla se actualiza sola. Nunca se pierde una comanda por encimarse.

### 5. Nada se borra: todo se registra

Una tabla de eventos que **sólo crece**. Cada cosa que pasa queda escrita con quién,
qué y cuándo: quién abrió la mesa, quién anotó cada producto, quién dio la cortesía,
quién canceló, quién cerró el turno.

Cancelar una cuenta no la borra: la marca como cancelada, con motivo y responsable.
Cuando falte dinero en la caja, hay a dónde ir a ver.

### 6. Impresión: se queda tu idea, pero adentro

Tu agente de PowerShell hace lo correcto (bytes ESC/POS crudos al spooler de Windows).
En v2 **eso mismo vive dentro de la aplicación**: sin proceso aparte, sin puerto 9100,
sin CORS, sin que nadie tenga que acordarse de arrancarlo.

Y le agregamos lo que le falta para ser confiable:

- **Cola con reintentos.** Si la impresora está apagada o sin papel, el ticket se
  queda en cola y se imprime solo cuando vuelve. No se pierde.
- **Estado visible.** Un foquito en pantalla: verde = lista, ámbar = imprimiendo,
  rojo = revisa la impresora. Hoy no hay forma de saberlo.
- **Tres formas de conexión, se elige de una lista** (no se edita código):
  red · USB/spooler · puerto COM (Bluetooth).
- **Botón de prueba** que imprime una tira con todos los formatos, para calibrar sin
  tener que cobrarle a nadie.

#### 🔴 Advertencia importante sobre el Bluetooth

Verifiqué esto a fondo antes de escribirlo, y hay un riesgo real que debes conocer
**antes de comprar la impresora**:

| Conexión | Qué tan confiable | Recomendación |
|---|---|---|
| **Red (Ethernet/WiFi, puerto 9100)** | ⭐ La más confiable de todas | **La mejor opción.** Le mandamos los bytes por red directo. Sin drivers, sin spooler, sin nada que se desconfigure. |
| **USB** (tu XP-Q200II actual) | ✅ Muy confiable, ya probado por ti | Perfecta. Es lo que ya tienes funcionando. |
| **Bluetooth clásico (SPP)** | ⚠️ Funciona, pero frágil | Sirve, pero se duerme, hay que reemparejar y el puerto COM a veces se queda colgado. |
| **Bluetooth BLE** | ❌ **No sirve en Windows** | Windows no puede imprimir en estas. Y muchas miniprinters chinas nuevas son justo de éstas. |

**Traducción práctica:** si compras una miniprinter Bluetooth sin fijarte, hay
posibilidad real de que sea BLE y **simplemente no funcione en Windows**, y no es un
problema que se arregle programando.

**Mi recomendación:** deja la XP-Q200II por USB como impresora principal, o compra
una con puerto de red. El Bluetooth déjalo como plan B. De todos modos el sistema
soporta los tres — pero quiero que sepas cuál te va a dar guerra.

Si insistes en Bluetooth: **confirma con el vendedor que es Bluetooth clásico / SPP,
no BLE.** Eso es lo único que necesitas preguntar.

### 7. Las reglas del dinero, separadas y probadas

Todo el cálculo de dinero — subtotal, descuento, cortesía, propina, división entre
personas, pago parcial, cambio — vive en archivos aparte que **no saben nada de
pantallas ni de base de datos**. Sólo reciben números y devuelven números.

Eso permite escribir pruebas automáticas de los casos que dan miedo:

- descuento del 15% + propina del 10% + dividido entre 3 personas
- pagan la mitad en efectivo y la mitad con tarjeta
- una cortesía sobre una cuenta con descuento
- pagos parciales hasta que el restante queda exactamente en cero

Se corren en 2 segundos con un comando. Si algún día tocamos el cálculo y algo se
rompe, te enteras **antes** de instalar, no cuando el cliente reclame.

### 8. Instalador de verdad

Un `RESTA-Setup-2.0.0.exe`. Doble clic, siguiente, siguiente, listo. Y hace solo:

- instala en `C:\Program Files\RESTA`, datos en `C:\RESTA`
- icono en el escritorio y en el menú inicio
- **arranca solo al prender la laptop**, minimizado junto al reloj
- **abre el puerto 8080 en el Firewall de Windows**, en redes privadas *y públicas*
  (sin esto las tablets no conectan, y el síntoma es mudo: simplemente no carga)
- **evita que la laptop se duerma** mientras el sistema está abierto, y desactiva el
  ahorro de energía del WiFi (si no, el servidor desaparece a media noche del sábado)
- muestra en pantalla la **dirección IP y un QR** para conectar las tablets
- si ya había datos de la v1.3.0, **los importa**

No requiere instalar Node, ni Chrome, ni nada. Todo va adentro.

**Un detalle del router:** si la laptop toma IP automática, un día el router se la
cambia y todas las tablets dejan de conectar. En la instalación se le **reserva una IP
fija** a la laptop (5 minutos en el router). La pantalla de red te dice si la IP
cambió y te muestra el QR nuevo.

### 9. Actualizaciones que sí funcionan

Tu botón 🔄 Actualizar se conserva, pero apoyado en el mecanismo estándar de
actualización: descarga en segundo plano, verifica firma, y aplica al reiniciar.
Si la actualización falla, **regresa sola a la versión anterior**. Los datos nunca
se tocan.

---

## Estructura del proyecto

```
resta/
│
├─ 📁 nucleo/                    ← REGLAS DE NEGOCIO (puro cálculo, con pruebas)
│   ├─ dinero.js                    centavos, redondeo, formato
│   ├─ cuenta.js                    abrir, anotar, quitar, cortesía
│   ├─ cobro.js                     descuento, propina, división, pagos parciales
│   ├─ corte.js                     totales del día, por método, lo más vendido
│   └─ turno.js                     apertura y cierre de caja
│
├─ 📁 datos/                     ← BASE DE DATOS
│   ├─ conexion.js                  SQLite en modo WAL
│   ├─ migraciones/                 001_inicial.sql, 002_..., versionadas
│   ├─ repos/                       una función por consulta, nada de SQL suelto
│   ├─ respaldo.js                  copia automática + retención 30 días
│   └─ importar-v1.js               lee el respaldo JSON de la v1.3.0
│
├─ 📁 servidor/                  ← EL CEREBRO
│   ├─ index.js                     arranque y apagado limpio
│   ├─ rutas/                       auth, productos, cuentas, cobros, corte, impresión
│   ├─ esquemas/                    valida TODO lo que entra, sin excepción
│   ├─ tiempo-real.js               WebSocket: avisa a todas las pantallas
│   ├─ idempotencia.js              el folio por acción
│   └─ registro.js                  bitácora en archivo, rotada
│
├─ 📁 impresion/                 ← LA MINIPRINTER
│   ├─ escpos.js                    construye los bytes
│   ├─ salidas/                     spooler-windows.js  ·  puerto-com.js
│   ├─ cola.js                      reintentos y estado
│   └─ plantillas/                  ticket · cuenta · comanda · corte · prueba
│
├─ 📁 cliente/                   ← LO QUE SE VE (caja y tablets)
│   ├─ index.html
│   ├─ css/                         tokens.css ← tus colores exactos
│   ├─ js/vistas/                   mesas · cuenta · cobro · productos · corte
│   └─ js/                          api.js · socket.js · estado.js · teclado.js
│
├─ 📁 escritorio/                ← LA VENTANA DE WINDOWS
│   ├─ principal.js                 ventana, icono junto al reloj, autoarranque
│   └─ pantalla-red.js              IP + QR para las tablets
│
├─ 📁 pruebas/                   ← LAS PRUEBAS AUTOMÁTICAS
│   ├─ dinero.test.js
│   ├─ cobro.test.js               ← los casos que dan miedo
│   └─ api.test.js
│
└─ 📁 docs/
    ├─ INSTALAR.md                  para quien instale en el local
    ├─ IMPRESORA.md                 tu guía actual, actualizada
    └─ MANUAL-MESERO.md             una hoja, para pegar en la barra
```

**Regla de oro:** las flechas van en un solo sentido.
`cliente → servidor → núcleo → datos`. Nunca al revés.
Por eso se puede tocar el cobro sin miedo a romper el corte.

---

## Cómo queda la operación diaria

**Caja (la laptop):** hace todo. Cobra, aplica descuentos, imprime, hace el corte,
cierra turno.

**Tablets (meseros):** entran con su PIN de 4 dígitos. Pueden abrir mesas, anotar
productos y mandar la comanda a barra/cocina. **No pueden cobrar, ni descontar, ni
cancelar.** Si el WiFi se cae, aparece una barra roja *"Sin conexión — no anotes"*
y se bloquea hasta que vuelva. En cuanto vuelve, se sincroniza sola.

**Todas las pantallas viven la misma realidad.** Ana anota una cerveza en la mesa 4
desde su tablet, y en la caja aparece al instante. La caja cobra, y la mesa desaparece
de la tablet de Ana en el mismo segundo.

---

## Plan de trabajo: 8 fases

Cada fase te la entrego como **un prompt detallado**, listo para pegar en VS Code.
Cada fase termina con algo que puedes probar tú mismo. Nada de "confía en mí, ya
casi". Si en la fase 4 decides parar, lo de las fases 1-3 ya sirve.

| Fase | Qué se construye | Cómo compruebas que funciona |
|---|---|---|
| **0** | Esqueleto: servidor arranca, base de datos se crea, pantalla en blanco carga | Abres `localhost:8080` y ves "RESTA v2 vivo" |
| **1** | Base de datos completa, migraciones, menú y familias, importador de tus datos v1.3.0 | Importas tu respaldo real y ves tus productos de ONCE |
| **2** | Núcleo de dinero + **todas las pruebas automáticas** | Corres `npm test` y pasan los 40+ casos |
| **3** | Mesas y cuentas en tiempo real, con PIN de mesero | Abres 2 navegadores, anotas en uno y aparece en el otro |
| **4** | Cobro completo: efectivo, tarjeta, mixto, división, descuento, propina, cortesía | Cobras una cuenta partida entre 3 con descuento, y cuadra |
| **5** | Impresión ESC/POS: ticket, cuenta, comanda, corte, cola y estado | Apagas la impresora, cobras, la prendes, y el ticket sale solo |
| **6** | Corte del día, cierre de turno, respaldos automáticos | Cierras turno y sale el corte impreso, con respaldo en disco |
| **7** | Empaquetado: instalador .exe, autoarranque, firewall, IP+QR, actualizaciones | Instalas en una laptop limpia y conectas una tablet |

**Tiempo estimado:** entre 2 y 4 sesiones de trabajo por fase, según cuánto quieras
revisar en cada paso.

---

## Lo que NO incluye (y está bien)

Respetando tu "no quiero más módulos por ahora":

- ❌ Inventario / control de existencias
- ❌ Reservaciones
- ❌ Facturación electrónica (CFDI/SAT)
- ❌ Compras, proveedores, costos
- ❌ Nómina, horarios, asistencia
- ❌ Reportes históricos más allá del corte diario
- ❌ Nube, multi-sucursal, app en tiendas

**Pero la estructura los deja entrar sin rehacer nada.** Agregar inventario después
sería una carpeta nueva en `nucleo/` y una pantalla nueva en `cliente/vistas/`. Nada
de lo ya construido se toca. Eso es justo lo que no se puede hacer hoy con un archivo
de 2,759 líneas.

---

## Riesgos conocidos y cómo se manejan

Verifiqué cada pieza del stack antes de proponértela. Estos son los puntos donde
proyectos así suelen fallar, y qué hacemos con cada uno:

| Riesgo | Qué pasaría | Cómo lo evitamos |
|---|---|---|
| **Impresora Bluetooth BLE** | Simplemente no imprime, y no hay arreglo por código | Verificar antes de comprar que sea SPP. Priorizar USB o red. |
| **Windows bloquea el .exe (SmartScreen)** | Al instalar sale "Windows protegió tu PC" y da miedo | Se firma el instalador (~10 USD/mes) o se documenta el "Más información → Ejecutar de todas formas". **Decisión tuya, hay que presupuestarla.** |
| **Firewall silencioso** | Las tablets no conectan y nadie sabe por qué | Regla de firewall desde el instalador + pantalla de diagnóstico que te dice exactamente qué falla |
| **La IP de la laptop cambia** | Todas las tablets mueren a la vez | IP reservada en el router + aviso en pantalla + QR nuevo |
| **La laptop se duerme** | El servidor desaparece a media operación | Bloqueo de suspensión mientras la app está abierta |
| **Base de datos en OneDrive** | SQLite se corrompe. Garantizado, no es exageración. | La base va a una ruta local fija, nunca a carpeta sincronizada |
| **Sin HTTPS en la LAN** | Las tablets no pueden instalarse como app ni usar cámara | No lo necesitamos: ya decidiste que sin WiFi se bloquea, así que no hay modo offline que proteger |

---

## Lo que necesito de ti para arrancar

1. **Confirmar que la referencia es GitHub v1.3.0**, no el archivo local. (Casi seguro
   que sí, pero mejor preguntarlo que asumirlo.)
2. **Un respaldo `.json` real de ONCE Social Lounge**, aunque sea de prueba, para
   construir el importador contra datos de verdad y no inventados.
3. **La marca y modelo de la miniprinter Bluetooth** que piensas usar — o si prefieres
   seguir con la XP-Q200II por USB (lo que yo recomiendo). Ver la advertencia de la
   sección de impresión: esto se decide **antes** de comprar, no después.
4. **Cuántos meseros** van a tener PIN, y si quieres que el sistema calcule propina
   por mesero.
5. **Si vas a pagar la firma del instalador** (~10 USD/mes) o prefieres convivir con
   el aviso de Windows en cada instalación y actualización.

---

## Resumen en una frase

Pasar de *un archivo HTML muy bien hecho que guarda en el navegador* a
*una aplicación instalable con base de datos real, varias pantallas en vivo,
impresión confiable y pruebas automáticas* — **conservando exactamente el mismo
diseño, los mismos colores y el mismo flujo que ya te funciona.**

Lo que cambia es lo que no se ve. Lo que se ve, se queda.
