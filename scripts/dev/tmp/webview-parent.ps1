$target = 8020
while ($target -ne 0) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$target" -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  Write-Output ("{0}  {1}" -f $proc.ProcessId, $proc.Name)
  $target = $proc.ParentProcessId
  if ($proc.Name -eq 'tauri-chat-app.exe' -or $proc.Name -like 'explorer*') { 
    Write-Output ("parent-chain-root: {0} {1}" -f $target, $proc.Name)
    break 
  }
}
