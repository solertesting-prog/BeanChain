<#
  BeanChain · arranque en local para Windows

  Uso (desde esta carpeta):
    .\iniciar.bat                 # primera vez y siguientes
    .\iniciar.bat -ConBlockchain  # además arranca una blockchain local (Hardhat) con los contratos

  Qué hace:
    1. Comprueba Node.js 20+ y pnpm (los instala con winget/npm si faltan).
    2. Prepara PostgreSQL: con Docker Desktop si está instalado; si no, instala PostgreSQL 16 con winget.
    3. Crea los ficheros .env con secretos aleatorios (sólo la primera vez).
    4. Instala dependencias, compila los contratos, aplica migraciones y carga datos de ejemplo.
    5. Abre la API (puerto 4000) y la web (puerto 3000) en ventanas propias y lanza el navegador.
#>
param(
  [switch]$ConBlockchain
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    $t" -ForegroundColor Yellow }
function Falla($t) { Write-Host "`nERROR: $t" -ForegroundColor Red; Read-Host 'Pulsa Enter para salir'; exit 1 }
function Tiene($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefrescarPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function PuertoOcupado($p) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false }
}
function Secreto { -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }) }

# ---------------------------------------------------------------------------
Paso 'Comprobando Node.js'
if (-not (Tiene 'node')) {
  if (-not (Tiene 'winget')) { Falla 'No encuentro Node.js ni winget. Instala Node.js 22 LTS desde https://nodejs.org y vuelve a ejecutar.' }
  Aviso 'Instalando Node.js LTS con winget…'
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent | Out-Host
  RefrescarPath
  if (-not (Tiene 'node')) { Falla 'Node.js se ha instalado pero esta ventana no lo ve. Cierra y vuelve a ejecutar iniciar.bat.' }
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Falla "Tienes Node.js $(node --version). Necesitas la versión 20 o superior (https://nodejs.org)." }
Write-Host "    Node.js $(node --version)"

Paso 'Comprobando pnpm'
if (-not (Tiene 'pnpm')) {
  Aviso 'Instalando pnpm…'
  npm install -g pnpm@10 | Out-Host
  RefrescarPath
  if (-not (Tiene 'pnpm')) { Falla 'No se ha podido instalar pnpm. Prueba a ejecutar: npm install -g pnpm' }
}
Write-Host "    pnpm $(pnpm --version)"

# ---------------------------------------------------------------------------
Paso 'Preparando PostgreSQL'
$DbPort = 5432
$DbUrl = $null
$dockerOk = $false
if (Tiene 'docker') {
  docker info *> $null
  $dockerOk = ($LASTEXITCODE -eq 0)
  if (-not $dockerOk) { Aviso 'Docker está instalado pero no arrancado. Abre Docker Desktop si prefieres usarlo; sigo sin él.' }
}

if ($dockerOk) {
  $running = docker ps --filter 'name=beanchain-postgres' --format '{{.Names}}'
  if (-not $running) {
    $exists = docker ps -a --filter 'name=beanchain-postgres' --format '{{.Names}}'
    if ($exists) {
      docker start beanchain-postgres | Out-Null
    } else {
      if (PuertoOcupado 5432) { $DbPort = 5433; Aviso 'El puerto 5432 está ocupado; uso el 5433.' }
      docker run -d --name beanchain-postgres -e POSTGRES_USER=beanchain -e POSTGRES_PASSWORD=beanchain -e POSTGRES_DB=beanchain `
        -p "${DbPort}:5432" -v beanchain-pgdata:/var/lib/postgresql/data postgres:16-alpine | Out-Null
    }
  }
  $DbPort = [int]((docker port beanchain-postgres 5432/tcp | Select-Object -First 1).Split(':')[-1])
  Write-Host "    PostgreSQL en Docker (puerto $DbPort)"
  for ($i = 0; $i -lt 30; $i++) {
    docker exec beanchain-postgres pg_isready -U beanchain *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 1
  }
  $DbUrl = "postgresql://beanchain:beanchain@localhost:$DbPort/beanchain?schema=public"
} else {
  # PostgreSQL nativo
  $pgBin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $pgBin) {
    if (-not (Tiene 'winget')) { Falla 'No hay Docker ni PostgreSQL ni winget. Instala Docker Desktop (https://www.docker.com/products/docker-desktop) y vuelve a ejecutar.' }
    Aviso 'Instalando PostgreSQL 16 con winget (puede tardar unos minutos y pedir permisos de administrador)…'
    winget install --id PostgreSQL.PostgreSQL.16 -e --accept-source-agreements --accept-package-agreements `
      --override '--mode unattended --unattendedmodeui minimal --superpassword beanchain --serverport 5432' | Out-Host
    $pgBin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $pgBin) { Falla 'No se ha podido instalar PostgreSQL. Instala Docker Desktop o PostgreSQL 16 a mano y vuelve a ejecutar.' }
    $env:PGPASSWORD = 'beanchain'
  } else {
    if (-not $env:PGPASSWORD) {
      $sec = Read-Host 'Contraseña del usuario "postgres" de tu PostgreSQL' -AsSecureString
      $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    }
  }
  $psql = $pgBin.FullName
  & $psql -h localhost -U postgres -d postgres -tAc "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='beanchain') THEN CREATE ROLE beanchain LOGIN PASSWORD 'beanchain' CREATEDB; END IF; END `$`$;" | Out-Null
  if ($LASTEXITCODE -ne 0) { Falla 'No me puedo conectar a PostgreSQL con el usuario postgres. Revisa la contraseña.' }
  $hasDb = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='beanchain'"
  if (-not $hasDb) { & $psql -h localhost -U postgres -d postgres -c 'CREATE DATABASE beanchain OWNER beanchain' | Out-Null }
  Write-Host '    PostgreSQL nativo (puerto 5432)'
  $DbUrl = 'postgresql://beanchain:beanchain@localhost:5432/beanchain?schema=public'
}

# ---------------------------------------------------------------------------
Paso 'Configurando variables de entorno'
$apiEnv = Join-Path $Root 'apps\api\.env'
if (-not (Test-Path $apiEnv)) {
  $c = Get-Content (Join-Path $Root 'apps\api\.env.example') -Raw
  $c = $c -replace 'DATABASE_URL=.*', "DATABASE_URL=$DbUrl"
  $c = $c -replace 'JWT_ACCESS_SECRET=.*', "JWT_ACCESS_SECRET=$(Secreto)"
  $c = $c -replace 'JWT_REFRESH_SECRET=.*', "JWT_REFRESH_SECRET=$(Secreto)"
  $c = $c -replace 'APP_ENCRYPTION_KEY=.*', "APP_ENCRYPTION_KEY=$(Secreto)"
  $c = $c -replace 'SEED_ADMIN_PASSWORD=.*', 'SEED_ADMIN_PASSWORD=BeanChain2026!'
  Set-Content -Path $apiEnv -Value $c -Encoding UTF8
  Write-Host '    Creado apps\api\.env'
} else {
  (Get-Content $apiEnv) -replace '^DATABASE_URL=.*', "DATABASE_URL=$DbUrl" | Set-Content $apiEnv -Encoding UTF8
}
$webEnv = Join-Path $Root 'apps\web\.env.local'
if (-not (Test-Path $webEnv)) { Copy-Item (Join-Path $Root 'apps\web\.env.example') $webEnv }

# ---------------------------------------------------------------------------
Paso 'Instalando dependencias (la primera vez tarda unos minutos)'
pnpm install
if ($LASTEXITCODE -ne 0) { Falla 'Ha fallado pnpm install.' }

Paso 'Compilando los smart contracts'
pnpm --filter @beanchain/contracts build
if ($LASTEXITCODE -ne 0) { Falla 'Ha fallado la compilación de los contratos.' }

Paso 'Preparando la base de datos'
Push-Location apps\api
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; Falla 'Han fallado las migraciones.' }
npx prisma db seed
if ($LASTEXITCODE -ne 0) { Pop-Location; Falla 'Ha fallado la carga de datos de ejemplo.' }
Pop-Location

# ---------------------------------------------------------------------------
if ($ConBlockchain) {
  Paso 'Arrancando la blockchain local (Hardhat)'
  if (-not (PuertoOcupado 8545)) {
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$Root\packages\contracts'; `$Host.UI.RawUI.WindowTitle='BeanChain · blockchain'; npx hardhat node" | Out-Null
    for ($i = 0; $i -lt 40 -and -not (PuertoOcupado 8545); $i++) { Start-Sleep 1 }
  }
  Push-Location packages\contracts
  npx hardhat run scripts/deploy.ts --network localhost
  if ($LASTEXITCODE -ne 0) { Pop-Location; Falla 'Ha fallado el despliegue de los contratos.' }
  $d = Get-Content 'deployments\localhost.json' -Raw | ConvertFrom-Json
  Pop-Location
  $c = Get-Content $apiEnv
  $c = $c -replace '^BLOCKCHAIN_MODE=.*', 'BLOCKCHAIN_MODE=live'
  # Cuenta 0 de Hardhat: pública y conocida, sólo válida en la red local.
  $c = $c -replace '^OPERATOR_PRIVATE_KEY=.*', 'OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  $c = $c -replace '^IDENTITY_REGISTRY_ADDRESS=.*', "IDENTITY_REGISTRY_ADDRESS=$($d.identityRegistry)"
  $c = $c -replace '^DOCUMENT_REGISTRY_ADDRESS=.*', "DOCUMENT_REGISTRY_ADDRESS=$($d.documentRegistry)"
  $c = $c -replace '^PAYMENT_TOKEN_ADDRESS=.*', "PAYMENT_TOKEN_ADDRESS=$($d.paymentToken)"
  $c | Set-Content $apiEnv -Encoding UTF8
  Write-Host '    Contratos desplegados y API en modo blockchain real (local)'
} else {
  (Get-Content $apiEnv) -replace '^BLOCKCHAIN_MODE=.*', 'BLOCKCHAIN_MODE=simulated' | Set-Content $apiEnv -Encoding UTF8
}

# ---------------------------------------------------------------------------
Paso 'Arrancando API y web'
if (PuertoOcupado 4000) { Aviso 'Ya hay algo en el puerto 4000 (¿una API anterior?). No abro otra.' }
else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle='BeanChain · API'; pnpm --filter @beanchain/api start:dev" | Out-Null
}
if (PuertoOcupado 3000) { Aviso 'Ya hay algo en el puerto 3000. No abro otra web.' }
else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle='BeanChain · web'; pnpm --filter @beanchain/web dev" | Out-Null
}

Write-Host '    Esperando a que la web responda…'
for ($i = 0; $i -lt 120; $i++) {
  try { Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep 2 }
}
Start-Process 'http://localhost:3000'

$admin = (Select-String -Path $apiEnv -Pattern '^SEED_ADMIN_EMAIL=(.*)').Matches.Groups[1].Value
$pass = (Select-String -Path $apiEnv -Pattern '^SEED_ADMIN_PASSWORD=(.*)').Matches.Groups[1].Value
Write-Host "`n BeanChain está en marcha" -ForegroundColor Green
Write-Host '   Web:  http://localhost:3000'
Write-Host '   API:  http://localhost:4000/health'
Write-Host "   Administrador: $admin  /  $pass"
Write-Host '   Para pararlo, cierra las ventanas "BeanChain · API" y "BeanChain · web".'
Read-Host "`nPulsa Enter para cerrar esta ventana"
