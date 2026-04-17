# レポート管理Webアプリ

学校レポートを日付一覧で割り当て、科目ごとの進捗を確認できる 1 人用 Web アプリです。  
`Supabase` を使ってクラウド保存するので、同じアカウントで PC とスマホから同じデータを共有できます。

## 主な機能

- 開始日 `2026-04-19` 固定の日付一覧表示
- 初期科目データを自動投入
- 科目選択式の予定追加
- 同一科目は 1 日 2 枚までのバリデーション
- 科目ごとの総必要枚数超過を防止
- 予定単位の完了チェックと取り消し
- 科目別の進捗表示
- Supabase へのクラウド保存
- スマホ対応レスポンシブ UI

## ファイル構成

- `index.html` - 画面構造
- `styles.css` - レスポンシブ UI
- `app.js` - 予定管理ロジックと Supabase 同期

## 1. Supabase プロジェクトを作る

1. [Supabase](https://supabase.com/) で新しいプロジェクトを作成します。
2. `Authentication` で `Email` ログインを有効にします。
3. すぐ使いたい場合は `Confirm email` をオフにしてください。
4. `Project Settings > API` から次の 2 つを控えます。
   - `Project URL`
   - `anon public key`

## 2. テーブルを作る

Supabase の SQL Editor で、以下をそのまま実行してください。

```sql
create table if not exists public.subjects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  total_pages integer not null check (total_pages > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, name)
);

create table if not exists public.scheduled_reports (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  subject_id text not null,
  pages integer not null check (pages > 0),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint scheduled_reports_subject_fk
    foreign key (user_id, subject_id)
    references public.subjects(user_id, id)
    on delete cascade
);

alter table public.subjects enable row level security;
alter table public.scheduled_reports enable row level security;

create policy "subjects_select_own"
on public.subjects
for select
using (auth.uid() = user_id);

create policy "subjects_insert_own"
on public.subjects
for insert
with check (auth.uid() = user_id);

create policy "subjects_update_own"
on public.subjects
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "subjects_delete_own"
on public.subjects
for delete
using (auth.uid() = user_id);

create policy "reports_select_own"
on public.scheduled_reports
for select
using (auth.uid() = user_id);

create policy "reports_insert_own"
on public.scheduled_reports
for insert
with check (auth.uid() = user_id);

create policy "reports_update_own"
on public.scheduled_reports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "reports_delete_own"
on public.scheduled_reports
for delete
using (auth.uid() = user_id);
```

## 3. アプリを開く

このアプリは静的ファイルだけで動きます。  
ローカルで開くなら、簡単な HTTP サーバー経由で開くのがおすすめです。

### 方法A: VS Code の Live Server

`report-planner` フォルダを開いて `index.html` を Live Server で表示します。

### 方法B: Python が使える場合

`report-planner` フォルダで次を実行します。

```bash
python -m http.server 8080
```

その後、ブラウザで `http://localhost:8080` を開きます。

### 方法C: 静的ホスティングに置く

- Supabase Storage
- Cloudflare Pages
- Netlify
- GitHub Pages

どれでも動きます。

## 4. 最初の使い方

1. 画面上部の `接続設定` を開きます。
2. `Supabase URL` と `anon key` を入力して保存します。
3. メールアドレスとパスワードで新規登録します。
4. 初回ログイン時に以下の科目が自動登録されます。

| 科目 | 総枚数 |
| --- | ---: |
| 文学国語 | 12 |
| 日本史探求 | 12 |
| 地理探求 | 12 |
| 政治経済 | 6 |
| 倫理 | 6 |
| 数学A | 6 |
| 地学基礎 | 6 |
| 音楽Ⅰ | 6 |
| 家庭総合 | 8 |
| 体育Ⅱ | 2 |
| 保健 | 3 |

合計 `79` 枚です。

## バリデーション仕様

- 1 日の総枚数上限はありません
- 同一科目は 1 日 2 枚までです
- 3 枚以上入れようとすると警告を出し、その日に追加できる分だけ登録します
- 科目の総必要枚数を超える追加はできません
- 超える場合は、残り枚数があればその分だけ登録します
- 完了チェックは予定単位です
- ある科目の総枚数ぶんすべて完了すると `〇〇レポート完了！` と表示します

## 注意

- このアプリは 1 人利用を前提にしています
- 同時に複数端末から同じ科目へ連続追加した場合、厳密な競合防止はしていません
- より厳密にしたい場合は、Supabase 側でトリガーや RPC を追加して制約を強化してください
