$ids = (Get-Process msedgewebview2 -ErrorAction SilentlyContinue).Id
if (-not $ids) { 'no webview2'; exit }
$samples = Get-Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 3
$total = 0; $n = 0
foreach ($s in $samples) {
  $v = ($s.CounterSamples | Where-Object {
    $inst = $_.InstanceName
    ($ids | Where-Object { $inst -like ('pid_' + $_ + '_*') }).Count -gt 0
  } | Measure-Object CookedValue -Sum).Sum
  $total += $v; $n += 1
}
'webview2 GPU avg: ' + [math]::Round($total / $n, 2) + ' %'
