$path = "C:\Users\A.r.r.a.y.19\fremio\studio\src\app\(booth)\b\[slug]\screens\CameraScreen.tsx"
$content = [System.IO.File]::ReadAllText($path)

# Find the arm-capture section by looking for "count === cd"
$idx = $content.IndexOf("if (count === cd)")
if ($idx -ge 0) {
    # Find the next "count === 1" block
    $idx1 = $content.IndexOf("if (count === 1)", $idx)
    if ($idx1 -ge 0) {
        # Find the start of this tick block
        $startIdx = $content.LastIndexOf("setCountdown(count)", $idx1) + "setCountdown(count)".Length
        $beforeTick = $content.Substring(0, $startIdx)

        # Find everything from after setCountdown(count) to end of count>0 block
        $afterSet = $content.Substring($startIdx)
        $blockEnd = $afterSet.IndexOf("countdownTimerRef.current = setTimeout(tick, 1000)")
        if ($blockEnd -ge 0) {
            $middle = $afterSet.Substring(0, $blockEnd + "countdownTimerRef.current = setTimeout(tick, 1000)".Length)
            $rest = $afterSet.Substring($blockEnd + "countdownTimerRef.current = setTimeout(tick, 1000)".Length)

            $newMiddle = '        // DSLR pre-arm was already fired in startCountdown (before countdown started).
        // The bridge now has the full countdown to become ready.
        // Shot fires at count=1.
        if (willUseAgentCapture) {
          if (count === 1) {
            // Shot fires when countdown reaches 1 (after cd→cd-1→...→1).
            // Live video stays up through the entire countdown.
            captureInProgressRef.current = true;

            // Fire immediately — no setTimeout delay.
            // This minimizes lag between the visible "1" and the actual shot.
            setCountdown(null);
            setCapturePhase("filler");
            captureAndDisplay();
            return; // done with timer
          }
        }
        countdownTimerRef.current = setTimeout(tick, 1000);'

            $newContent = $beforeTick + $newMiddle + $rest
            [System.IO.File]::WriteAllText($path, $newContent, [System.Text.Encoding]::UTF8)
            Write-Host "Replaced OK, path: $path"
        } else {
            Write-Host "Could not find block end"
        }
    } else {
        Write-Host "Could not find count===1"
    }
} else {
    Write-Host "Could not find count===cd"
}