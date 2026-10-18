const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { withBoardLock } = require('../lib/sprintBoard');
const cli = path.resolve(__dirname, '../bin/signboard.js');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-sprint-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...process.env, SIGNBOARD_CLI_CONFIG_DIR: path.join(root, 'config') };
  const board = path.join(root, 'Personal work');
  const call = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args, '--json'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  call('init', board);
  return { root, board, env, call };
}

test('story rows, estimates, status moves and explicit carryover survive CLI round trips', async t => {
  const f = await fixture(t);
  const sprint = f.call('sprint', 'create', 'Week one', '--capacity', '10', '--wip', '2');
  f.call('sprint', 'start', sprint.id);
  const story = f.call('work', 'add', 'Prepare proposal', '--kind', 'story', '--sprint', 'current', '--estimate', '99');
  const task = f.call('work', 'add', 'Compare options', '--parent', story.id, '--estimate', '2.5', '--body', 'Keep this context.');
  f.call('work', 'add', 'Discuss recommendation', '--parent', story.id);
  f.call('work', 'edit', task.id, '--status', 'Doing');
  let board = f.call('taskboard');
  assert.equal(board.rows[0].story.id, story.id);
  assert.equal(board.totals.estimatedHours, 2.5);
  assert.equal(board.totals.unestimated, 1);
  assert.equal(board.totals.doing, 1);
  assert.equal(board.rows[0].tasks.find(x => x.id === task.id).body, 'Keep this context.');
  f.call('work', 'edit', task.id, '--status', 'Waiting', '--blocked', 'Need a quote');
  assert.equal(f.call('taskboard').totals.blocked, 1);
  f.call('work', 'edit', task.id, '--status', 'Done', '--blocked', 'none');
  assert.equal(f.call('taskboard').totals.done, 1);
  assert.equal(f.call('taskboard').totals.remainingHours, 0);
  f.call('sprint', 'close', sprint.id);
  assert.equal(f.call('taskboard', '--sprint', sprint.id).totals.tasks, 2);
  assert.equal(f.call('taskboard').totals.tasks, 0);
  f.call('work', 'edit', task.id, '--sprint', 'none');
  assert.equal(f.call('taskboard', '--sprint', 'backlog').totals.tasks, 1);
  assert.equal(f.call('work', 'show', task.id).id, task.id);
});

test('invalid input cannot create partial cards or corrupt sprint metadata', async t => {
  const f = await fixture(t);
  const task = f.call('work', 'add', 'Existing task');
  for (const args of [
    ['work', 'add', 'Invalid', '--estimate', '-2'],
    ['work', 'add', 'Invalid', '--parent', task.id],
    ['work', 'add', 'Invalid', '--sprint', 'missing'],
    ['work', 'edit', task.id, '--status', 'Typo'],
    ['sprint', 'create', 'Bad dates', '--start', '2026-02-30'],
    ['sprint', 'create', 'Bad capacity', '--capacity', '-1'],
    ['sprint', 'create', 'Bad limit', '--wip', '1.5'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args, '--json'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout);
  }
  assert.equal(f.call('taskboard', '--sprint', 'all').totals.tasks, 1);
  assert.equal(f.call('sprint', 'list').sprints.length, 0);
});

test('GUI handoff passes prompt literally to Omarchy and includes board, selection and skill', async t => {
  const f = await fixture(t);
  const task = f.call('work', 'add', 'Selected task');
  const payload = 'Update this; $(touch /tmp/do-not-create) `echo nope`\nSecond line';
  const dry = f.call('agent', '--prompt', payload, '--card', task.id, '--dry-run');
  assert.equal(dry.command, 'omarchy');
  assert.deepEqual(dry.args.slice(0, 2), ['agent', 'prompt']);
  assert.ok(dry.args[2].includes(payload));
  assert.ok(dry.args[2].includes(task.id));
  assert.ok(dry.args[2].includes('skills/signboard/SKILL.md'));
  assert.equal(dry.cwd, f.board);
  const bin = path.join(f.root, 'bin');
  await fs.mkdir(bin);
  const captured = path.join(f.root, 'captured.json');
  await fs.writeFile(path.join(bin, 'omarchy'), `#!${process.execPath}\nrequire('fs').writeFileSync(process.env.CAPTURE, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [cli, 'agent', '--prompt', payload], {
    env: { ...f.env, PATH: bin + ':' + process.env.PATH, CAPTURE: captured }, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(await fs.readFile(captured, 'utf8'));
  assert.equal(actual.length, 3);
  assert.ok(actual[2].endsWith(payload));
});

test('watch emits changed snapshots and stops on SIGTERM', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const child = spawn(process.execPath, [cli, 'taskboard', '--watch', '--json'], { env: f.env });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    let buffer = '', first = true;
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const snapshot = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (first) { first = false; f.call('work', 'add', 'Appears without restarting'); }
        else if (snapshot.totals.tasks === 1) { child.kill(); resolve(); }
      }
    });
  });
});

test('skill installs as an idempotent link and preserves an existing unrelated directory', async t => {
  const f = await fixture(t);
  const target = path.join(f.root, 'skills');
  f.call('skill', 'install', '--target', target);
  f.call('skill', 'install', '--target', target);
  assert.ok((await fs.readFile(path.join(target, 'signboard/SKILL.md'), 'utf8')).includes('personal'));
  const other = path.join(f.root, 'other');
  await fs.mkdir(path.join(other, 'signboard'), { recursive: true });
  const result = spawnSync(process.execPath, [cli, 'skill', 'install', '--target', other], { env: f.env });
  assert.equal(result.status, 1);
  assert.equal((await fs.lstat(path.join(other, 'signboard'))).isDirectory(), true);
});

test('concurrent writers are rejected without stealing the lock', async t => {
  const f = await fixture(t);
  const old = process.env.SIGNBOARD_CLI_CONFIG_DIR;
  process.env.SIGNBOARD_CLI_CONFIG_DIR = f.env.SIGNBOARD_CLI_CONFIG_DIR;
  try {
    await withBoardLock(f.board, async () => {
      const result = spawnSync(process.execPath, [cli, 'work', 'add', 'Must not be added'], { env: f.env, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /busy/);
    });
  } finally {
    if (old === undefined) delete process.env.SIGNBOARD_CLI_CONFIG_DIR;
    else process.env.SIGNBOARD_CLI_CONFIG_DIR = old;
  }
  assert.equal(f.call('taskboard').totals.tasks, 0);
});
