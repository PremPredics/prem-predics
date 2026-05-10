param(
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$Listener.Start()

Write-Host "Prem Predics dev server: http://127.0.0.1:$Port/login.html"
Write-Host "Leave this PowerShell window open while testing. Press Ctrl+C to stop."

function Get-ContentType($Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.js' { 'text/javascript; charset=utf-8' }
    '.css' { 'text/css; charset=utf-8' }
    '.png' { 'image/png' }
    '.jpg' { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.svg' { 'image/svg+xml' }
    default { 'application/octet-stream' }
  }
}

function Send-Response($Stream, [int]$Status, [string]$StatusText, [byte[]]$Body, [string]$ContentType) {
  $Header = "HTTP/1.1 $Status $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $HeaderBytes = [System.Text.Encoding]::UTF8.GetBytes($Header)
  try {
    $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
    if ($Body.Length -gt 0) {
      $Stream.Write($Body, 0, $Body.Length)
    }
  }
  catch [System.IO.IOException] {
    # Browsers can cancel a request during refresh/navigation; keep the server alive.
  }
}

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    $Stream = $Client.GetStream()

    try {
      $Buffer = New-Object byte[] 8192
      $Read = $Stream.Read($Buffer, 0, $Buffer.Length)
      if ($Read -le 0) {
        continue
      }

      $Request = [System.Text.Encoding]::ASCII.GetString($Buffer, 0, $Read)
      $FirstLine = ($Request -split "`r?`n")[0]
      $Parts = $FirstLine -split ' '
      $UrlPath = if ($Parts.Length -ge 2) { $Parts[1] } else { '/' }
      $UrlPath = ($UrlPath -split '\?')[0]
      $UrlPath = [System.Uri]::UnescapeDataString($UrlPath)
      if ($UrlPath -eq '/') {
        $UrlPath = '/index.html'
      }

      $RelativePath = $UrlPath.TrimStart('/') -replace '/', [System.IO.Path]::DirectorySeparatorChar
      $FilePath = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))

      if (-not $FilePath.StartsWith($Root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        Send-Response $Stream 403 'Forbidden' $Body 'text/plain; charset=utf-8'
        continue
      }

      if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        Send-Response $Stream 404 'Not Found' $Body 'text/plain; charset=utf-8'
        continue
      }

      $BodyBytes = [System.IO.File]::ReadAllBytes($FilePath)
      Send-Response $Stream 200 'OK' $BodyBytes (Get-ContentType $FilePath)
    }
    finally {
      $Stream.Close()
      $Client.Close()
    }
  }
}
finally {
  $Listener.Stop()
}
