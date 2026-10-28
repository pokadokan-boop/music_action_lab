// Task Scheduler への登録 (docs/plan/loop-phase2.md T4)。本人の登録作業を残さないために Claude が実行する。
//   node scripts/steward/register.js create [HH:MM]   毎日 HH:MM (既定 05:00) に run.js を起動する登録
//   node scripts/steward/register.js delete           登録を外す (判断者の停止条件でも使う)
//   node scripts/steward/register.js query            登録の状態
//   node scripts/steward/register.js run              今すぐ 1 回起動する (無人の経路の確認)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASK_NAME } from './collect.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runJs = path.join(repo, 'scripts', 'steward', 'run.js');

function schtasks(args) {
  const r = spawnSync('schtasks', args, { encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return r.status ?? 1;
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'create': {
    const time = arg ?? '05:00';
    const tr = `"${process.execPath}" "${runJs}"`;
    process.exitCode = schtasks(['/Create', '/F', '/SC', 'DAILY', '/ST', time, '/TN', TASK_NAME, '/TR', tr]);
    break;
  }
  case 'delete':
    process.exitCode = schtasks(['/Delete', '/F', '/TN', TASK_NAME]);
    break;
  case 'query':
    process.exitCode = schtasks(['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']);
    break;
  case 'run':
    process.exitCode = schtasks(['/Run', '/TN', TASK_NAME]);
    break;
  default:
    process.stderr.write('usage: node scripts/steward/register.js create [HH:MM] | delete | query | run\n');
    process.exitCode = 2;
}
