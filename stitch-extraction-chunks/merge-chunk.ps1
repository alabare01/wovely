param(
  [Parameter(Mandatory=$true)][int]$ChunkNum,
  [Parameter(Mandatory=$true)][int]$TotalChunks,
  [Parameter(Mandatory=$true)][int]$ScreenshotsInChunk,
  [string]$StartTimestamp = ''
)
$ErrorActionPreference = 'Stop'

$src        = 'C:\Users\adam\wovely\stitch-extraction-source\'
$imgOut     = 'C:\Users\adam\wovely\stitch-extraction-images\'
$masterPath = 'C:\Users\adam\wovely\stitch-extraction-output.json'
$chunkPath  = "C:\Users\adam\wovely\stitch-extraction-chunks\chunk-{0:D2}.json" -f $ChunkNum

if (-not (Test-Path $chunkPath)) { throw "Chunk file missing: $chunkPath" }
$chunk = Get-Content $chunkPath -Raw | ConvertFrom-Json

# Load or initialize master
$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
if ($ChunkNum -eq 1 -or -not (Test-Path $masterPath)) {
  $master = [ordered]@{
    source_metadata = [ordered]@{
      source_type = 'local_screenshots'
      source_folder = $src
      total_screenshots_processed = 0
      total_stitches_extracted = 0
      extraction_timestamp = $StartTimestamp
      last_updated = $nowIso
    }
    stitches = @()
    entries_skipped = @()
    duplicates_skipped = @()
  }
} else {
  $existing = Get-Content $masterPath -Raw | ConvertFrom-Json
  $master = [ordered]@{
    source_metadata = [ordered]@{
      source_type = $existing.source_metadata.source_type
      source_folder = $existing.source_metadata.source_folder
      total_screenshots_processed = $existing.source_metadata.total_screenshots_processed
      total_stitches_extracted = $existing.source_metadata.total_stitches_extracted
      extraction_timestamp = $existing.source_metadata.extraction_timestamp
      last_updated = $nowIso
    }
    stitches = @($existing.stitches)
    entries_skipped = @($existing.entries_skipped)
    duplicates_skipped = @($existing.duplicates_skipped)
  }
}

# Build dedup set of slugs already in master
$existingSlugs = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($s in $master.stitches) { [void]$existingSlugs.Add($s.slug) }

# Copy images and append stitches (deduping against existing master)
$copied = 0
$dupedAcrossChunks = 0
$newStitches = @()
foreach ($s in $chunk.stitches) {
  if ($existingSlugs.Contains($s.slug)) {
    # Cross-chunk duplicate — log it
    $master.duplicates_skipped += [PSCustomObject]@{
      primary_name = $s.primary_name
      source_filename = $s.source_filename
    }
    $dupedAcrossChunks++
    continue
  }
  $srcFile = Join-Path $src $s.source_filename
  $dstFile = Join-Path $imgOut "$($s.slug).png"
  $imgExtracted = $false
  $imgFilename = $null
  if (Test-Path $srcFile) {
    Copy-Item -LiteralPath $srcFile -Destination $dstFile -Force
    $imgExtracted = $true
    $imgFilename = "$($s.slug).png"
    $copied++
  }
  $stitchOut = [ordered]@{
    primary_name = $s.primary_name
    slug = $s.slug
    also_known_as = @($s.also_known_as)
    description = $s.description
    instructions = $s.instructions
    dimension = $s.dimension
    difficulty = $s.difficulty
    common_uses = @($s.common_uses)
    visual_cues = @($s.visual_cues)
    source_filename = $s.source_filename
    image_extracted = $imgExtracted
    image_filename = $imgFilename
  }
  $newStitches += [PSCustomObject]$stitchOut
  [void]$existingSlugs.Add($s.slug)
}
$master.stitches += $newStitches
foreach ($e in $chunk.entries_skipped) { $master.entries_skipped += $e }
foreach ($d in $chunk.duplicates_skipped) { $master.duplicates_skipped += $d }

# Update counts
$master.source_metadata.total_screenshots_processed = $master.source_metadata.total_screenshots_processed + $ScreenshotsInChunk
$master.source_metadata.total_stitches_extracted = $master.stitches.Count

# Write master JSON
$master | ConvertTo-Json -Depth 10 | Out-File -FilePath $masterPath -Encoding utf8

# Report
Write-Output "Chunk $ChunkNum/$TotalChunks complete."
Write-Output "  New stitches added: $($newStitches.Count)"
Write-Output "  Cross-chunk duplicates: $dupedAcrossChunks"
Write-Output "  Within-chunk duplicates from chunk: $($chunk.duplicates_skipped.Count)"
Write-Output "  Entries skipped from chunk: $($chunk.entries_skipped.Count)"
Write-Output "  Images copied: $copied"
Write-Output "  Master totals: $($master.stitches.Count) stitches, $($master.entries_skipped.Count) skipped, $($master.duplicates_skipped.Count) duplicates"
Write-Output "  Master path: $masterPath"
