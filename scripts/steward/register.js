// Task Scheduler への登録 (docs/plan/loop-phase2.md T4)。本人の登録作業を残さないために Claude が実行する。
//   node scripts/steward/register.js create [HH:MM]   毎日 HH:MM に run.js を起動する登録 (PC がその時刻に起きていないと走らない)
//   node scripts/steward/register.js create idle [分]  PC を [分] (既定 15) 放置したら起動する登録 (既定。1 日 1 回の制限は run.js 側)
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
    const tr = `"${process.execPath}" "${runJs}"`;
    if (arg === 'idle' || arg === undefined) {
      const minutes = process.argv[4] ?? '15';
      process.exitCode = schtasks(['/Create', '/F', '/SC', 'ONIDLE', '/I', minutes, '/TN', TASK_NAME, '/TR', tr]);
    } else {
      process.exitCode = schtasks(['/Create', '/F', '/SC', 'DAILY', '/ST', arg, '/TN', TASK_NAME, '/TR', tr]);
    }
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
