$path = "src\features\admin\pages\AdminCitasPreviewPage.jsx"
$lines = [IO.File]::ReadAllLines($path, [Text.Encoding]::UTF8)
Write-Output ("Total lines: " + $lines.Length)

# Print lines 1263-1300 (0-indexed: 1262-1299)
for ($i = 1262; $i -lt [Math]::Min(1300, $lines.Length); $i++) {
    Write-Output (($i + 1).ToString() + ": " + $lines[$i])
}
