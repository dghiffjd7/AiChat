$procs = Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue
foreach ($p in ($procs | Sort-Object CPU -Descending)) {
  $ws = [math]::Round($p.WS/1MB)
  Write-Output ("{0}  cpu={1}  ws={2}MB  responding={3}" -f $p.Id, [math]::Round($p.CPU,1), $ws, $p.Responding)
}
