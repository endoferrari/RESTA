# RESTA v2 — Cómo trabajar con el proyecto

Punto de venta de **ONCE Social Lounge**. Reconstrucción desde cero.
Estado actual: **Fase 0 terminada** (esqueleto que arranca).

---

## Lo primero, una sola vez

Abre una terminal en esta carpeta (`v2`) y corre:

```bash
npm install
```

Tarda un par de minutos. Descarga todo lo que RESTA necesita.

---

## Los tres comandos que vas a usar

```bash
npm test          # corre las pruebas automáticas (2 segundos)
npm run servidor  # levanta RESTA y lo abres en el navegador
npm run dev       # lo mismo, pero en la ventana de escritorio
```

### `npm test`

Comprueba que los cálculos de dinero estén bien. Debe decir:

```
# tests 18
# pass 18
# fail 0
```

**Si alguna vez dice `fail 1` o más, no subas nada a GitHub.** Algo se rompió.

### `npm run servidor`

Levanta RESTA. Vas a ver algo así:

```
▸ RESTA está funcionando
   en esta computadora ... http://localhost:8080
   para las tablets ...... http://192.168.1.50:8080
```

Abre `http://localhost:8080` en el navegador. Debe salir el panel de RESTA con
todo en verde. Para detenerlo: `Ctrl+C`.

**Para probar una "tablet":** abre esa segunda dirección desde tu celular
conectado al mismo WiFi. Es exactamente lo que van a hacer los meseros.

### `npm run dev`

Abre RESTA en su propia ventana, como se verá en la laptop del bar.
En Linux funciona para ver el diseño, pero la impresora y el instalador
sólo se prueban de verdad en Windows.

---

## Qué hay en cada carpeta

```
nucleo/       Las reglas de dinero. No sabe de pantallas ni de base de datos.
datos/        La base SQLite y sus migraciones.
servidor/     El cerebro: atiende a la caja y a las tablets.
cliente/      Lo que se ve. Mismo diseño y colores que la v1.
escritorio/   La ventana de Windows y el instalador.
pruebas/      Las pruebas automáticas.
```

**Regla de oro:** las flechas van en un solo sentido —
`cliente → servidor → nucleo → datos`. Nunca al revés.
Por eso se puede tocar el cobro sin miedo a romper el corte.

---

## Dónde se guardan los datos

| | Carpeta |
|---|---|
| Windows (el bar) | `C:\RESTA\` |
| Linux (desarrollo) | `v2/datos-dev/` |

Dentro hay: `resta.db` (la base), `respaldos/` y `bitacora/`.

⚠️ **Nunca pongas `resta.db` dentro de OneDrive, Dropbox o Google Drive.**
SQLite se corrompe ahí. RESTA te avisa si detecta que pasó.

Para empezar de cero en desarrollo: borra la carpeta `datos-dev` y vuelve a
arrancar. Se crea sola.

**Se puede cambiar la carpeta** con la variable de entorno `RESTA_DATOS`. Es lo
que usa `instalacion/1-PREPARAR-V2-AISLADA.bat` para que, mientras la v1 siga
siendo la caja del bar, la v2 guarde en `C:\RESTA-V2` y no comparta ni una
carpeta con ella.

---

## Traer los datos de la v1.3.0

**Carta → Importar respaldo → el `.json` que descarga la v1.**

Si el archivo trae ventas, pregunta si se traen también. Con eso entran:

| | |
|---|---|
| Carta | familias, productos, precios, iconos y submenús |
| Configuración | nombre del negocio, logo del ticket, pie, ancho de papel |
| Ventas cobradas | con sus pagos, cortesías, descuentos y propinas |
| Mesas abiertas | con lo que llevaban y lo que ya habían pagado |
| Bitácora | los movimientos de cada cuenta y las cancelaciones |

Cuatro decisiones que hay que conocer antes de usarlo:

- **Los totales se recalculan, no se copian.** La v1 dejaba la propina fuera
  del total del ticket y la v2 la mete dentro. Se reconstruyen las líneas y se
  pasan por el mismo `calcularCuenta()` de siempre, así que el histórico queda
  sumado con las reglas de la v2 y no con una segunda aritmética.
- **El almacén no se mueve.** Esa mercancía salió del refrigerador en su día;
  descontarla hoy dejaría el inventario en negativo y la lista de compras
  pidiendo de más para siempre.
- **Sin turno.** La v1 no sabía de turnos y no hay forma de inventárselos sin
  mentir. Las ventas importadas se ven en **Corte → «Ventas de un día»**, no en
  el corte del turno.
- **Reimportar no duplica.** Cada cuenta y cada ticket guardan el `id_v1` que
  traían, con índice único. Se puede corregir la carta y volver a importar el
  mismo archivo las veces que haga falta.

La numeración de tickets continúa donde la dejó la v1, para que no haya dos
folios iguales en la historia del negocio.

**Cómo se comprueba que quedó bien:** en **Corte → «Ventas de un día»**, el
total de un día tiene que dar exactamente lo mismo que el corte que imprimió la
v1 ese mismo día. Prueba con un día que haya tenido cortesías o descuentos, que
es donde las dos versiones podrían no sumar igual.

Para instalarla junto a la v1 sin que se mezclen: `instalacion/LEEME.md`.

---

## Cómo se genera el instalador de Windows

Tú estás en Linux y el bar usa Windows 11. **No compiles el `.exe` en tu
máquina** — lo hace GitHub por ti, en una máquina Windows de verdad.

**Para una versión de prueba:** sube tus cambios normal.

```bash
git add .
git commit -m "lo que hiciste"
git push
```

Entra a la pestaña **Actions** del repositorio. Cuando termine (unos minutos),
descarga el `.exe` de ahí abajo, en "Artifacts".

**Para una versión que se instala en el bar:**

```bash
git tag v2.0.0
git push origin v2.0.0
```

Eso publica el instalador en **Releases**, con instrucciones y todo.

---

## La advertencia de Windows al instalar

El instalador no está firmado (decidimos no pagar el certificado). Windows va
a mostrar una pantalla azul que dice *"Windows protegió tu PC"*.

**Es normal y no significa que haya un virus.** Se resuelve así:

1. Clic en **"Más información"**
2. Clic en **"Ejecutar de todas formas"**

Sólo pasa la primera vez de cada versión. Vale la pena avisarle a quien vaya
a instalar, para que no se asuste y cancele.

---

## Lo que ya está hecho y lo que falta

- [x] **Fase 0** — Esqueleto: servidor, base de datos, migraciones, pantalla, diagnóstico
- [x] Núcleo de dinero con 18 pruebas automáticas
- [x] GitHub Actions compilando el `.exe`
- [ ] **Fase 1** — Menú, familias e importador de los datos de la v1.3.0
- [ ] **Fase 2** — Resto del núcleo: descuentos, propinas, cortesías
- [ ] **Fase 3** — Mesas y cuentas en vivo, PIN de mesero
- [ ] **Fase 4** — Cobro completo
- [ ] **Fase 5** — Impresión ESC/POS configurable
- [ ] **Fase 6** — Corte, turnos y respaldos
- [ ] **Fase 7** — Empaquetado final

El plan completo está en `../PROPUESTA-RESTA-v2.md`.
