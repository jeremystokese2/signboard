const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const cards = require('./cliBoard');
const { readCard, writeCard } = require('./cardFrontmatter');
const { atomicWriteFile } = require('./atomicFile');
const { getCliConfigDir } = require('./cliState');

const STATE_FILE = 'sprints.json';
const STATUSES = ['To do', 'Doing', 'Waiting', 'Done'];

async function withBoardLock(board, operation) {
  const canonical = await fs.realpath(board);
  const lockDir = path.join(getCliConfigDir(), 'locks');
  await fs.mkdir(lockDir, { recursive: true });
  const lock = path.join(lockDir, crypto.createHash('sha256').update(canonical).digest('hex') + '.lock');
  let handle;
  try { handle = await fs.open(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Board is busy. Retry after the other command finishes. If it crashed, remove the stale lock: ${lock}`);
    throw error;
  }
  try {
    await handle.writeFile(String(process.pid));
    return await operation();
  } finally { await handle.close(); await fs.unlink(lock); }
}

async function readSprints(board) {
  try {
    const state = JSON.parse(await fs.readFile(path.join(board, STATE_FILE), 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.sprints)) throw new Error('Unsupported sprint data.');
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, activeSprint: null, sprints: [] };
    throw error;
  }
}

async function saveSprints(board, state) {
  await atomicWriteFile(path.join(board, STATE_FILE), JSON.stringify(state, null, 2) + '\n');
}

function hours(value, name = 'Estimate') {
  const n = Number(value);
  if (value === true || value === '' || !Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number of hours.`);
  return n;
}

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Dates must be real dates in YYYY-MM-DD format.');
  return value;
}

function resolveSprint(state, reference) {
  const ref = reference === 'current' ? state.activeSprint : reference;
  const found = state.sprints.filter(s => s.id === ref || s.name === ref);
  if (found.length !== 1) throw new Error(`Sprint not found or ambiguous: ${reference}`);
  return found[0];
}

async function changeSprint(board, action, reference, options) {
  const state = await readSprints(board);
  let sprint;
  if (action === 'create') {
    if (!reference?.trim()) throw new Error('Sprint name is required.');
    if (state.sprints.some(s => s.name === reference)) throw new Error('Sprint name already exists.');
    sprint = { id: crypto.randomUUID(), name: reference, goal: '', capacity: null, wip: 3, status: 'planned' };
    state.sprints.push(sprint);
  } else sprint = resolveSprint(state, reference || 'current');
  if (options.start !== undefined) sprint.start = date(options.start);
  if (options.end !== undefined) sprint.end = date(options.end);
  if (sprint.start && sprint.end && sprint.end < sprint.start) throw new Error('Sprint end must be on or after its start.');
  if (options.goal !== undefined) sprint.goal = String(options.goal);
  if (options.capacity !== undefined) sprint.capacity = hours(options.capacity, 'Capacity');
  if (options.wip !== undefined) {
    sprint.wip = hours(options.wip, 'WIP limit');
    if (!Number.isInteger(sprint.wip) || sprint.wip < 1) throw new Error('WIP limit must be a positive whole number.');
  }
  if (action === 'start') {
    if (sprint.status === 'closed') throw new Error('A closed sprint cannot be started.');
    if (state.activeSprint && state.activeSprint !== sprint.id) throw new Error('Close the current sprint first.');
    sprint.status = 'active'; state.activeSprint = sprint.id;
  } else if (action === 'close') {
    sprint.status = 'closed';
    if (state.activeSprint === sprint.id) state.activeSprint = null;
  }
  await saveSprints(board, state);
  return sprint;
}

function item(record) {
  return { id: record.cardId, title: record.title, body: record.body, status: record.listDisplayName,
    kind: record.frontmatter.work_kind || 'task', parent: record.frontmatter.work_parent || null,
    sprint: record.frontmatter.work_sprint || null,
    estimate: record.frontmatter.work_estimate ?? null, blocked: record.frontmatter.work_blocked || '',
    updatedAt: record.updatedAt, path: record.filePath };
}

async function changeWork(board, action, reference, options) {
  const state = await readSprints(board);
  const existing = action === 'add' ? null : await cards.resolveCard(board, { cardRef: reference });
  const current = existing ? item(existing) : { kind: 'task', parent: null, sprint: null, estimate: null, blocked: '' };
  if (options.kind !== undefined) current.kind = options.kind;
  if (!['story', 'task'].includes(current.kind)) throw new Error('Kind must be story or task.');
  if (options.parent !== undefined) current.parent = options.parent === 'none' ? null : options.parent;
  if (current.parent) {
    const parent = item(await cards.resolveCard(board, { cardRef: current.parent }));
    if (parent.kind !== 'story' || current.kind !== 'task' || parent.id === current.id) throw new Error('Tasks can belong to a story; stories cannot have parents.');
    current.parent = parent.id;
    if (!existing && options.sprint === undefined) current.sprint = parent.sprint;
  }
  if (existing && current.kind === 'task') {
    const all = await cards.listCards(board);
    if (all.some(c => c.frontmatter.work_parent === existing.cardId)) throw new Error('A story with tasks cannot become a task.');
  }
  if (options.sprint !== undefined) current.sprint = options.sprint === 'none' ? null : resolveSprint(state, options.sprint).id;
  if (current.sprint) resolveSprint(state, current.sprint);
  if (options.estimate !== undefined) current.estimate = options.estimate === 'none' ? null : hours(options.estimate);
  if (options.blocked !== undefined) current.blocked = options.blocked === 'none' ? '' : String(options.blocked);
  const status = options.status || current.status || 'To do';
  if (!STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
  // Validate all inputs before creating a list or card.
  const body = options['body-file'] !== undefined ? await fs.readFile(options['body-file'], 'utf8') : options.body;
  const title = action === 'add' ? reference : options.title;
  if (title !== undefined && !String(title).trim()) throw new Error('Title cannot be empty.');
  const lists = await cards.listLists(board);
  if (!lists.some(l => l.displayName === status)) await cards.createList(board, status);
  const edits = { listRef: status };
  if (title !== undefined) edits.title = title;
  if (body !== undefined) edits.body = String(body);
  let record;
  if (action === 'add') record = await cards.createCard(board, edits);
  else {
    delete edits.listRef;
    record = await cards.editCard(board, { ...edits, cardRef: existing.cardId, moveToListRef: status });
  }
  const content = await readCard(record.filePath);
  Object.assign(content.frontmatter, { work_kind: current.kind, work_parent: current.parent,
    work_sprint: current.sprint, work_estimate: current.estimate, work_blocked: current.blocked });
  await writeCard(record.filePath, content);
  return item(await cards.resolveCard(board, { cardRef: record.cardId }));
}

async function snapshot(board, selection = 'current') {
  const state = await readSprints(board);
  const hasSprint = !['backlog', 'all'].includes(selection) && (selection !== 'current' || state.activeSprint);
  const sprint = hasSprint ? resolveSprint(state, selection) : null;
  const all = (await cards.listCards(board)).map(item);
  const selected = all.filter(c => selection === 'all' || (sprint ? c.sprint === sprint.id : !c.sprint));
  const tasks = selected.filter(c => c.kind === 'task');
  const stories = all.filter(c => c.kind === 'story' && (selected.some(t => t.parent === c.id) || selected.some(s => s.id === c.id)));
  const rows = stories.map(s => ({ story: s, tasks: tasks.filter(t => t.parent === s.id) }));
  const orphaned = tasks.filter(t => !stories.some(s => s.id === t.parent));
  if (orphaned.length) rows.push({ story: { id: '', title: 'Other work', kind: 'story', body: '' }, tasks: orphaned });
  const load = tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
  const remaining = tasks.filter(t => t.status !== 'Done').reduce((sum, t) => sum + (t.estimate ?? 0), 0);
  return { board, name: path.basename(board), sprint, sprints: state.sprints, selection,
    columns: [...new Set([...STATUSES, ...tasks.map(t => t.status)])], rows,
    totals: { tasks: tasks.length, done: tasks.filter(t => t.status === 'Done').length,
      doing: tasks.filter(t => t.status === 'Doing').length, blocked: tasks.filter(t => t.blocked || t.status === 'Waiting').length,
      estimatedHours: load, remainingHours: remaining, unestimated: tasks.filter(t => t.estimate === null).length,
      capacityHours: sprint?.capacity ?? null, wipLimit: sprint?.wip ?? null } };
}

module.exports = { withBoardLock, readSprints, changeSprint, changeWork, snapshot, item };
