$ErrorActionPreference = 'Stop'
$atlasUtf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $atlasUtf8
$OutputEncoding = $atlasUtf8
$atlasRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $atlasRoot
$atlasNode = (Get-Command node -ErrorAction Stop).Source
& $atlasNode '--env-file=.env.local' '--env-file=.local/worker.env' '--import' 'tsx' 'scripts/sync-personal-social.ts' '--if-due' >> (Join-Path $atlasRoot '.local/personal-social.log') 2>&1
exit $LASTEXITCODE
