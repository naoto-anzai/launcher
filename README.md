# herdr-mod-launcher

herdr-app の Mod。リポジトリを選んで space を開く Project Launcher。

## 導入

    git clone <このリポジトリ> ~/Projects/herdr-mods/launcher
    ln -s ~/Projects/herdr-mods/launcher ~/.config/herdr-app/mods/launcher
    herdr-app check ~/.config/herdr-app/mods/launcher

`mod.json` は popup として開く設定です(`place: none`)。`mod.open launcher` で開き、キーに割り当てる場合は keys.json に `mod.open:launcher` を書きます。

## 使い方

- 探す場所は `~/.config/wt/repo-roots`(1 行に `パス:深さ`。既定は `~:1`、`~/projects:1`、`~/Projects:1`)。`~/.config/wt/repo-skip` に書いた名前は除外します。
- 文字を打つと絞り込み、↑/↓ で選びます。既に開いている space があるものは先頭に並びます。
- Enter: space が開いていればそこへ移動。なければ新しい space を作り、claude(左)と shell(右)を並べます。
- Alt+Enter: claude のみ / Shift+Enter: shell のみ / Esc: 閉じる

## ストーリーブック

`storybook.json` と `main.js` 内のモックで、ModsStoryBook から表示状態(一覧・開いている space・絞り込み)を切り替えて確認できます。モックは Story が開いたプレビューでのみ使われます。
