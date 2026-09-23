$ErrorActionPreference = 'Stop'
$imageRepo = Split-Path -Parent $PSScriptRoot
$imageEnv = Join-Path $imageRepo '.local/worker.env'
Write-Host 'OpenAI 이미지 API 키를 이 PC의 .local/worker.env에 저장합니다. 입력은 표시하지 않습니다.'
Write-Host '이미지를 생성하거나 결제를 실행하지 않습니다. 적용하려면 처리기를 다시 시작해야 합니다.'
$imageSecret = Read-Host 'OpenAI API key' -AsSecureString
$imagePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($imageSecret)
try {
  $imageValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($imagePointer)
  if ($imageValue -notmatch '^sk-[A-Za-z0-9_-]{20,}$') { throw 'API 키 형식을 확인해 주세요. 파일은 변경하지 않았습니다.' }
  $imageLines = if (Test-Path -LiteralPath $imageEnv) { @(Get-Content -LiteralPath $imageEnv | Where-Object { $_ -notmatch '^\s*OPENAI_API_KEY\s*=' }) } else { @() }
  [IO.Directory]::CreateDirectory((Split-Path -Parent $imageEnv)) | Out-Null
  [IO.File]::WriteAllLines($imageEnv, @($imageLines) + "OPENAI_API_KEY=$imageValue", [Text.UTF8Encoding]::new($false))
  Write-Host '저장 완료. 키를 출력하지 않았습니다. 처리기를 재시작한 뒤 사이트에서 OpenAI를 선택하세요.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($imagePointer)
  $imageValue = $null
  $imageSecret.Dispose()
}
