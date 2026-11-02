import assert from 'node:assert/strict';
import test from 'node:test';

import { builderMoves, podiumProjects, projectHeadlines } from './projects.ts';

const owner = (id: string, rank: number | null, now: number | null, prev: number | null) => ({ id, rank, net_worth_usd: now, prev_net_worth_usd: prev });
const owners = new Map([owner('A', 1, 100, 90), owner('B', 2, 80, 85), owner('C', 3, 70, 70), owner('D', 4, 60, null), owner('E', null, 50, 40)].map((o) => [o.id, o]));
const proj = (id: string, person_id: string, title: string, announced_date: string) => ({ id, person_id, title, announced_date });
const projects = [
  proj('p1', 'D', 'Deep Drill', '2026-09-01'),
  proj('p2', 'A', 'Alpha One', '2026-01-01'),
  proj('p3', 'A', 'Alpha Two', '2026-06-01'),
  proj('p4', 'C', 'Cargo Ship', '2026-03-01'),
  proj('p5', 'E', 'Unranked', '2026-10-01'),
];

test('podium: one latest project per owner, by owner rank, unranked owners left out', () => {
  assert.deepEqual(podiumProjects(projects, owners).map((x) => x.project.id), ['p3', 'p4', 'p1']);
  assert.equal(podiumProjects([], owners).length, 0);
});

test('headlines must name a project of the same person', () => {
  const news = [
    { id: 'n1', person_id: 'A', title: 'A unveils ALPHA  two rocket' },
    { id: 'n2', person_id: 'C', title: 'Alpha Two delayed' },
    { id: 'n3', person_id: 'A', title: 'A buys a house' },
    { id: 'n4', person_id: null, title: 'Deep Drill news' },
  ];
  assert.deepEqual(projectHeadlines(news, projects).map((x) => [x.item.id, x.project.id]), [['n1', 'p3']]);
});

test('builder moves: recorded changes only, largest first, no zero or missing moves', () => {
  const m = builderMoves(projects, owners);
  assert.deepEqual(m.map((x) => [x.owner.id, x.delta]), [['A', 10], ['E', 10]], 'B has no project; C and D did not move or have no previous value');
});
