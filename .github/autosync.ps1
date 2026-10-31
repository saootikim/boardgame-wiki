# 윈도우 예약 작업이 10분마다 실행: 바뀐 노트를 커밋하고 GitHub과 주고받는다.
# 기록: .git\autosync.log
$ErrorActionPreference = "Continue"
$env:GCM_INTERACTIVE = "never"
$env:GIT_TERMINAL_PROMPT = "0"
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = ".git\autosync.log"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 $log }

# 다른 git 작업(Obsidian Git 등)이 돌고 있으면 이번 회차는 건너뜀
if (Test-Path ".git\index.lock") { Log "skip: index.lock"; exit 0 }

git add -A 2>&1 | Out-Null
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "auto sync: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>&1 | Out-Null
    Log "commit"
}
$out = git pull --no-rebase -q 2>&1
if ($LASTEXITCODE -ne 0) { Log "pull failed: $out"; exit 1 }
$out = git push -q 2>&1
if ($LASTEXITCODE -ne 0) { Log "push failed: $out"; exit 1 }
Log "ok"
