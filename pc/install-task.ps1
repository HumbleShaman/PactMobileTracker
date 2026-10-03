# Registers the Windows scheduled task that starts the collector on GitHub every
# 5 minutes while this PC is on (see trigger.pyw). Safe to re-run; it replaces
# the existing task.
#
# Remove it with:
#   Unregister-ScheduledTask -TaskName 'PactMobileTracker collector' -Confirm:$false

$ErrorActionPreference = 'Stop'
$taskName = 'PactMobileTracker collector'

# Prefer a real Python install over the Microsoft Store alias.
$pyw = Get-Command pythonw.exe -All |
	Where-Object { $_.Source -notlike '*\WindowsApps\*' } |
	Select-Object -First 1 -ExpandProperty Source
if (-not $pyw) { throw 'pythonw.exe not found' }

$script = Join-Path $PSScriptRoot 'trigger.pyw'
$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" -WorkingDirectory $PSScriptRoot
# No -RepetitionDuration: repeats indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
	-MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force `
	-Description 'Asks GitHub to run the PactMobileTracker fee collector every 5 minutes (GitHub cron alone is too slow).' | Out-Null

$t = Get-ScheduledTask -TaskName $taskName
"Registered '$taskName' ($($t.State)); every $($t.Triggers[0].Repetition.Interval), runs $pyw"
