$ErrorActionPreference = 'Stop'
$atlasRoot = Split-Path $PSScriptRoot -Parent
$atlasNode = (Get-Command node -ErrorAction Stop).Source
$atlasLock = Join-Path $atlasRoot '.local/worker.lock'
if (Test-Path -LiteralPath $atlasLock) {
  $atlasExisting = Get-Content -LiteralPath $atlasLock -Raw | ConvertFrom-Json
  if (Get-Process -Id $atlasExisting.pid -ErrorAction SilentlyContinue) { exit 0 }
}
$atlasOllama = Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe'
try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 }
catch {
  if (-not (Test-Path -LiteralPath $atlasOllama)) { throw 'Install Ollama before starting AI Atlas.' }
  Start-Process -FilePath $atlasOllama -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 3
}
$atlasArguments = @('--env-file=.env.local', '--env-file=.local/worker.env', '--import', 'tsx', 'scripts/local-worker.ts', '--watch')
$atlasProcess = Start-Process -FilePath $atlasNode -ArgumentList $atlasArguments -WorkingDirectory $atlasRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $atlasRoot '.local/worker.log') -RedirectStandardError (Join-Path $atlasRoot '.local/worker-error.log') -Wait -PassThru
exit $atlasProcess.ExitCode
