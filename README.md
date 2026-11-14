# herdr-mod-launcher

herdr-app の Mod。リポジトリを選んで space を開く Project Launcher。

## 導入

    git clone <このリポジトリ> ~/Projects/herdr-mods/launcher
    ln -s ~/Projects/herdr-mods/launcher ~/.config/herdr-app/mods/launcher
    herdr-app check ~/.config/herdr-app/mods/launcher

`mod.json` は popup として開く設定です(`place: none`)。`mod.open launcher` で開き、キーに割り当てる場合は keys.json に `mod.open:launcher` を書きます。

## 使い方

- 探す場所は `~/.config/wt/repo-roots`(1 行に `パス:深さ`。既定は `~:1`、`~/projects:1`、`~/Projects:1`)。`~/.config/wt/repo-skip` に書いた名前は除外します。
- 文字を打つと絞り込み、↑/↓ で選びます。開いている space はすべて一覧に出ます(リポジトリ以外のフォルダ、リモートマシンの space も。リモートはマシン名のバッジ付き)。先頭に並び、右端に `open · タブ数` が出ます。
- space はフォルダごとに 1 つ(`space.folder` の完全一致で判定)。扱うのは claude のセッションだけです。
- Enter / クリック: そのフォルダの space に移動します。space が無ければ新しく作って claude を起動します(space 名・最初の tab 名はフォルダ名)。
- Ctrl+Enter: claude のセッションを足します。space があれば移動して claude のタブを足し(tab 名は フォルダ名、`claude 2`、`claude 3`…)、無ければ新しい space を作って claude を起動します。
- Esc: 閉じる

## ストーリーブック

`storybook.json` と `main.js` 内のモックで、ModsStoryBook から表示状態(一覧・開いている space・絞り込み)を切り替えて確認できます。モックは Story が開いたプレビューでのみ使われます。
