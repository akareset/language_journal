param([string]$Python = 'python.exe')
$ErrorActionPreference = 'Stop'
$runtimePath = 'D:\Dev\deutsch-journal-nlp'
$cachePath = 'D:\Dev\pip-cache'
$runtimePython = Join-Path $runtimePath 'Scripts\python.exe'
$requirementsPath = Join-Path $PSScriptRoot '..\nlp\requirements.txt'
$env:PYTHONDONTWRITEBYTECODE = '1'
if (-not (Test-Path -LiteralPath $runtimePython)) {
    & $Python -m venv $runtimePath
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local NLP environment.' }
}
& $runtimePython -m pip install --cache-dir $cachePath -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw 'Could not install spaCy and its German model.' }
& $runtimePython -c "import spacy; nlp=spacy.load('de_core_news_sm'); spacy.load('en_core_web_sm'); print('Ready:', spacy.__version__, nlp.meta['version'])"
if ($LASTEXITCODE -ne 0) { throw 'The German model did not load.' }
