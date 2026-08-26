# Informe: qué hay en GitHub vs. la PC de producción

**Fecha del análisis:** 22 de agosto de 2026
**Repositorio:** `endoferrari/RESTA`
**PC de producción:** `C:\RESTA` — ONCE Social Lounge

> Este informe **no cambia nada** en la PC ni en `master`. Todo vive en la rama
> `claude/resta-repo-comparison-9jz1o9`, aparte de producción.

---

## Resumen en tres líneas

1. En GitHub hay **dos cosas distintas**: la rama `master` con la **v1.3.0**
   (3 de julio) —la misma línea que corre en el bar— y una rama `v2` con la
   **v2.0.2** (29 de julio), que es un programa **completamente nuevo**.
2. La v2 **está terminada, compilada y publicada**: hay instalador de Windows
   `RESTA-Setup-2.0.2.exe` en las Releases. Ejecuté sus pruebas: **330 de 330 pasan**.
3. La v2 **no se puede instalar con el botón 🔄 Actualizar** y **todavía no importa
   el historial de ventas** de la v1. Migrar es una decisión aparte, con fecha
   elegida, no un "actualizar y ya".

---

## 1. Las tres versiones en juego

| | PC del bar | GitHub `master` | GitHub `v2` (tag v2.0.2) |
|---|---|---|---|
| Versión | *por confirmar* (ver paso 2 del kit) | **v1.3.0** | **v2.0.2** |
| Fecha | — | 3 jul 2026 | **29 jul 2026** |
| Qué es | un `RESTA.html` | un `RESTA.html` (2 760 líneas) | app de escritorio: Electron + servidor + SQLite (106 archivos) |
| Dónde guarda los datos | `localStorage` de Chrome | igual | **base SQLite en `C:\RESTA\resta.db`** |
| Tablets para meseros | no | no | **sí, por WiFi con QR** |
| Pruebas automáticas | 0 | 0 | **330, todas pasando** |
| Instalador | `INSTALAR.bat` | `INSTALAR.bat` | **`RESTA-Setup-2.0.2.exe` firmado por CI** |

`master` y la PC son la misma familia: mismo archivo, mismo modo de trabajar.
La `v2` es otro programa que hace lo mismo, mejor, pero se instala y se migra aparte.

---

## 2. Qué mejoras trae `master` v1.3.0 (si la PC está atrasada)

| Versión | Mejora |
|---|---|
| **1.1.0** | Número de versión visible y botón **🔄 Actualizar** dentro de RESTA. `ACTUALIZAR.bat` con copia `.bak` |
| **1.2.0** | El **logo vuelve a salir** en el ticket térmico. Comanda al doble de tamaño. **Arreglo del `¡`** que se imprimía como carácter chino. Sin fecha ni ruta `file://` en el papel |
| **1.2.1** | El nombre de la mesa, grande, arriba y al pie de la comanda |
| **1.3.0** | Sección **🆕 Nuevo · aún sin enviar** separada de lo ya pedido; botón **«Enviar a barra/cocina · N nuevos»** en ámbar |

Actualizar a esto es **seguro y reversible**: sólo cambia el archivo del programa,
los datos siguen en el navegador. Es el paso recomendado hoy.

---

## 3. Qué trae la v2 (lo que de verdad cambia el negocio)

**El problema que resuelve:** hoy todas las ventas, productos y cortes viven en el
`localStorage` de Chrome. Si alguien limpia el historial, cambia de perfil de Chrome
o se corrompe el JSON a media escritura, **se pierde todo de golpe**. No hay red.

La v2 mueve todo a una base **SQLite en `C:\RESTA\resta.db`**, fuera de la carpeta
del programa, con transacciones y respaldos propios.

Además:

- **Tablets para los meseros** por WiFi, emparejadas con un QR que se calcula sin internet
- **Almacén**: entradas, salidas, mermas, conteo, semáforo de existencias y lista de compras
- **Usuarios con PIN**: queda escrito quién anotó, quién canceló y quién dio cortesía
- **Turnos, propinas, descuentos y cancelaciones con motivo**
- **Corte completo**, no sólo los diez productos de arriba
- **Importar la carta desde Excel o CSV**
- **Cancelar una cuenta descuenta del almacén como merma**, para que el inventario cuadre
- **330 pruebas automáticas** sobre los cálculos de dinero (verifiqué que pasan)
- El instalador **abre solo el puerto del firewall** para las tablets y deja RESTA
  arrancando al prender la laptop

El instalador está en:
`https://github.com/endoferrari/RESTA/releases/tag/v2.0.2`
(`RESTA-Setup-2.0.2.exe`, 108 MB, con **0 descargas**: nunca se ha instalado en el bar).

---

## 4. Los datos: qué se conserva y qué no

### Con la v1.3.0 (actualizar `master`) — **no se pierde nada**

`RESTA.html` es sólo el programa; **no contiene ni un dato**. Familias, productos,
precios, cuentas abiertas, tickets, cortes, turno, logo y configuración de la
impresora viven todos en `localStorage['resta_datos_v1']` del navegador, más las
copias por turno en `C:\RESTA\Respaldos`.

La única forma de perder algo es si **alguien editó a mano el código** de
`C:\RESTA\RESTA.html` (precios metidos en el código, textos, menú). El script
`2-COMPARAR-CON-GITHUB.bat` detecta exactamente eso antes de tocar nada.

### Con la v2 — **⚠️ atención aquí**

El importador (`v2/datos/importar-v1.js`) toma el respaldo `.json` de la v1 y trae:

- ✅ Toda la carta: familias, productos, precios, iconos y submenús
- ✅ La configuración: nombre del negocio, logo del ticket, pie, ancho de papel
- ✅ Se puede importar dos veces sin duplicar nada; un producto con un dato raro
  no detiene la importación, se salta y se reporta por nombre

y **NO trae**:

- ❌ **El historial de ventas (tickets) y las cuentas abiertas.** El propio código lo
  dice: *"Las ventas y cuentas viejas TODAVÍA NO se importan: sus tablas se
  construyen en la fase 4. Aquí sólo se cuentan y se avisa."*

**Qué significa en la práctica:** al migrar, el corte histórico de la v1 **no pasa**
a la v2. No se borra —sigue en el respaldo `.json` y en Chrome— pero la v2 empieza
su contabilidad desde cero. Por eso la migración debe hacerse **con la caja cerrada
y el corte del día impreso**, nunca a media noche de sábado.

### Lo bueno: instalar la v2 no borra la v1

Revisé el instalador (`v2/escritorio/instalador.nsh`) línea por línea:

- Sobre `C:\RESTA` sólo hace `CreateDirectory` — **crea si no existe, nunca borra**
- Al **desinstalar** dice explícitamente: *"...pero NUNCA borramos `C:\RESTA`"*
- El `RESTA.html` de la v1 y la carpeta `Respaldos` **se quedan donde están**

Detalles menores a tener en cuenta:

- La v1 usa `C:\RESTA\Respaldos` y la v2 usa `C:\RESTA\respaldos`. En Windows es la
  **misma carpeta** (no distingue mayúsculas). No se pisan archivos, pero quedarán
  mezcladas las copias de las dos versiones.
- El instalador deja RESTA arrancando **al prender la laptop** y abre el puerto 8080.
- Las dos versiones no deben imprimir a la vez en la misma térmica.

---

## 5. Riesgos detectados en el repositorio

### ⚠️ La rama `v2` salió del primer commit

`v2` no nació de `master`, nació del commit inicial del 2 de julio. Por eso el
`RESTA.html` de la raíz en esa rama es **el prototipo viejo de 1 179 líneas**, sin
logo, sin comanda y sin agente de impresión; y `version.json`, `ACTUALIZAR.bat`,
`INSTALAR.bat` y `agente-impresion.ps1` están **borrados** en ella.

**Nunca fusiones `v2` dentro de `master`.** Si eso pasa:

- `version.json` desaparece → el botón **🔄 Actualizar** de todas las PCs queda
  dando error para siempre
- `ACTUALIZAR.bat` bajaría el prototipo viejo (por suerte lo rechazaría: comprueba
  que el archivo contenga `APP_VERSION`, y el prototipo no lo tiene — pero es
  suerte, no diseño)

La v2 se entrega por **Releases con su instalador**, no fusionando ramas.
`master` debe seguir siendo la línea de la v1 mientras el bar la use.

### ⚠️ `ACTUALIZAR.bat` no compara versiones

Baja `master/RESTA.html` y lo instala sin mirar si es más nuevo o más viejo que lo
que ya hay. Sólo comprueba que el archivo parezca RESTA. Si `master` retrocediera,
el `.bat` instalaría el retroceso. Guarda `.bak`, así que se puede volver atrás.

### Rama `claude/read-repo-file-c3xqmy`

Es del 3 de julio y está **por detrás** de `master` (le faltan `SUBIR-CAMBIOS.bat`,
`version.json` y el agente de impresión). No aporta nada; se puede ignorar o borrar.

---

## 6. Recomendación

**Hoy — sin riesgo:**

1. `PRUEBAS\1-RESPALDO-TOTAL.bat` → respaldo completo al Escritorio.
2. `PRUEBAS\2-COMPARAR-CON-GITHUB.bat` → saber si la PC está atrasada y, sobre todo,
   si alguien editó el archivo a mano.
3. Si está atrasada: `PRUEBAS\3-PROBAR-VERSION-NUEVA.bat`, probar con datos reales
   en un entorno aislado, y sólo entonces el botón **🔄 Actualizar** en producción.

**Más adelante — decisión aparte, con fecha:**

4. Probar la **v2.0.2** en **otra computadora**, no en la del bar: instalador de las
   Releases, importar el respaldo `.json` de la v1, y trabajar un servicio completo
   de prueba con la térmica y una tablet.
5. Si convence, migrar un día de cierre: corte impreso, caja en ceros, respaldo
   guardado, y la v1 se deja instalada un par de semanas como red de seguridad.

**Lo que no hay que hacer:** instalar la v2 encima de la laptop del bar "a ver qué tal",
ni fusionar `v2` con `master`.
