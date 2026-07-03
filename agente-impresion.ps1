# ============================================================
#  AGENTE DE IMPRESION RESTA - ONCE Social Lounge
#  Imprime tickets ESC/POS RAW directo a la miniprinter termica,
#  sin pasar por el renderizado de Chrome ni de Windows.
#  RESTA le manda el ticket por http://127.0.0.1:9100/print
# ============================================================
$ErrorActionPreference = 'Continue'
$PUERTO    = 9100
$IMPRESORA = 'POSPrinter POS80'   # nombre exacto de la impresora en Windows
$LOG       = 'C:\RESTA\agente.log'
function Registrar($msg){ try { Add-Content -Path $LOG -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -Encoding UTF8 } catch {} }
Registrar "=== Agente iniciado (puerto $PUERTO) ==="

# ---- Envio RAW al spooler (datatype RAW = pasa los bytes tal cual) ----
if(-not ('RawPrinter' -as [type])){
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static string Send(string printer, byte[] bytes) {
    IntPtr h; var di = new DOCINFO(); di.pDocName="RESTA ticket"; di.pDataType="RAW";
    if(!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERR OpenPrinter="+Marshal.GetLastWin32Error();
    string r="OK";
    if(StartDocPrinter(h,1,ref di)){
      if(StartPagePrinter(h)){
        IntPtr p=Marshal.AllocCoTaskMem(bytes.Length); Marshal.Copy(bytes,0,p,bytes.Length);
        int w; if(!WritePrinter(h,p,bytes.Length,out w)) r="ERR WritePrinter="+Marshal.GetLastWin32Error();
        Marshal.FreeCoTaskMem(p); EndPagePrinter(h);
      } else r="ERR StartPage="+Marshal.GetLastWin32Error();
      EndDocPrinter(h);
    } else r="ERR StartDoc="+Marshal.GetLastWin32Error();
    ClosePrinter(h); return r;
  }
}
"@
}

# ---- Se asegura de que la impresora no este "sin conexion" ----
function Asegurar-EnLinea($nombre){
  try {
    $pr = Get-CimInstance Win32_Printer -Filter "Name='$nombre'" -ErrorAction Stop
    if($pr -and $pr.WorkOffline){ $pr.WorkOffline = $false; Set-CimInstance -InputObject $pr -ErrorAction SilentlyContinue }
  } catch {}
}

# ---- Respuesta HTTP minima (con cabeceras CORS para que RESTA en Chrome pueda llamar) ----
function Responder($stream, $codigo, $cuerpo, $tipo){
  if($null -eq $cuerpo){ $cuerpo = '' }
  $cbytes = [System.Text.Encoding]::UTF8.GetBytes($cuerpo)
  $cab = "HTTP/1.1 $codigo`r`n" +
         "Access-Control-Allow-Origin: *`r`n" +
         "Access-Control-Allow-Methods: POST, GET, OPTIONS`r`n" +
         "Access-Control-Allow-Headers: Content-Type`r`n" +
         "Access-Control-Allow-Private-Network: true`r`n" +
         "Content-Type: $tipo`r`n" +
         "Content-Length: $($cbytes.Length)`r`n" +
         "Connection: close`r`n`r`n"
  $hbytes = [System.Text.Encoding]::ASCII.GetBytes($cab)
  $stream.Write($hbytes,0,$hbytes.Length)
  if($cbytes.Length -gt 0){ $stream.Write($cbytes,0,$cbytes.Length) }
  $stream.Flush()
}

# ---- Lee toda la peticion (cabeceras + cuerpo segun Content-Length) ----
function Leer-Peticion($stream){
  $datos = New-Object System.Collections.Generic.List[byte]
  $buf = New-Object byte[] 8192
  $finCab = -1; $largo = -1
  while($true){
    $n = $stream.Read($buf, 0, $buf.Length)
    if($n -le 0){ break }
    for($i=0; $i -lt $n; $i++){ $datos.Add($buf[$i]) }
    if($finCab -lt 0){
      for($j=3; $j -lt $datos.Count; $j++){
        if($datos[$j-3] -eq 13 -and $datos[$j-2] -eq 10 -and $datos[$j-1] -eq 13 -and $datos[$j] -eq 10){ $finCab = $j; break }
      }
      if($finCab -ge 0){
        $cabTxt = [System.Text.Encoding]::ASCII.GetString($datos.ToArray(), 0, $finCab + 1)
        $m = [regex]::Match($cabTxt, '(?im)^Content-Length:\s*(\d+)')
        if($m.Success){ $largo = [int]$m.Groups[1].Value } else { $largo = 0 }
      }
    }
    if($finCab -ge 0){
      $tieneCuerpo = $datos.Count - ($finCab + 1)
      if($tieneCuerpo -ge $largo){ break }
    }
  }
  if($finCab -lt 0){ return $null }
  $cabTxt  = [System.Text.Encoding]::ASCII.GetString($datos.ToArray(), 0, $finCab + 1)
  $cuerpo  = ''
  if($largo -gt 0){ $cuerpo = [System.Text.Encoding]::ASCII.GetString($datos.ToArray(), $finCab + 1, $largo) }
  return @{ Cabecera = $cabTxt; Cuerpo = $cuerpo }
}

# ---- Arranca el servidor local ----
try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $PUERTO)
  $listener.Start()
} catch {
  # Si el puerto ya esta ocupado, seguramente el agente ya corre: salir en silencio.
  exit 0
}

while($true){
  try {
    $cliente = $listener.AcceptTcpClient()
    $stream  = $cliente.GetStream()
    $pet = Leer-Peticion $stream
    if($null -eq $pet){ $stream.Close(); $cliente.Close(); continue }

    $linea1 = ($pet.Cabecera -split "`r`n")[0]
    $partes = $linea1 -split ' '
    $metodo = $partes[0]
    $ruta   = if($partes.Count -ge 2){ $partes[1] } else { '/' }
    $rutaSola = ($ruta -split '\?')[0]

    if($metodo -eq 'OPTIONS'){
      Responder $stream '204 No Content' '' 'text/plain'
    }
    elseif($metodo -eq 'GET' -and $rutaSola -eq '/ping'){
      Registrar 'PING (RESTA comprobo el agente)'
      Responder $stream '200 OK' 'RESTA-PRINT-AGENT' 'text/plain'
    }
    elseif($metodo -eq 'POST' -and $rutaSola -eq '/print'){
      try {
        $bytes = [Convert]::FromBase64String($pet.Cuerpo.Trim())
        Asegurar-EnLinea $IMPRESORA
        $r = [RawPrinter]::Send($IMPRESORA, $bytes)
        Registrar ("PRINT $($bytes.Length) bytes -> $r")
        if($r -eq 'OK'){ Responder $stream '200 OK' 'OK' 'text/plain' }
        else { Responder $stream '500 Internal Server Error' $r 'text/plain' }
      } catch {
        Registrar ("PRINT ERROR: " + $_.Exception.Message)
        Responder $stream '500 Internal Server Error' ("ERR: " + $_.Exception.Message) 'text/plain'
      }
    }
    else {
      Responder $stream '404 Not Found' 'no' 'text/plain'
    }
    $stream.Close(); $cliente.Close()
  } catch {
    # una peticion mala no debe tumbar el agente
    try { $stream.Close(); $cliente.Close() } catch {}
  }
}
