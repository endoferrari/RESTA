# Instalar la v2 en la misma PC, sin tocar la v1

Para la laptop de ONCE Social Lounge, donde hoy corre la v1 (`C:\RESTA\RESTA.html`
abierto con Chrome desde el acceso directo "ONCE POS").

La idea: que las dos versiones convivan un tiempo. La v1 sigue siendo la caja de
verdad hasta que la v2 demuestre que cuadra.

---

## Por qué hacen falta estos scripts

La v2 guarda sus datos en `C:\RESTA` — la misma carpeta donde vive la v1. No se
pisan archivos (la v1 usa `RESTA.html` y `Respaldos\`; la v2 usa `resta.db`),
pero los respaldos de las dos quedarían revueltos en la misma carpeta, porque
Windows no distingue `Respaldos` de `respaldos`.

Además, el instalador de la v2 deja el programa **arrancando solo al prender la
laptop**, que no es lo que se quiere mientras se está probando.

Estos scripts resuelven las dos cosas: apuntan la v2 a `C:\RESTA-V2` y quitan el
arranque automático. Nada del sistema cambia: el lanzador fija la carpeta de
datos sólo para ese proceso, y deshacerlo es borrar un archivo.

---

## Orden

### 1. Respalda la v1 primero
Dentro de "ONCE POS": botón **💾 Respaldo**, y guarda el `.json`.
Ese archivo es lo que vas a importar en la v2, así que déjalo a mano.

### 2. Instala la v2
Descarga `RESTA-Setup-x.x.x.exe` de las
[Releases](https://github.com/endoferrari/RESTA/releases) y ejecútalo.
Windows va a mostrar una advertencia azul porque el instalador no está firmado:
**"Más información" → "Ejecutar de todas formas"**.

### 3. Ejecuta `1-PREPARAR-V2-AISLADA.bat`
Con botón derecho → **"Ejecutar como administrador"** (hace falta sólo para
quitar el arranque automático; lo demás funciona sin permisos).

Hace cinco cosas y las anuncia antes de hacerlas:

| | |
|---|---|
| 1 | Crea `C:\RESTA-V2` para los datos de la v2 |
| 2 | Crea un lanzador que apunta la v2 a esa carpeta |
| 3 | Crea el acceso directo **"RESTA v2 (PRUEBAS)"** |
| 4 | Quita el arranque automático que puso el instalador |
| 5 | Quita el acceso directo "RESTA" suelto del instalador |

El paso 5 importa: si la v2 se abriera desde ese acceso directo, guardaría en
`C:\RESTA` y se acabó el aislamiento. **Abre siempre "RESTA v2 (PRUEBAS)".**

### 4. Importa los datos de la v1
Abre "RESTA v2 (PRUEBAS)". La primera vez pide crear tu usuario con un PIN.

Luego: **Carta → Importar respaldo → elige el `.json` de la v1.**

Como el respaldo trae ventas, va a preguntar si las traes también. Responde
**"Sí, traer las ventas"**. Entra:

- ✅ La carta completa: familias, productos, precios, iconos y submenús
- ✅ La configuración: nombre del negocio, logo del ticket, pie, ancho de papel
- ✅ Las ventas ya cobradas, con sus pagos, cortesías, descuentos y propinas
- ✅ Las mesas que quedaron abiertas, con lo que llevaban y lo que ya habían pagado
- ✅ La bitácora de cada cuenta y las cancelaciones

Detalles que conviene saber:

- La numeración de tickets **sigue donde la dejó la v1**, no vuelve al 1.
- **El almacén no se mueve.** Esas cervezas ya salieron del refrigerador en su
  día; si descontaran hoy, el inventario quedaría en negativo.
- Las ventas importadas **no pertenecen a ningún turno**, porque la v1 no sabía
  de turnos. Se ven en **Corte → "Ventas de un día"**, no en el corte del turno.
- **Importar el mismo archivo dos veces no duplica nada.** Puedes corregir algo
  y volver a importar con confianza.

### 5. Comprueba que el dinero cuadra
Esto es lo que decide si la migración es de fiar:

**Corte → "Ventas de un día" → elige un día** y compáralo con el corte que
imprimió la v1 ese mismo día. Tiene que dar exactamente lo mismo.

Prueba con dos o tres días distintos, y con uno que haya tenido cortesías o
descuentos, que es donde las dos versiones podrían no sumar igual.

Si algo no cuadra: **no cambies nada todavía** y avisa con el día y las dos
cifras. La v1 sigue siendo la caja mientras tanto.

---

## Cómo volver atrás

- **Quitar la prueba:** `2-DESHACER-LA-V2.bat`. Quita el acceso directo y el
  lanzador; los datos de `C:\RESTA-V2` sólo se borran si lo escribes aparte.
- **Desinstalar la v2:** Panel de control → Programas. `C:\RESTA-V2` no se borra
  al desinstalar, a propósito.
- **La v1 no se toca en ningún momento.** Su acceso directo "ONCE POS", su
  `RESTA.html`, su carpeta `Respaldos` y sus datos en el navegador quedan igual.

---

## Cuando se decida el cambio

Se hace con la caja cerrada y el corte del día impreso:

1. Corte final en la v1, caja en ceros, respaldo `.json` guardado.
2. Importar ese respaldo definitivo en la v2 (trae lo que faltara desde la
   última prueba; lo repetido no se duplica).
3. Renombrar el acceso directo a "ONCE POS v2" y dejar el de la v1 arrinconado
   un par de semanas, por si acaso.
4. Volver a poner el arranque automático, si se quiere que la laptop abra RESTA
   sola: `1-PREPARAR-V2-AISLADA.bat` lo quitó; se restaura con el instalador o a
   mano en el registro.

## Dos cosas para el día del cambio

- **La impresora es una sola.** No dejes las dos versiones imprimiendo a la vez
  en la térmica.
- **Las tablets necesitan el puerto 8080.** El instalador lo abre en el firewall.
  Si no conectan, casi siempre es que el WiFi del local está marcado como red
  "pública" en Windows.
