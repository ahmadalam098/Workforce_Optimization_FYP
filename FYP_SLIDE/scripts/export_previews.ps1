# Exports every slide of FYP_Proposal.pptx as a PNG, writes FYP_Proposal.pdf (needs PowerPoint) and prints the transition of each slide.
param(
  [string]$Deck = (Join-Path $PSScriptRoot '..\FYP_Proposal.pptx'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\previews')
)
$Deck = (Resolve-Path $Deck).Path
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open($Deck, $true, $false, $false)
  foreach ($slide in $pres.Slides) {
    $png = Join-Path $OutDir ("slide{0}.png" -f $slide.SlideIndex)
    $slide.Export($png, 'PNG', 1600, 900)
    "{0}: transition effect {1}, shapes {2}" -f $slide.SlideIndex, $slide.SlideShowTransition.EntryEffect, $slide.Shapes.Count
  }
  # a still PDF (no animation) for uploads
  $pres.SaveAs((Join-Path (Split-Path $Deck) 'FYP_Proposal.pdf'), 32)
  $pres.Close()
} finally {
  $ppt.Quit()
}
