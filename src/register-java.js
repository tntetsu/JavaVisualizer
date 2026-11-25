/**
 * register-java.js — JSVisualizer のフロントエンドに Java の言語プロファイルを登録する
 *
 * app.js（src/app.js）より先に評価されるよう、入口で最初に import する。
 * virtual:java-samples はビルド（scripts/build.mjs）が samples/*.java から作る。
 */
import { setLanguage } from 'js-visualizer/src/lang/index.js';
import { createJavaProfile } from './lang/java.js';
import { SAMPLES, SAMPLE_GROUPS, DEFAULT_SAMPLE } from 'virtual:java-samples';

setLanguage(createJavaProfile(SAMPLES, { groups: SAMPLE_GROUPS, defaultSample: DEFAULT_SAMPLE }));
