const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const {test} = require('node:test');

const context = {window: {}, Date};
runInNewContext(readFileSync(require.resolve('../gauntlet.js'), 'utf8'), context);
const commands = context.window.GameGauntletCommands;

test('priority skips cooldowns and unnecessary healing, then picks a compatible weapon', () => {
  const actor = {
    id: 'hero', hp: 20, max_hp: 100, acted: false,
    equipped_abilities: [
      {slug: 'p', catalog_slug: 'power_strike', effect: 'damage', target_type: 'enemy'},
      {slug: 'h', catalog_slug: 'heal', effect: 'heal', target_type: 'ally'},
      {slug: 'a', catalog_slug: 'attack', effect: 'damage', target_type: 'enemy', requires_weapon: true, allowed_weapon_tags: ['melee']},
    ],
    ability_ready_turns: {p: 4},
    weapons: [{id: 'weak', base_damage: 10, tags: ['melee']}, {id: 'strong', base_damage: 20, tags: ['melee']}],
  };
  const encounter = {turn: 2, participants: [actor], enemies: [{id: 'enemy', hp: 40}]};
  const priority = ['power_strike', 'heal', 'attack'];
  const first = [...commands(encounter, priority, 0.5)];
  assert.equal(first[0].ability_id, 'h');
  assert.equal(first[0].target_id, 'hero');
  assert.equal(first[1].weapon_id, 'strong');
  assert.equal(first.at(-1).action, 'wait');
  actor.hp = 100;
  assert.equal([...commands(encounter, priority, 0.5)][0].ability_id, 'a');
});

test('wait ends priority and missing abilities fall back to waiting', () => {
  const encounter = {turn: 1, participants: [{id: 'hero', hp: 100, max_hp: 100, acted: false, equipped_abilities: []}], enemies: [{id: 'enemy', hp: 20}]};
  assert.equal([...commands(encounter, ['wait', 'attack'], 0.5)][0].action, 'wait');
  assert.equal([...commands(encounter, ['missing'], 0.5)][0].action, 'wait');
});
