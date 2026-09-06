$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = $PWD.Path }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8123/")
$listener.Start()
Write-Host "Serving $root on http://127.0.0.1:8123/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $root ($path.TrimStart("/").Replace("/", "\"))
  if (Test-Path $file) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $ct = switch ($ext) {
      ".html" { "text/html" } ".css" { "text/css" } ".js" { "application/javascript" }
      ".jpg" { "image/jpeg" } ".png" { "image/png" } ".svg" { "image/svg+xml" }
      ".woff2" { "font/woff2" } default { "application/octet-stream" }
    }
    $ctx.Response.ContentType = $ct
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $body = [Text.Encoding]::UTF8.GetBytes("404")
    $ctx.Response.OutputStream.Write($body, 0, $body.Length)
  }
  $ctx.Response.Close()
}
