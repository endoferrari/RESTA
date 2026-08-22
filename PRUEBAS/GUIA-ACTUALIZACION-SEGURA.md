# Actualizar RESTA sin perder NADA

Guía para la PC de producción (`C:\RESTA`) de ONCE Social Lounge.
Regla de oro: **primero se respalda, después se prueba aparte, y solo al
final se toca la PC de producción.**

---

## 1. Dónde vive cada cosa (esto es lo importante)

| Qué | Dónde vive de verdad | ¿Se pierde al actualizar `RESTA.html`? |
|---|---|---|
| Familias, productos, precios, opciones | `localStorage` del navegador, clave `resta_datos_v1` | **NO** |
| Cuentas / mesas abiertas | igual, dentro de `resta_datos_v1` | **NO** |
| Tickets, ventas, cortes del día, turno | igual, dentro de `resta_datos_v1` | **NO** |
| Nombre del negocio, logo del ticket, pie, ancho de papel, comanda on/off | igual, dentro de `resta_datos_v1` (`D.impresion`) | **NO** |
| Carpeta elegida para el respaldo automático | `IndexedDB` del navegador (base `resta_fs`) | **NO** |
| Copias por turno (`RESTA datos.json`) | `C:\RESTA\Respaldos\Turno FECHA HORA\` | **NO** |
| El programa en sí | `C:\RESTA\RESTA.html` | Sí, se reemplaza (por eso se guarda un `.bak`) |

**Conclusión:** `RESTA.html` es solo el programa. **No contiene ni un dato.**
Reemplazarlo no borra ventas, productos, cuentas ni cortes.

Lo único que sí se perdería es si alguien **editó a mano el código** de
`C:\RESTA\RESTA.html` (precios metidos en el código, menú, logo, textos).
Eso lo detecta el paso 2 antes de tocar nada.

---

## 2. ⚠️ El riesgo real: dos copias comparten los mismos datos

Chrome guarda el `localStorage` de **todas** las páginas `file://` en el
mismo lugar, sin importar la carpeta. Es decir:

> Si copias RESTA a `C:\RESTA-PRUEBAS\` y la abres con el Chrome de siempre,
> **está leyendo y escribiendo los datos REALES de producción.**
> Una prueba mal hecha ahí puede borrar ventas de verdad.

Por eso el script de pruebas (`3-PROBAR-VERSION-NUEVA.bat`) abre la copia con
un **perfil de Chrome separado** (`--user-data-dir=C:\RESTA-PRUEBAS\perfil-chrome`).
Con eso la copia de pruebas tiene su propio `localStorage`, aislado por
completo: haga lo que haga, no puede tocar los datos de producción.

**Nunca abras una copia de prueba con doble clic ni con el acceso directo
normal.** Usa siempre el acceso directo "RESTA PRUEBAS" que crea el script.

---

## 3. Protocolo, en orden

Copia la carpeta `PRUEBAS` al Escritorio de la PC y ejecuta los `.bat` en orden.

### Paso 1 — `1-RESPALDO-TOTAL.bat`
Antes que nada, dentro de RESTA: botón **💾 Respaldo** → guarda el `.json`.
Después cierra ONCE POS y Chrome, y ejecuta el script. Copia al Escritorio:
- toda la carpeta `C:\RESTA` (programa + `Respaldos` de todos los turnos)
- una copia cruda del `Local Storage` e `IndexedDB` del navegador

No modifica nada; solo copia.

### Paso 2 — `2-COMPARAR-CON-GITHUB.bat`
Dice exactamente qué versión tiene la PC, qué versión hay en GitHub y si los
archivos son idénticos. Posibles veredictos:

| Veredicto | Qué significa | Qué hacer |
|---|---|---|
| **IGUALES** | Mismo contenido, byte por byte | No hay nada que hacer |
| **GitHub más nuevo** | La PC está atrasada | Sigue al paso 3 |
| **La PC más nueva** | Hay trabajo local sin subir | **No actualices.** Sube primero con `SUBIR-CAMBIOS.bat` |
| **Misma versión pero distinto contenido** | ⚠️ Alguien editó el archivo a mano | **No actualices.** Revisa `RESTA-diferencias-*.txt` en el Escritorio |

### Paso 3 — `3-PROBAR-VERSION-NUEVA.bat`
Instala la versión de GitHub en `C:\RESTA-PRUEBAS\` (nunca en `C:\RESTA`),
con perfil de Chrome aparte, y copia ahí el respaldo más reciente de
producción para que puedas probar **con datos reales sin ningún riesgo**.

Dentro de la copia de pruebas: botón **📂 Recuperar** → elige
`C:\RESTA-PRUEBAS\datos-de-produccion.json`. Ahora tienes el menú, los precios
y las ventas de verdad, en un entorno desechable.

Prueba esto antes de dar el visto bueno:
- [ ] Se ven todas las familias y productos, con sus precios
- [ ] Abrir mesa → anotar → **Enviar a barra/cocina** → sale la comanda
- [ ] Anotar algo más: aparece la sección **🆕 Nuevo · aún sin enviar**
- [ ] Imprimir cuenta: sale el logo, sin fecha ni ruta `file://`
- [ ] El `¡` sale bien (no como carácter chino)
- [ ] Cobrar → el ticket queda en el corte del día
- [ ] Corte del día cuadra con lo cobrado

⚠️ En la copia de pruebas **no toques el botón 🔄 Actualizar**: te pediría
una carpeta y podrías apuntar a `C:\RESTA` sin querer.

### Paso 4 — actualizar producción (solo si el paso 3 salió bien)
Dentro de ONCE POS: botón **🔄 Actualizar**. Compara con GitHub, instala y
reinicia solo. Los datos no se tocan.
Si el botón no existe (versión anterior a la 1.1.0) o falla: acceso directo
**ACTUALIZAR ONCE POS** del escritorio, o `C:\RESTA\ACTUALIZAR.bat`. Ese
guarda una copia `RESTA.html.bak-FECHA` antes de reemplazar.

### Paso 5 — `4-BORRAR-PRUEBAS.bat`
Borra `C:\RESTA-PRUEBAS` y su acceso directo cuando ya no lo necesites.
Está bloqueado para no poder borrar `C:\RESTA`.

---

## 3-bis. La v2: otro programa, otra decisión

En GitHub hay además una rama `v2` con la **v2.0.2** (29 de julio), que **no es una
actualización de la v1**: es un programa nuevo (aplicación de escritorio con base de
datos SQLite, tablets por WiFi y almacén). El detalle completo está en
`INFORME-COMPARACION.md`, en la raíz del repositorio.

Lo que hay que saber antes de tocarla:

- **No se instala con el botón 🔄 Actualizar.** Tiene su propio instalador
  (`RESTA-Setup-2.0.2.exe`) en las Releases de GitHub.
- Al importar el respaldo `.json` de la v1 trae **la carta, los precios, los submenús
  y la configuración**, pero **NO el historial de ventas ni las cuentas abiertas**
  (eso queda para una fase posterior del proyecto). No se borra nada: sigue en el
  respaldo y en Chrome, pero la v2 empieza su contabilidad desde cero.
- Su instalador **sólo crea** carpetas en `C:\RESTA`, nunca borra; y al desinstalar
  deja los datos intactos a propósito. Pero también deja RESTA **arrancando al
  prender la laptop** y abre el puerto 8080 para las tablets.
- Por eso: **pruébala en otra computadora, no en la del bar.**
- `5-BAJAR-INSTALADOR-V2.bat` baja el instalador al Escritorio y comprueba su huella
  SHA-256 contra la que publica GitHub. **Sólo descarga, no instala nada.**

⚠️ **Nunca fusiones la rama `v2` dentro de `master`.** La rama `v2` salió del primer
commit del proyecto: su `RESTA.html` de la raíz es el prototipo viejo de 1 179 líneas
y en ella están borrados `version.json`, `ACTUALIZAR.bat` e `INSTALAR.bat`. Fusionarla
dejaría el botón 🔄 Actualizar de todas las PCs dando error. La v2 se entrega por
Releases, no fusionando ramas.

---

## 4. Cómo volver atrás si algo sale mal

1. Cierra ONCE POS.
2. En `C:\RESTA` renombra el `RESTA.html.bak-FECHA` más reciente a `RESTA.html`
   (o copia el que guardaste en el respaldo del paso 1).
3. Abre ONCE POS. Los datos siguen ahí: viven en el navegador, no en el archivo.
4. Si además se perdieron datos: botón **📂 Recuperar** → elige el `.json` del
   respaldo (el del botón 💾, o el de `C:\RESTA\Respaldos\Turno .../RESTA datos.json`).
   Ojo: Recuperar **reemplaza todos** los datos actuales por los del archivo.

---

## 5. Sobre esta rama

Todo esto vive en la rama `claude/resta-repo-comparison-9jz1o9`, **no en `master`**.
El botón 🔄 Actualizar de las PCs lee siempre `master`, así que nada de esta
rama llega a producción hasta que se decida unirla a propósito.
