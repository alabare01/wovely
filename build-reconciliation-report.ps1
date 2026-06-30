#requires -Version 5.1
# Builds the stitch reconciliation report.
# 1. Merges chunk-NN-result.json files into stitch-screenshot-scan.json
# 2. Three-way compares scan vs extracted JSON
# 3. Emits stitch-reconciliation-report.html

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'C:\Users\adam\wovely'
$chunkDir = Join-Path $root 'scan-chunks'
$scanOut = Join-Path $root 'stitch-screenshot-scan.json'
$extractionJson = Join-Path $root 'stitch-extraction-output.json'
$reportOut = Join-Path $root 'stitch-reconciliation-report.html'

Write-Host "=== Step A: merge chunk results ===" -ForegroundColor Cyan
$chunkFiles = Get-ChildItem $chunkDir -Filter 'chunk-*-result.json' | Sort-Object Name
Write-Host "Found $($chunkFiles.Count) chunk result files"

$allScans = @()
foreach ($cf in $chunkFiles) {
    $data = Get-Content $cf.FullName -Raw | ConvertFrom-Json
    Write-Host "  $($cf.Name): $($data.Count) entries"
    $allScans += $data
}
Write-Host "Total scan entries: $($allScans.Count)"

$allScans | ConvertTo-Json -Depth 5 | Out-File $scanOut -Encoding utf8
Write-Host "Wrote $scanOut"

Write-Host "`n=== Step B: load extraction JSON ===" -ForegroundColor Cyan
$extraction = Get-Content $extractionJson -Raw | ConvertFrom-Json
Write-Host "Stitches in JSON: $($extraction.stitches.Count)"

# Normalize fn: lowercase, alpha+digit only, collapse whitespace
function Normalize-Name([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return '' }
    $t = $s.ToLowerInvariant()
    $t = $t -replace "[^a-z0-9]+", ' '
    $t = $t.Trim() -replace '\s+', ' '
    return $t
}

# Levenshtein for fuzzy match (flat array to avoid PS 5.1 multi-dim index parser issues)
function Get-Levenshtein([string]$a, [string]$b) {
    if ([string]::IsNullOrEmpty($a)) { return $b.Length }
    if ([string]::IsNullOrEmpty($b)) { return $a.Length }
    $la = $a.Length; $lb = $b.Length
    $w = $lb + 1
    $d = New-Object 'int[]' (($la + 1) * $w)
    for ($i = 0; $i -le $la; $i++) { $d[$i * $w] = $i }
    for ($j = 0; $j -le $lb; $j++) { $d[$j] = $j }
    for ($i = 1; $i -le $la; $i++) {
        for ($j = 1; $j -le $lb; $j++) {
            $cost = 1
            if ($a[$i - 1] -eq $b[$j - 1]) { $cost = 0 }
            $del = $d[($i - 1) * $w + $j] + 1
            $ins = $d[$i * $w + ($j - 1)] + 1
            $sub = $d[($i - 1) * $w + ($j - 1)] + $cost
            $m = $del
            if ($ins -lt $m) { $m = $ins }
            if ($sub -lt $m) { $m = $sub }
            $d[$i * $w + $j] = $m
        }
    }
    return $d[$la * $w + $lb]
}

Write-Host "`n=== Step C: build comparison ===" -ForegroundColor Cyan

# Build extracted lookup: normalized_name => { primary_name, slug, source_filename }
$extractedByNorm = @{}
foreach ($s in $extraction.stitches) {
    $n = Normalize-Name $s.primary_name
    if ($n -and -not $extractedByNorm.ContainsKey($n)) {
        $extractedByNorm[$n] = $s
    }
}
Write-Host "Unique normalized names in JSON: $($extractedByNorm.Count)"

# Build scanned lookup: normalized_name => list of {filename, raw_name}
# Skip continuations and rows with empty detected_stitch_name.
$scannedByNorm = @{}
$continuationCount = 0
$emptyCount = 0
foreach ($row in $allScans) {
    $isCont = $false
    if ($row.PSObject.Properties.Name -contains 'is_continuation') {
        $isCont = [bool]$row.is_continuation
    }
    if ($isCont) { $continuationCount++; continue }
    $name = ''
    if ($row.PSObject.Properties.Name -contains 'detected_stitch_name') {
        $name = [string]$row.detected_stitch_name
    }
    if ([string]::IsNullOrWhiteSpace($name)) { $emptyCount++; continue }
    $n = Normalize-Name $name
    if (-not $scannedByNorm.ContainsKey($n)) {
        $scannedByNorm[$n] = @{ raw_name = $name; filenames = @(); confidence = $row.confidence; notes = @() }
    }
    $scannedByNorm[$n].filenames += $row.filename
    if ($row.notes) { $scannedByNorm[$n].notes += "$($row.filename): $($row.notes)" }

    # Also handle "second stitch on page: X" in notes
    if ($row.notes -match 'second stitch on page:\s*([^;,]+?)(?:$|[;,])') {
        $second = $matches[1].Trim()
        $sn = Normalize-Name $second
        if ($sn -and -not $scannedByNorm.ContainsKey($sn)) {
            $scannedByNorm[$sn] = @{ raw_name = $second; filenames = @(); confidence = 'medium'; notes = @("page-break second-stitch on $($row.filename)") }
        }
        if ($sn) { $scannedByNorm[$sn].filenames += $row.filename }
    }
}
Write-Host "Unique normalized names in scan: $($scannedByNorm.Count)"
Write-Host "Continuations skipped: $continuationCount"
Write-Host "Empty/unknown names skipped: $emptyCount"

# Three-way compare with fuzzy matching
$matched = New-Object System.Collections.ArrayList
$missing = New-Object System.Collections.ArrayList
$unexpected = New-Object System.Collections.ArrayList
$fuzzyMatches = New-Object System.Collections.ArrayList

$scanKeys = @($scannedByNorm.Keys)
$extractedKeys = @($extractedByNorm.Keys)
$matchedExtractedKeys = New-Object System.Collections.Generic.HashSet[string]

foreach ($sk in $scanKeys) {
    $scanRec = $scannedByNorm[$sk]
    if ($extractedByNorm.ContainsKey($sk)) {
        $ext = $extractedByNorm[$sk]
        [void]$matched.Add([PSCustomObject]@{
            normalized = $sk
            scan_name = $scanRec.raw_name
            extracted_name = $ext.primary_name
            slug = $ext.slug
            screenshot_filenames = $scanRec.filenames
            json_source = $ext.source_filename
            exact = $true
        })
        [void]$matchedExtractedKeys.Add($sk)
        continue
    }
    # Try fuzzy
    $bestKey = $null; $bestDist = 999
    foreach ($ek in $extractedKeys) {
        if ($matchedExtractedKeys.Contains($ek)) { continue }
        $dist = Get-Levenshtein $sk $ek
        if ($dist -lt $bestDist) { $bestDist = $dist; $bestKey = $ek }
    }
    $maxLen = [Math]::Max($sk.Length, ($bestKey.Length))
    $sim = if ($maxLen -gt 0) { 1.0 - ($bestDist / $maxLen) } else { 0 }
    if ($bestKey -and $sim -ge 0.80) {
        $ext = $extractedByNorm[$bestKey]
        [void]$matched.Add([PSCustomObject]@{
            normalized = $sk
            scan_name = $scanRec.raw_name
            extracted_name = $ext.primary_name
            slug = $ext.slug
            screenshot_filenames = $scanRec.filenames
            json_source = $ext.source_filename
            exact = $false
            fuzzy_distance = $bestDist
            similarity = [Math]::Round($sim, 3)
        })
        [void]$matchedExtractedKeys.Add($bestKey)
        [void]$fuzzyMatches.Add([PSCustomObject]@{
            scan_name = $scanRec.raw_name
            extracted_name = $ext.primary_name
            similarity = [Math]::Round($sim, 3)
            screenshot_filenames = $scanRec.filenames
        })
    } else {
        [void]$missing.Add([PSCustomObject]@{
            scan_name = $scanRec.raw_name
            normalized = $sk
            screenshot_filenames = $scanRec.filenames
            confidence = $scanRec.confidence
            notes = $scanRec.notes
            closest_in_json = $bestKey
            closest_similarity = [Math]::Round($sim, 3)
        })
    }
}

# Unexpected: extracted names with no matching scan
foreach ($ek in $extractedKeys) {
    if (-not $matchedExtractedKeys.Contains($ek)) {
        $ext = $extractedByNorm[$ek]
        [void]$unexpected.Add([PSCustomObject]@{
            extracted_name = $ext.primary_name
            slug = $ext.slug
            json_source = $ext.source_filename
        })
    }
}

# Sort
$missingSorted = $missing | Sort-Object scan_name
$matchedSorted = $matched | Sort-Object extracted_name
$unexpectedSorted = $unexpected | Sort-Object extracted_name
$fuzzySorted = $fuzzyMatches | Sort-Object similarity

Write-Host "`n=== Comparison results ==="
Write-Host "Matched (exact + fuzzy): $($matched.Count)"
Write-Host "Missing from JSON (red): $($missing.Count)"
Write-Host "Unexpected in JSON (yellow): $($unexpected.Count)"
Write-Host "Fuzzy-matched (review): $($fuzzyMatches.Count)"

Write-Host "`n=== Step D: render HTML report ===" -ForegroundColor Cyan

function HtmlEsc([string]$s) {
    if ($null -eq $s) { return '' }
    return ($s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
}

function Make-FileLink([string]$fname) {
    $abs = Join-Path 'C:\Users\adam\wovely\stitch-extraction-source' $fname
    $url = 'file:///' + ($abs -replace '\\', '/' -replace ' ', '%20')
    return "<a href=`"$url`" target=`"_blank`">$(HtmlEsc $fname)</a>"
}

$totalScreenshots = $allScans.Count
$uniqueIdentified = $scannedByNorm.Count
$jsonStitchCount = $extraction.stitches.Count
$matchedCount = $matched.Count
$missingCount = $missing.Count
$unexpectedCount = $unexpected.Count
$fuzzyCount = $fuzzyMatches.Count

$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stitch Reconciliation Report</title>
<style>
:root {
  --primary: #9B7EC8; --navy: #2D3A7C; --bg: #F8F6FF; --border: #EDE4F7;
  --text: #2D2D4E; --text2: #6B6B8A;
  --green: #5B9B6B; --green-bg: #e8f4ec;
  --red: #C0544A; --red-bg: #fbeae8;
  --amber: #C9A84C; --amber-bg: #fbf4dd;
}
* { box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; margin: 0; padding: 24px; background: var(--bg); color: var(--text); }
h1 { font-family: 'Playfair Display', Georgia, serif; color: var(--navy); margin: 0 0 8px; }
h2 { font-family: 'Playfair Display', Georgia, serif; margin: 24px 0 8px; }
.meta { color: var(--text2); margin-bottom: 24px; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 32px; }
.stat { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.stat-label { font-size: 12px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 28px; font-weight: 600; margin-top: 4px; color: var(--navy); }
.section { background: white; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
.section-header { padding: 14px 18px; cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.section-green .section-header { background: var(--green-bg); color: var(--green); border-left: 4px solid var(--green); }
.section-red .section-header { background: var(--red-bg); color: var(--red); border-left: 4px solid var(--red); }
.section-amber .section-header { background: var(--amber-bg); color: var(--amber); border-left: 4px solid var(--amber); }
.section-content { padding: 0 18px 18px; }
.section-content[hidden] { display: none; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
th { text-align: left; padding: 8px 6px; border-bottom: 2px solid var(--border); font-weight: 600; color: var(--navy); }
td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
td.name { font-weight: 600; }
td.files a { display: block; color: var(--primary); text-decoration: none; font-size: 12px; margin-bottom: 2px; }
td.files a:hover { text-decoration: underline; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; margin-left: 4px; }
.badge-fuzzy { background: var(--amber-bg); color: var(--amber); }
.badge-low { background: var(--red-bg); color: var(--red); }
.badge-medium { background: var(--amber-bg); color: var(--amber); }
.badge-high { background: var(--green-bg); color: var(--green); }
details summary { cursor: pointer; }
.subsection { margin-top: 16px; padding: 12px; background: var(--bg); border-radius: 8px; }
.subsection h3 { margin: 0 0 8px; font-size: 14px; color: var(--navy); }
.toggle::before { content: '▾ '; }
.toggle.collapsed::before { content: '▸ '; }
</style>
</head>
<body>
<h1>Stitch Reconciliation Report</h1>
<div class="meta">Generated $(Get-Date -Format 'yyyy-MM-dd HH:mm') &middot; Comparing 646 source screenshots against $jsonStitchCount-stitch extraction</div>

<div class="summary-grid">
  <div class="stat"><div class="stat-label">Screenshots scanned</div><div class="stat-value">$totalScreenshots</div></div>
  <div class="stat"><div class="stat-label">Unique stitches identified</div><div class="stat-value">$uniqueIdentified</div></div>
  <div class="stat"><div class="stat-label">JSON stitches</div><div class="stat-value">$jsonStitchCount</div></div>
  <div class="stat"><div class="stat-label">Matched</div><div class="stat-value" style="color:var(--green)">$matchedCount</div></div>
  <div class="stat"><div class="stat-label">Missing from JSON</div><div class="stat-value" style="color:var(--red)">$missingCount</div></div>
  <div class="stat"><div class="stat-label">Unexpected in JSON</div><div class="stat-value" style="color:var(--amber)">$unexpectedCount</div></div>
</div>

<!-- MISSING -->
<div class="section section-red">
  <div class="section-header" onclick="toggle('missing')"><span class="toggle" id="t-missing">Missing from JSON ($missingCount) &mdash; CRITICAL</span></div>
  <div class="section-content" id="c-missing">
"@

if ($missing.Count -eq 0) {
    $html += "<p>None. Every stitch identified in screenshots matched (exactly or fuzzily) an entry in the extracted JSON.</p>"
} else {
    $html += "<table><thead><tr><th>Stitch name (from screenshot)</th><th>Screenshot file(s)</th><th>Confidence</th><th>Closest in JSON</th><th>Notes</th></tr></thead><tbody>"
    foreach ($m in $missingSorted) {
        $files = ($m.screenshot_filenames | ForEach-Object { Make-FileLink $_ }) -join ''
        $confBadge = "<span class=`"badge badge-$($m.confidence)`">$(HtmlEsc $m.confidence)</span>"
        $closest = if ($m.closest_in_json) { "$(HtmlEsc $m.closest_in_json) <span class=`"badge badge-fuzzy`">sim $($m.closest_similarity)</span>" } else { '&mdash;' }
        $notes = if ($m.notes -and $m.notes.Count -gt 0) { ($m.notes | ForEach-Object { HtmlEsc $_ }) -join '<br>' } else { '' }
        $html += "<tr><td class=`"name`">$(HtmlEsc $m.scan_name)</td><td class=`"files`">$files</td><td>$confBadge</td><td>$closest</td><td>$notes</td></tr>"
    }
    $html += "</tbody></table>"
}
$html += "</div></div>"

# UNEXPECTED
$html += @"
<div class="section section-amber">
  <div class="section-header" onclick="toggle('unexpected')"><span class="toggle" id="t-unexpected">Unexpected in JSON ($unexpectedCount)</span></div>
  <div class="section-content" id="c-unexpected">
"@
if ($unexpected.Count -eq 0) {
    $html += "<p>None. Every JSON stitch was identified in the screenshot scan.</p>"
} else {
    $html += "<table><thead><tr><th>Stitch name (in JSON)</th><th>Slug</th><th>JSON source filename</th></tr></thead><tbody>"
    foreach ($u in $unexpectedSorted) {
        $src = if ($u.json_source) { Make-FileLink $u.json_source } else { '&mdash;' }
        $html += "<tr><td class=`"name`">$(HtmlEsc $u.extracted_name)</td><td>$(HtmlEsc $u.slug)</td><td class=`"files`">$src</td></tr>"
    }
    $html += "</tbody></table>"
}
$html += "</div></div>"

# MATCHED (collapsed)
$html += @"
<div class="section section-green">
  <div class="section-header" onclick="toggle('matched')"><span class="toggle collapsed" id="t-matched">Matched ($matchedCount) &mdash; click to expand</span></div>
  <div class="section-content" id="c-matched" hidden>
"@

# Fuzzy subsection
if ($fuzzyMatches.Count -gt 0) {
    $html += "<div class=`"subsection`"><h3>Potentially fuzzy-matched ($fuzzyCount) &mdash; review these</h3><table><thead><tr><th>Scan name</th><th>JSON name</th><th>Similarity</th><th>Screenshot file(s)</th></tr></thead><tbody>"
    foreach ($f in $fuzzySorted) {
        $files = ($f.screenshot_filenames | ForEach-Object { Make-FileLink $_ }) -join ''
        $html += "<tr><td>$(HtmlEsc $f.scan_name)</td><td>$(HtmlEsc $f.extracted_name)</td><td>$($f.similarity)</td><td class=`"files`">$files</td></tr>"
    }
    $html += "</tbody></table></div>"
}

$html += "<table><thead><tr><th>Stitch name (JSON)</th><th>Scan name</th><th>Slug</th><th>Match type</th></tr></thead><tbody>"
foreach ($m in $matchedSorted) {
    $matchType = if ($m.exact) { '<span class="badge badge-high">exact</span>' } else { "<span class=`"badge badge-fuzzy`">fuzzy ($($m.similarity))</span>" }
    $html += "<tr><td class=`"name`">$(HtmlEsc $m.extracted_name)</td><td>$(HtmlEsc $m.scan_name)</td><td>$(HtmlEsc $m.slug)</td><td>$matchType</td></tr>"
}
$html += "</tbody></table></div></div>"

$html += @"
<script>
function toggle(id) {
  var c = document.getElementById('c-' + id);
  var t = document.getElementById('t-' + id);
  if (c.hasAttribute('hidden')) { c.removeAttribute('hidden'); t.classList.remove('collapsed'); }
  else { c.setAttribute('hidden', ''); t.classList.add('collapsed'); }
}
</script>
</body>
</html>
"@

$html | Out-File $reportOut -Encoding utf8
Write-Host "Wrote $reportOut"

# Summary printout
Write-Host "`n=== SUMMARY ===" -ForegroundColor Green
Write-Host "Report: $reportOut"
Write-Host "Total screenshots scanned: $totalScreenshots"
Write-Host "Unique stitches identified in screenshots: $uniqueIdentified"
Write-Host "JSON stitch count: $jsonStitchCount"
Write-Host "Matched: $matchedCount"
Write-Host "Missing from JSON: $missingCount"
Write-Host "Unexpected in JSON: $unexpectedCount"
Write-Host "Fuzzy matches (need review): $fuzzyCount"
