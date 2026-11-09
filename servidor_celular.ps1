# =====================================================================
# CONTROLE FINANCEIRO FAMILIAR - SERVIDOR WI-FI PARA CELULAR
# =====================================================================

param([int]$porta = 8080)

$ErrorActionPreference = 'SilentlyContinue'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path

# Detecta o IP local IPv4 na rede Wi-Fi da casa
$ip = (ipconfig | Select-String -Pattern 'IPv4' | ForEach-Object { ($_ -split ':')[-1].Trim() } | Where-Object { $_ -like '192.168*' -or $_ -like '10.*' -or $_ -like '172.*' } | Select-Object -First 1)
if (-not $ip) { $ip = '192.168.0.103' }

$url = "http://$($ip):$porta"

Clear-Host
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       CONTROLE FINANCEIRO DA FAMILIA - ACESSO PELO CELULAR           " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [OK] Servidor iniciado com sucesso na sua rede local!" -ForegroundColor Green
Write-Host ""
Write-Host "  COMO VOCE E SUA ESPOSA DEVEM ABRIR NO CELULAR:" -ForegroundColor White
Write-Host "  1. Certifique-se de que os celulares estao conectados no mesmo Wi-Fi deste PC." -ForegroundColor Gray
Write-Host "  2. No celular da sua esposa (e no seu), abra o navegador (Chrome ou Safari) e digite:" -ForegroundColor Gray
Write-Host ""
Write-Host "        $url" -ForegroundColor Yellow -BackgroundColor DarkGreen
Write-Host ""
Write-Host "  DICA PARA CELULAR:" -ForegroundColor Cyan
Write-Host "  - No iPhone (Safari): Toque em Compartilhar -> 'Adicionar a Tela de Inicio'" -ForegroundColor Gray
Write-Host "  - No Android (Chrome): Toque nos 3 pontinhos -> 'Instalar aplicativo' ou 'Adicionar a tela inicial'" -ForegroundColor Gray
Write-Host "  O sistema funcionara como um aplicativo completo no celular de voces!" -ForegroundColor Gray
Write-Host ""
Write-Host "  (Para encerrar o servidor, basta fechar esta janela a qualquer momento)" -ForegroundColor DarkGray
Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan

# Inicia o servidor HTTP nativo
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $porta)
try {
    $listener.Start()
} catch {
    Write-Host "Porta $porta ocupada, tentando porta 8081..." -ForegroundColor Yellow
    $porta = 8081
    $url = "http://$($ip):$porta"
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $porta)
    $listener.Start()
}

# Tenta abrir o navegador do computador tambem
Start-Process "http://localhost:$porta"

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $reqLine = $reader.ReadLine()
        
        if ($reqLine) {
            $parts = $reqLine.Split(' ')
            $path = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
            $cleanPath = $path.Split('?')[0].TrimStart('/')
            
            $filePath = if ([string]::IsNullOrWhiteSpace($cleanPath) -or $cleanPath -eq '/') {
                Join-Path $pasta "index.html"
            } else {
                Join-Path $pasta $cleanPath
            }
            
            if (-not (Test-Path $filePath)) {
                $filePath = Join-Path $pasta "controle_financeiro_publico.html"
            }
            
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".htm"  { "text/html; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }
                
                $headerStr = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
            } else {
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("<h1>Arquivo nao encontrado</h1>")
                $headerStr = "HTTP/1.1 404 Not Found`r`nContent-Type: text/html`r`nContent-Length: $($notFound.Length)`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($notFound, 0, $notFound.Length)
            }
            $stream.Flush()
        }
        $client.Close()
    } catch {
        # Continua o loop
    }
}
