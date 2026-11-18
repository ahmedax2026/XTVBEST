param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$ServerArguments
)
$ErrorActionPreference = 'Stop'
if (-not $env:TUNARR_BASIC_AUTH_USER) {
    $env:TUNARR_BASIC_AUTH_USER = Read-Host 'XBest username'
}
if (-not $env:TUNARR_BASIC_AUTH_PASSWORD) {
    $secret = Read-Host 'XBest password' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:TUNARR_BASIC_AUTH_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}
try {
    if (-not $env:TUNARR_BASIC_AUTH_USER -or -not $env:TUNARR_BASIC_AUTH_PASSWORD -or $env:TUNARR_BASIC_AUTH_USER.Contains(':')) {
        throw 'A username (without a colon) and password are required.'
    }
    & $Executable @ServerArguments
    exit $LASTEXITCODE
} finally {
    Remove-Item Env:TUNARR_BASIC_AUTH_USER -ErrorAction SilentlyContinue
    Remove-Item Env:TUNARR_BASIC_AUTH_PASSWORD -ErrorAction SilentlyContinue
}
