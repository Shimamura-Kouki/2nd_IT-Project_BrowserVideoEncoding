# Git: `git pull` が失敗したときの対処ガイド

目的: `git pull` ができない・失敗する場合に、原因を特定し安全に復旧するための手順をまとめる。

注意: 以下の操作のうち `--force` や `reset --hard` は履歴を書き換えます。取り消し不可能になる可能性があるため、実行前にローカルブランチを別名でバックアップしてください。

---

1) まず現状確認（リモート情報とブランチ）

    ```bash
    git status
    git branch -vv
    git remote -v
    git fetch --all --prune
    git branch -a
    ```

    目的: 追跡設定や origin/* の状態、ローカルの未コミット変更を確認する。

2) よくある原因と対処

- 原因: 現在のローカルブランチに upstream（追跡先）が設定されていない
  - 対処:

    ```bash
    git branch --set-upstream-to=origin/<branch> <branch>
    git pull
    ```

- 原因: リモートのデフォルトブランチが想定と違う（例: `origin/HEAD -> origin/feature/...`）
  - 対処: GitHub のリポジトリ設定（Settings > Branches）で Default branch を変更する。CLIでできる場合:

    ```bash
    gh repo edit --default-branch main
    ```

- 原因: ローカルとリモートでブランチが分岐しており、単純に fast-forward できない
  - 対処（安全）:

    ```bash
    git fetch origin
    git status
    git merge --no-ff origin/<branch>
    ```

  - 対処（履歴をリモートに合わせたい場合、注意して実行）:

    ```bash
    git checkout <branch>
    git reset --hard origin/<branch>
    ```

- 原因: デフォルトブランチが削除禁止（保護）されている / デフォルトブランチに設定されているため削除できない
  - 対処: GitHub の Settings > Branches の Branch protection rules を確認・解除（管理者権限が必要）。デフォルトブランチは削除不可なので、削除したいなら先に Default branch を別に変更する。

1) 「リモートの feature がデフォルトになっている」等で削除したい時の安全な手順

    例: 古い `main` を `legacy-backend` として保存し、現在の作業 branch を `main` にする

    ```bash
    # 古い main を保護した別名で残す
    git checkout main
    git branch legacy-backend
    git push origin legacy-backend

    # 最新の作業ブランチを main にする（ローカル）
    git checkout feature/static-github-pages
    git branch -f main feature/static-github-pages
    git checkout main

    # リモートの main を上書き（注意: 他人と共有している場合は要注意）
    git push origin main --force

    # GitHub の Settings で Default branch を main に切り替える

    # デフォルトが変わったらリモートの古い feature ブランチを削除
    git push origin --delete feature/static-github-pages
    ```

4) ブランチ削除時に "refusing to delete the current branch" が出る場合

- 原因: 削除対象ブランチが GitHub 上の Default branch に設定されているため
- 対処: GitHub の Settings で Default branch を別ブランチに変更してから再度削除を実行。

5) それでも pull できない・不整合がある場合の最終手段（破壊的）

- まずバックアップを必ず作る:
  ```bash
  git checkout main
  git branch backup-main-$(date +%Y%m%d-%H%M)
  git push origin backup-main-$(date +%Y%m%d-%H%M)
  ```

- リモートの状態に強制同期したい場合:
  ```bash
  git fetch origin
  git checkout main
  git reset --hard origin/main
  ```

6) パーミッションや認証エラー
- HTTPS で auth 関連のエラーが出る場合は、`git config --global credential.helper` を確認。
- GitHub CLI (`gh`) の認証が済んでいれば `gh auth login` を実行して再認証。

7) 参考コマンド一覧（よく使う）

```bash
# 追跡設定（Upstream）
git branch --set-upstream-to=origin/<branch> <branch>

# リモートを最新にしてブランチを一覧
git fetch --all --prune
git branch -a

# リモートブランチ削除
git push origin --delete <branch>

# ローカルブランチ削除
git branch -d <branch>       # マージ済みなら安全
git branch -D <branch>       # 強制削除

# リモート main にローカル main を強制上書き（危険）
git push origin main --force

# リモート main をローカルに強制反映
git reset --hard origin/main
```

8) トラブル時のログ取得（状況共有用）

```bash
git remote -v
git branch -vv
git log --oneline --graph --all -n 20
git status --porcelain
```

9) 注意点まとめ
- `--force` / `reset --hard` は慎重に。共同開発時は事前連絡を。バックアップを必ず作成。
- GitHub の Default branch は削除できない。削除したければ GitHub 側で Default を変更する。
- Branch protection（保護ルール）が設定されていると force push / delete がブロックされる。

---

作業履歴や具体的な操作が必要なら、このドキュメントを元に順を追って実行します。
