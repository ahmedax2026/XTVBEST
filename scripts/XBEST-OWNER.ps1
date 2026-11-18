param(
    [string]$Executable = (Join-Path $PSScriptRoot 'XBEST.exe'),
    [string]$DataDirectory = (Join-Path $env:APPDATA 'XBEST-OWNER')
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
    if (-not (Test-Path -LiteralPath $Executable)) {
        throw 'لم يتم العثور على XBEST.exe بجوار ملف تشغيل الأونر.'
    }
    $Executable = (Resolve-Path -LiteralPath $Executable).Path
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    $credentialsFile = Join-Path $DataDirectory 'owner.credentials.xml'
    if (-not $env:TUNARR_BASIC_AUTH_USER -or -not $env:TUNARR_BASIC_AUTH_PASSWORD) {
        if (Test-Path -LiteralPath $credentialsFile) {
            $credentials = Import-Clixml -LiteralPath $credentialsFile
            if ($credentials -isnot [System.Management.Automation.PSCredential]) {
                throw 'ملف بيانات الأونر غير صالح.'
            }
        } else {
            Write-Host 'تجهيز حساب مالك XBEST لأول مرة'
            $username = Read-Host 'الإيميل أو اسم دخول الأونر'
            if ([string]::IsNullOrWhiteSpace($username) -or $username -match '[:\s]') {
                throw 'أدخل إيميلًا أو اسم مستخدم دون مسافات أو علامة النقطتين.'
            }
            $secret = Read-Host 'كلمة السر: 12 حرفًا على الأقل' -AsSecureString
            if ($secret.Length -lt 12) { throw 'كلمة السر يجب أن تكون 12 حرفًا على الأقل.' }
            $credentials = [System.Management.Automation.PSCredential]::new($username, $secret)
            $credentials | Export-Clixml -LiteralPath $credentialsFile
            Write-Host 'تم حفظ بيانات الدخول مشفرة لحساب ويندوز الحالي.'
        }
        $env:TUNARR_BASIC_AUTH_USER = $credentials.UserName
        $env:TUNARR_BASIC_AUTH_PASSWORD = $credentials.GetNetworkCredential().Password
    }
    $env:TUNARR_DATABASE_PATH = $DataDirectory
    $env:XBEST_LICENSE_ISSUER = '1'
    $env:XBEST_OWNER_ADMIN_ONLY = '1'
    $env:XBEST_AUTOSTART = '1'
    Write-Host 'جارٍ تشغيل لوحة الأونر والحسابات والليسانسات...'
    Push-Location -LiteralPath (Split-Path -Parent $Executable)
    try {
        & $Executable
        if ($LASTEXITCODE -ne 0) { throw "تعذر تشغيل الأونر. رمز الخطأ: $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error $_
    exit 1
} finally {
    Remove-Item Env:TUNARR_BASIC_AUTH_USER -ErrorAction SilentlyContinue
    Remove-Item Env:TUNARR_BASIC_AUTH_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:XBEST_LICENSE_ISSUER -ErrorAction SilentlyContinue
    Remove-Item Env:XBEST_OWNER_ADMIN_ONLY -ErrorAction SilentlyContinue
}
