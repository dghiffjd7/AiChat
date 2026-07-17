Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LineageCaptureWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@

$process = Get-Process | Where-Object { $_.MainWindowTitle -eq 'Chat App' } | Select-Object -First 1
if (-not $process) { throw 'Chat App window not found' }
$rect = New-Object LineageCaptureWin32+RECT
if (-not [LineageCaptureWin32]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) { throw 'GetWindowRect failed' }
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $output = Join-Path (Get-Location) '.codex-lineage.png'
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $output
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
