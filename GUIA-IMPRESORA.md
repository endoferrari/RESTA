# Guía: XPRINTER XP-Q200II (térmica 80 mm, USB) con RESTA

Cómo dejar la miniprinter lista en una PC o laptop con **Windows 10 u 11** para que
RESTA imprima tickets y cortes directo al rollo de 80 mm.

## 1. Instalar el controlador (driver)

1. Conecta la impresora por **USB**, ponle su rollo y enciéndela.
2. Descarga el controlador oficial **«Xprinter Windows Driver»** desde la página
   de descargas de Xprinter: <https://www.xprintertech.com/download.html>
   (sirve para toda la serie, incluida la XP-Q200II).
3. Descomprime el ZIP y ejecuta **`setup.exe` como administrador**.
4. Durante la instalación elige:
   - Sistema: Windows 10 / 11
   - Modelo: **XP-Q200II**
   - Puerto: **USB**
5. Al terminar, imprime la página de prueba de Windows para confirmar
   (Configuración → Bluetooth y dispositivos → Impresoras y escáneres →
   XP-Q200II → Imprimir página de prueba).

> Si Windows no la detecta: cambia de puerto USB, usa otro cable, o reinicia el
> servicio «Cola de impresión» (`services.msc` → Print Spooler → Reiniciar).

## 2. Configurar el papel y el corte  ← EL PASO QUE EVITA QUE SALGA PAPEL DE MÁS

En **Impresoras y escáneres → tu impresora → Preferencias de impresión**:

- Tamaño de papel: **80 x 297 mm** o **80(72) x Receipt / Recibo** (rollo de 80 mm,
  área imprimible 72 mm). **Nunca Carta ni A4**: si queda en Carta/A4 o en un largo
  fijo enorme, la impresora saca papel en blanco hasta el final de la «hoja» y se
  detiene con error.
- Corte: activa **Feed & Cut** (avanza y corta al terminar cada ticket).
- Márgenes: 0 (ninguno).

Y márcala como **impresora predeterminada**.

> RESTA ya envía cada ticket con su **alto exacto** para que la impresora corte
> justo al terminar. Aun así, el driver debe estar en papel de recibo (80 mm),
> no en Carta/A4, o volverá a salir papel de más.


## 3. Que RESTA imprima directo, sin ventanas

Los navegadores muestran una ventana de impresión. Para brincártela (modo caja):

1. Crea un **acceso directo** de Chrome o Edge en el escritorio.
2. Clic derecho → Propiedades → campo **Destino**, y al final agrega un espacio y:
   `--kiosk-printing`

   Ejemplo:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing`
3. Abre **RESTA.html siempre con ese acceso directo**. Cada «Imprimir ticket»
   saldrá al instante por la impresora predeterminada, sin preguntar nada.

> La primera vez imprime uno manualmente (Ctrl+P) y deja seleccionada la
> XP-Q200II, papel 80(72), márgenes «Ninguno» y desactiva «Encabezados y pies».
> El modo kiosco reutiliza esa configuración.

## 4. El logo y los ajustes del ticket (dentro de RESTA)

En la barra lateral de RESTA → botón **«🖨️ Ticket»**:

- **Subir logo**: elige la imagen del negocio (JPG/PNG). La app la convierte a
  blanco y negro nítido, como imprime la térmica, y la pone arriba de cada ticket.
- **Ancho del rollo**: 80 mm (la XP-Q200II) o 58 mm si algún día usan otra.
- **Mensaje al pie**: el texto que sale al final del ticket.
- **Imprimir ticket de prueba**: para verificar todo sin cobrar nada.

## 5. Problemas comunes

| Problema | Solución |
|---|---|
| Imprime letras chiquitas a la izquierda | En el diálogo de impresión: papel 80(72), escala 100 %, márgenes Ninguno |
| Sale una hoja «tamaño carta» en blanco | La predeterminada no es tu térmica, o el papel del driver está en Carta/A4 (ponlo en 80 x 297 mm, paso 2) |
| **Imprime y sigue saliendo papel hasta que se detiene con error** | El papel del driver está en Carta/A4 o en un largo fijo muy grande. Cámbialo a **80 x 297 mm** o «Receipt/Recibo» (paso 2). RESTA ya manda el alto exacto del ticket. |
| No corta el papel | Activa Feed & Cut en Preferencias de impresión del controlador |
| Logo sale muy claro u oscuro | Usa una imagen con buen contraste (fondo claro, dibujo oscuro) y vuélvela a subir |
| Imprime lento o se detiene | Reinicia la Cola de impresión (Print Spooler) y usa otro puerto USB |
