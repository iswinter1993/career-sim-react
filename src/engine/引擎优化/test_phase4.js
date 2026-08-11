// Phase 4 verification script — Three-Layer AI Architecture
// Tests: tactics core (P4.1-P4.3), actions integration (P4.4), movement integration (P4.5), glue (P4.7)

import {
  STYLE_PRESETS, DEFAULT_STRATEGY, PLAYER_ROLES, PLAYER_TRAITS,
  applyTeamStrategy, getRoleModifier, getAvailableRolesForPosition,
  getDefaultRole, validateRoleForPosition, evaluateTraits,
  getRoleName, getTraitCategory, getAllTraits, getStylePresetList
} from './engine/lib/tactics.js';
import { calculateModifiedActionWeight, getModifiedActionWeights, buildActionMatchState, applyTacticalModifiers } from './engine/lib/actions.js';
import { getMovementModifiers } from './engine/lib/playerMovement.js';
import { getPositionGroup } from './engine/lib/positionGroup.js';
import { computeOriginPOSForStarters } from './engine/lib/formation.js';

let passed = 0, failed = 0;
function check(expr, label) {
  if (expr) { passed++; }
  else { failed++; console.error(`FAIL: ${label}`); }
}

// ================================================================
// P4.1 — Team Strategy Presets
// ================================================================
console.log('\n--- P4.1 Team Strategy ---');

check(STYLE_PRESETS.tiki_taka.tempo === 'very_slow', 'tiki_taka tempo');
check(STYLE_PRESETS.gegenpress.pressingIntensity === 'much_more', 'gegenpress pressing');
check(STYLE_PRESETS.park_the_bus.defensiveLine === 'deep', 'park_the_bus deep line');
check(STYLE_PRESETS.route_one.passingDirectness === 'very_direct', 'route_one direct passing');
check(STYLE_PRESETS.wing_play.width === 'wide', 'wing_play wide');
check(STYLE_PRESETS.control_possession.counterPress === true, 'control_possession counter press');
check(STYLE_PRESETS.vertical_tiki_taka.fluidity === 'very_fluid', 'vertical_tiki_taka fluid');
check(Object.keys(STYLE_PRESETS).length === 7, '7 style presets');

// Default strategy fallback
const ds = { ...DEFAULT_STRATEGY };
check(ds.tempo === 'balanced', 'default tempo balanced');
check(ds.mentality === 'balanced', 'default mentality');

// applyTeamStrategy
const testTeam = { name: 'Test FC', players: [] };
const result = applyTeamStrategy(testTeam, STYLE_PRESETS.gegenpress, { pitchWidth: 680, pitchHeight: 1050 });
check(result._tempoMultiplier.pace === 1.15, 'gegenpress pace multiplier');
check(result._pressingMultiplier === 1.30, 'gegenpress pressing multiplier');
check(result._defensiveLineOffset === 60, 'gegenpress high line offset');
check(result._widthMultiplier === 0.93, 'gegenpress width multiplier');
check(result._passingWeights.short === 0.8, 'gegenpress passing weights short');
check(result._passingWeights.long === 1.2, 'gegenpress passing weights long');
check(result._counterPress === true, 'gegenpress counterPress flag');
check(result._fluidityFactor === 0.5, 'gegenpress fluidity factor');

// Park the bus
const ptb = applyTeamStrategy({ name: 'PTB', players: [] }, STYLE_PRESETS.park_the_bus, { pitchWidth: 680, pitchHeight: 1050 });
check(ptb._defensiveLineOffset === -60, 'park_the_bus deep line offset');
check(ptb._pressingMultiplier === 0.70, 'park_the_bus low pressing');
check(ptb._fluidityFactor === 0.0, 'park_the_bus very rigid');

// ================================================================
// P4.2 — Player Roles
// ================================================================
console.log('\n--- P4.2 Player Roles ---');

const roleCount = Object.keys(PLAYER_ROLES).length;
check(roleCount >= 44, `at least 44 roles, got ${roleCount}`);

// GK roles
check(validateRoleForPosition('GK_goalkeeper_defend', 'GK'), 'GK role valid for GK');
check(!validateRoleForPosition('GK_goalkeeper_defend', 'ST'), 'GK role invalid for ST');

// ST roles
check(validateRoleForPosition('ST_poacher_attack', 'ST'), 'ST poacher valid for ST');
check(!validateRoleForPosition('ST_poacher_attack', 'CM'), 'ST poacher invalid for CM');

// CM roles
const cmRoles = getAvailableRolesForPosition('CM');
check(cmRoles.length >= 6, `CM has >=6 roles, got ${cmRoles.length}`);
check(cmRoles.includes('CM_box_to_box_support'), 'CM has B2B role');
check(cmRoles.includes('CM_deep_lying_playmaker_support'), 'CM has DLP role');
check(cmRoles.includes('CM_mezzala_attack'), 'CM has Mezzala role');
check(cmRoles.includes('CM_advanced_playmaker_attack'), 'CM has AP role');
check(cmRoles.includes('CM_ball_winning_midfielder_defend'), 'CM has BWM role');
check(cmRoles.includes('CM_carrilero_support'), 'CM has Carrilero role');

// ST roles — check each position has >=2 roles
for (const pos of ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST']) {
  const roles = getAvailableRolesForPosition(pos);
  check(roles.length >= 2, `${pos} has >=2 roles (${roles.length})`);
}

// B2B role modifiers
const b2b = getRoleModifier('CM_box_to_box_support');
check(b2b.actionModifiers.run === 1.3, 'B2B run modifier 1.3');
check(b2b.actionModifiers.tackle === 1.1, 'B2B tackle modifier 1.1');
check(b2b.movementModifiers.forwardRuns === 0.6, 'B2B forwardRuns 0.6');
check(b2b.movementModifiers.staminaDrain === 1.3, 'B2B staminaDrain 1.3');

// Anchor Man vs Poacher action contrast
const anchor = getRoleModifier('CDM_anchor_man_defend');
const poacher = getRoleModifier('ST_poacher_attack');
check(anchor.actionModifiers.shoot === 0.3, 'Anchor man low shoot');
check(poacher.actionModifiers.shoot === 1.7, 'Poacher high shoot');
check(anchor.actionModifiers.tackle === 1.3, 'Anchor man high tackle');
check(poacher.actionModifiers.tackle === 0.2, 'Poacher low tackle');

// Default roles
check(getDefaultRole('GK') === 'GK_goalkeeper_defend', 'default GK role');
check(getDefaultRole('CM') === 'CM_box_to_box_support', 'default CM role');
check(getDefaultRole('ST') === 'ST_advanced_forward_attack', 'default ST role');

// getRoleName
check(getRoleName('CM_mezzala_attack') === 'Mezzala (Attack)', 'role name lookup');

// Multi-position role (FB roles available for LB/RB)
check(validateRoleForPosition('FB_wing_back_attack', 'LB'), 'wing-back role valid for LB');
check(validateRoleForPosition('FB_wing_back_attack', 'RB'), 'wing-back role valid for RB');

// Wing-back positions (LB has many FB group roles)
const lbRoles = getAvailableRolesForPosition('LB');
check(lbRoles.length >= 4, `LB has >=4 roles (${lbRoles.length})`);

// ================================================================
// P4.3 — Player Traits
// ================================================================
console.log('\n--- P4.3 Player Traits ---');

const traitCount = Object.keys(PLAYER_TRAITS).length;
check(traitCount >= 29, `>=29 traits, got ${traitCount}`);

// Trait categories
check(getTraitCategory('comes_deep_to_get_ball') === 'movement', 'comes_deep is movement trait');
check(getTraitCategory('plays_one_twos') === 'action', 'plays_one_twos is action trait');
check(getTraitCategory('dictates_tempo') === 'reaction', 'dictates_tempo is reaction trait');
check(getTraitCategory('marks_opponent_tightly') === 'marking', 'marks_opponent_tightly is marking trait');

// evaluateTraits — basic additive merging
const testPlayer = { position: 'CM', traits: ['plays_one_twos', 'tries_killer_balls_often'] };
const effects = evaluateTraits(testPlayer, { ball: [340, 500], ballPossession: 'home' });
check(effects.actionModifiers.pass === 0.2, 'one-twos + killerBalls pass = 0.3 + -0.1 = 0.2');
check(effects.actionModifiers.throughBall === 0.6, 'killerBalls throughBall = 0.5 + 0.1 = 0.6');
check(effects.actionModifiers.dribble === -0.2, 'one-twos dribble = -0.2');
check(effects.flags.length === 0, 'no flags for these traits');

// Conditional traits
const farPlayer = { position: 'CM', originPOS: [340, 350], currentPOS: [340, 350], traits: ['shoots_from_distance'] };
const farEffects = evaluateTraits(farPlayer, { ball: [340, 350], ballPossession: 'home' });
check(farEffects.actionModifiers.shoot === 0.6, 'shoots_from_distance fires when far from goal');

// Should NOT fire when close to goal (ball within 200 units of goal)
const closePlayer = { position: 'ST', originPOS: [340, 700], currentPOS: [340, 700], traits: ['shoots_from_distance'] };
const closeEffects = evaluateTraits(closePlayer, { ball: [340, 850], ballPossession: 'home' });
check(closeEffects.actionModifiers.shoot === undefined, 'shoots_from_distance does NOT fire close to goal');

// Flag-producing traits
const flagPlayer = { position: 'CM', traits: ['winds_up_opponents', 'argues_with_officials'] };
const flagEffects = evaluateTraits(flagPlayer, { ballPossession: 'home' });
check(flagEffects.flags.includes('provocateur'), 'winds_up gives provocateur flag');
check(flagEffects.flags.includes('card_risk'), 'argues gives card_risk flag');

// Position-conditional traits (cuts_inside only for wide players)
const widePlayer = { position: 'LW', traits: ['cuts_inside_from_both_flanks', 'hugs_line'] };
const wideEffects = evaluateTraits(widePlayer, { ballPossession: 'home' });
check(wideEffects.movementModifiers.stayWide === 0.1, 'cuts_inside + hugs_line stayWide = -0.6 + 0.7 = 0.1');
check(wideEffects.movementModifiers.cutInside === 0.2, 'cuts_inside + hugs_line cutInside = 0.7 + -0.5 = 0.2');

// Central player should not get cuts_inside effect
const centralPlayer = { position: 'CM', traits: ['cuts_inside_from_both_flanks'] };
const centralEffects = evaluateTraits(centralPlayer, { ballPossession: 'home' });
check(centralEffects.movementModifiers.stayWide === undefined, 'cuts_inside does NOT fire for CM');

// arrives_late_in_opponents_area only for mid/DM
const midPlayer = { position: 'CM', traits: ['arrives_late_in_opponents_area'] };
const midEffects2 = evaluateTraits(midPlayer, { ballPossession: 'home' });
check(midEffects2.actionModifiers.shoot === 0.2, 'arrives_late shoot modifier for CM');
check(midEffects2.movementModifiers.forwardRuns === 0.3, 'arrives_late forwardRuns for CM');

const stPlayerArrive = { position: 'ST', traits: ['arrives_late_in_opponents_area'] };
const stArriveEffects = evaluateTraits(stPlayerArrive, { ballPossession: 'home' });
check(stArriveEffects.actionModifiers.shoot === undefined, 'arrives_late does NOT fire for ST');

// getAllTraits
check(getAllTraits().length === traitCount, 'getAllTraits count matches');

// getStylePresetList
check(getStylePresetList().length === 7, 'getStylePresetList returns 7 entries');

// ================================================================
// P4.4 — Actions Integration
// ================================================================
console.log('\n--- P4.4 Actions Integration ---');

// calculateModifiedActionWeight — B2B midfielder 'run' weight higher than Anchor Man
const b2bPlayer = { position: 'CM', role: 'CM_box_to_box_support', traits: [] };
const anchorPlayer = { position: 'CDM', role: 'CDM_anchor_man_defend', traits: [] };
const matchCtx = { ball: [340, 500], ballPossession: 'home', scenario: 'possession', freeKickDistance: 0 };

const b2bRun = calculateModifiedActionWeight(b2bPlayer, 'run', matchCtx, null);
const anchorRun = calculateModifiedActionWeight(anchorPlayer, 'run', matchCtx, null);
check(b2bRun >= 1.3, `B2B run weight >=1.3: ${b2bRun}`);
check(anchorRun <= 0.3, `Anchor run weight <=0.3: ${anchorRun}`);
check(b2bRun > anchorRun * 4, `B2B run >> Anchor run: ${b2bRun} vs ${anchorRun}`);

// Trait: killer balls → throughBall weight
const killerPlayer = { position: 'CM', role: 'CM_central_midfielder_support', traits: ['tries_killer_balls_often'] };
const killerThrough = calculateModifiedActionWeight(killerPlayer, 'throughBall', matchCtx, null);
check(killerThrough >= 1.5, `killerBalls throughBall >=1.5: ${killerThrough}`);

// Strategy: tiki_taka → pass weight up, boot weight down
const tikiTeam = { _passingWeights: { short: 1.3, through: 0.8, long: 0.4 }, _tempoMultiplier: { pace: 0.85, passing: 1.10 }, _pressingMultiplier: 1.30 };
const tikiPlayer = { position: 'CM', role: 'CM_central_midfielder_support', traits: [] };
const tikiPass = calculateModifiedActionWeight(tikiPlayer, 'pass', matchCtx, tikiTeam);
const tikiBoot = calculateModifiedActionWeight(tikiPlayer, 'boot', matchCtx, tikiTeam);
check(tikiPass >= 1.3, `tiki_taka pass weight >=1.3: ${tikiPass}`);
check(tikiBoot <= 0.5, `tiki_taka boot weight <=0.5: ${tikiBoot}`);

// Strategy: gegenpress → tackle weight up
const ggnTeam = { _tempoMultiplier: { pace: 1.15, passing: 0.90 }, _pressingMultiplier: 1.30, _passingWeights: { short: 0.8, through: 1.15, long: 1.2 } };
const ggnTackle = calculateModifiedActionWeight(anchorPlayer, 'tackle', matchCtx, ggnTeam);
check(ggnTackle >= 1.5, `gegenpress tackle weight >=1.5: ${ggnTackle}`);

// getModifiedActionWeights — returns all 11 actions
const allWeights = getModifiedActionWeights(b2bPlayer, matchCtx, null);
check(Object.keys(allWeights).length === 11, 'getModifiedActionWeights returns 11 actions');
check(allWeights.run > 1.0, 'B2B run weight > default');
check(allWeights.shoot > 0.0, 'B2B shoot weight present');

// Fallback to 1.0 with no role/strategy
const noRolePlayer = { position: 'CM', traits: [] };
const fallback = calculateModifiedActionWeight(noRolePlayer, 'shoot', null, null);
check(fallback === 1.0, `no role/strategy fallback = 1.0: ${fallback}`);

// applyTacticalModifiers on raw array
const rawWeights = [50, 10, 30, 10, 0, 0, 0, 20, 10, 0, 0];
const tacticalPlayer = { position: 'CM', role: 'CM_box_to_box_support', traits: ['tries_killer_balls_often'] };
const mockMD = {
  ball: { withPlayer: true, withTeam: 'team1', position: [340, 500] },
  kickOffTeam: { teamID: 'team1' },
  _homeStrategy: null,
  pitchSize: [680, 1050],
  _halfIteration: 1500,
};
const modified = applyTacticalModifiers([...rawWeights], tacticalPlayer, mockMD, null);
check(Array.isArray(modified) && modified.length === 11, 'applyTacticalModifiers returns 11 elements');
check(modified[1] > rawWeights[1], 'throughBall weight increased by killer balls trait');

// ================================================================
// P4.5 — Movement Integration
// ================================================================
console.log('\n--- P4.5 Movement Integration ---');

// getMovementModifiers — B2B midfielder vs Anchor Man
const b2bMove = getMovementModifiers(b2bPlayer, null, { ballPossession: 'home' });
const anchorMove = getMovementModifiers(anchorPlayer, null, { ballPossession: 'home' });
check(b2bMove.forwardRuns > 1.5, `B2B forwardRuns > 1.5: ${b2bMove.forwardRuns}`);
check(anchorMove.forwardRuns <= 1.1, `Anchor forwardRuns <= 1.1: ${anchorMove.forwardRuns}`);
check(anchorMove.holdPosition >= 1.8, `Anchor holdPosition >= 1.8: ${anchorMove.holdPosition}`);

// Stamina drain difference
check(b2bMove.staminaDrain > anchorMove.staminaDrain, `B2B staminaDrain (${b2bMove.staminaDrain}) > Anchor (${anchorMove.staminaDrain})`);

// Strategy modifies width
const wideTeam = { _widthMultiplier: 1.15, _pressingMultiplier: 1.0, _fluidityFactor: 0.3 };
const wideMove = getMovementModifiers({ position: 'LM', role: null, traits: [] }, wideTeam, { ballPossession: 'home' });
check(wideMove.stayWide >= 1.14, `wide strategy stayWide >=1.14: ${wideMove.stayWide}`);

// stayWide trait
const hugPlayer = { position: 'LW', traits: ['hugs_line'] };
const hugEffects = getMovementModifiers(hugPlayer, null, { ballPossession: 'home' });
check(hugEffects.stayWide > 1.6, `hugs_line stayWide > 1.6: ${hugEffects.stayWide}`);
check(hugEffects.cutInside < 0.6, `hugs_line cutInside < 0.6: ${hugEffects.cutInside}`);

// stays_back_at_all_times — completely removes forward runs
const stayBackPlayer = { position: 'CB', traits: ['stays_back_at_all_times'] };
const stayBackMove = getMovementModifiers(stayBackPlayer, null, { ballPossession: 'home' });
check(stayBackMove.forwardRuns <= 0.2, `stays_back forwardRuns nearly 0: ${stayBackMove.forwardRuns}`);
check(stayBackMove.holdPosition > 1.3, `stays_back holdPosition high: ${stayBackMove.holdPosition}`);

// gets_forward_whenever_possible
const gfwPlayer = { position: 'CM', traits: ['gets_forward_whenever_possible'] };
const gfwMove = getMovementModifiers(gfwPlayer, null, { ballPossession: 'home' });
check(gfwMove.forwardRuns >= 1.25, `gets_forward forwardRuns >=1.25: ${gfwMove.forwardRuns}`);
check(gfwMove.holdPosition < 0.8, `gets_forward holdPosition <0.8: ${gfwMove.holdPosition}`);

// Clamping: values in [0.1, 2.0]
for (const key of Object.keys(b2bMove)) {
  check(b2bMove[key] >= 0.1 && b2bMove[key] <= 2.0, `${key} clamped [0.1, 2.0]: ${b2bMove[key]}`);
}

// Wing-back attack: forwardRuns from role
const wbPlayer = { position: 'LB', role: 'FB_wing_back_attack', traits: [] };
const wbMove = getMovementModifiers(wbPlayer, null, { ballPossession: 'home' });
check(wbMove.forwardRuns > 1.7, `wing-back attack forwardRuns >1.7: ${wbMove.forwardRuns}`);
check(wbMove.stayWide > 1.8, `wing-back attack stayWide >1.8: ${wbMove.stayWide}`);

// ================================================================
// P4.7 — Tactics Glue Layer
// ================================================================
console.log('\n--- P4.7 Glue Layer ---');

// computeOriginPOSForStarters with defensive line offset
const starters = [
  { position: 'GK' },
  { position: 'CB' },
  { position: 'CB' },
  { position: 'ST' },
];
const highLinePos = computeOriginPOSForStarters(starters, '4-4-2', { pitchWidth: 680, pitchHeight: 1050 }, {
  _defensiveLineOffset: 60,
  mentality: 'balanced',
});
check(highLinePos[0][1] === 50, 'GK Y unchanged by line offset');
check(highLinePos[1][1] === 210, `high line CB Y = 210 (150 + 60): ${highLinePos[1][1]}`);

const deepLinePos = computeOriginPOSForStarters(starters, '4-4-2', { pitchWidth: 680, pitchHeight: 1050 }, {
  _defensiveLineOffset: -60,
  mentality: 'balanced',
});
check(deepLinePos[0][1] === 50, 'GK Y unchanged by deep line offset');
check(deepLinePos[1][1] === 90, `deep line CB Y = 90 (150 - 60): ${deepLinePos[1][1]}`);

// ================================================================
// Summary
// ================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`PASSED: ${passed}  FAILED: ${failed}  TOTAL: ${passed + failed}`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.error('\n❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL PHASE 4 TESTS PASSED');
  process.exit(0);
}
