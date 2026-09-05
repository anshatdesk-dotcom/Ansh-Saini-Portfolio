# Minimal loopback static file server used only for local preview.
param([int]$Port = 8123)

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Output "Serving $root on http://127.0.0.1:$Port/"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $res = $context.Response
    try {
        $rel = $context.Request.Url.AbsolutePath.TrimStart('/') -replace '/', [System.IO.Path]::DirectorySeparatorChar
        if ($rel -eq '') { $rel = 'index.html' }
        $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
        # Refuse paths that escape the project root
        if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
        }
        elseif (Test-Path -LiteralPath $full -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $res.ContentType = switch ($ext) {
                '.html' { 'text/html; charset=utf-8' }
                '.css'  { 'text/css; charset=utf-8' }
                '.js'   { 'application/javascript; charset=utf-8' }
                '.svg'  { 'image/svg+xml' }
                '.png'  { 'image/png' }
                '.jpg'  { 'image/jpeg' }
                '.webp' { 'image/webp' }
                '.ico'  { 'image/x-icon' }
                default { 'application/octet-stream' }
            }
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $res.StatusCode = 404
        }
    }
    catch {
        try { $res.StatusCode = 500 } catch { }
    }
    finally {
        try { $res.Close() } catch { }
    }
}
