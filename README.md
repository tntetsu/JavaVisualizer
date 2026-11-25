# JavaVisualizer

Java プログラムの実行過程をステップごとに可視化する、プログラミング教育用の Web アプリケーションです（開発中）。

JavaScript 版の [JSVisualizer](https://github.com/tntetsu/JSVisualizer)・Python 版の [PyVisualizer](https://github.com/tntetsu/PyVisualizer) と同じ画面・同じ 12 種類のビューで、Java のプログラムを式・文・関数呼び出しの単位でステップ実行できるようにすることを目指しています。

## ステータス

開発中です。Phase 0（スパイク）が終わり、JavaScript 版と同じ画面で Java のプログラムを動かせることを確かめました（[docs/phase0-report.md](docs/phase0-report.md)）。計画は [docs/development-plan.md](docs/development-plan.md) を参照してください。

```bash
npm install                     # 兄弟ディレクトリに ../JSInterpreter-core・../JSVisualizer-multilang が必要
npm test                        # 本物の Java との比較に java（JDK 21）が必要
node scripts/build.mjs --serve  # http://127.0.0.1:8124/
```

## ライセンス

[MIT](LICENSE)
