/**
 * app.js — JavaVisualizer の入口
 *
 * JSVisualizer のフロントエンド（js-visualizer/src/app.js）を、Java の言語プロファイルで起動する。
 * ESM は import を順に評価するので、register-java.js（setLanguage）が app.js より先に動く。
 */
import './register-java.js';
import 'js-visualizer/src/app.js';
