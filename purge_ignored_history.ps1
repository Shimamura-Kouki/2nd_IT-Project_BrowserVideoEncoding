<#
.SYNOPSIS
    Gitの履歴から.gitignoreで指定されたファイルを完全に削除します。

.DESCRIPTION
    現在の.gitignoreファイルにあるパターンを読み取り、git filter-repoを使用して全履歴からファイルを削除します。
    このコマンドは履歴を書き換えるため注意して使用してください。
    引数なしで実行すると、実行されるコマンドのプレビューを表示します。

.PARAMETER Force
    実際に削除処理を実行します。

.EXAMPLE
    .\purge_ignored_history.ps1 -h
    ヘルプを表示します。

.EXAMPLE
    .\purge_ignored_history.ps1
    削除予定のファイルをプレビューします。

.EXAMPLE
    .\purge_ignored_history.ps1 -Force
    履歴からの削除を実際に実行します。
#>

#region Initialization
Param(
    [Parameter(Mandatory = $false)]
    [Switch]$Force,
    
    [Parameter(Mandatory = $false)]
    [alias("h")]
    [Switch]$Help
)

if ($Help) {
    Get-Help $PSCommandPath
    exit
}
#endregion

#region Main Logic
# 削除対象のパターンを.gitignoreから収集
$ignoreFiles = Get-ChildItem -Recurse -Filter ".gitignore"
$patterns = @()

foreach ($file in $ignoreFiles) {
    $content = Get-Content $file.FullName
    $basePath = Resolve-Path $file.DirectoryName -Relative
    if ($basePath -eq ".") { $basePath = "" }
    else { $basePath = $basePath.Replace(".\", "").Replace("\", "/") + "/" }

    foreach ($line in $content) {
        $line = $line.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { continue }
        
        # パスを正規化
        $pattern = ($basePath + $line).Replace("//", "/")
        $patterns += $pattern
    }
}

$uniquePatterns = $patterns | Select-Object -Unique

if ($uniquePatterns.Count -eq 0) {
    Write-Host "削除対象のパターンが見つかりませんでした。" -ForegroundColor Yellow
    exit
}

# git filter-repo コマンドの組み立て
$cmdBase = "git filter-repo --invert-paths"
$cmdArgs = $uniquePatterns | ForEach-Object { "--path `"$_`"" }
$fullCmd = "$cmdBase $($cmdArgs -join ' ')"

if (-not $Force) {
    Write-Host "--- 実行予定のコマンド (プレビュー) ---" -ForegroundColor Cyan
    Write-Host $fullCmd
    Write-Host "`n実際に実行するには -Force フラグを付けて実行してください。" -ForegroundColor Yellow
    Write-Host "注意: git-filter-repo がインストールされている必要があります (pip install git-filter-repo)"
}
else {
    Write-Host "実行中: $fullCmd" -ForegroundColor Green
    Invoke-Expression $fullCmd
}
#endregion
