// Diagnostic: trace what happens after transfer club selection
// Run with: node --experimental-vm-modules debug_transfer.js
// (actually just run in browser context via simEngine)
// Save to file, run via bash

const fs = require('fs');
const vm = require('vm');

// Read engine files
const dataCode = fs.readFileSync(__dirname + '/public/data.js', 'utf8');
const eventsCode = fs.readFileSync(__dirname + '/public/events.js', 'utf8');
const simCode = fs.readFileSync(__dirname + '/public/sim.js', 'utf8');

// Create sandbox
const sandbox = {
  window: {},
  document: { createElement: () => ({}) },
  Math: Math, parseInt: parseInt, String: String, Number: Number,
  Array: Array, Object: Object, JSON: JSON, Date: Date,
  setTimeout: setTimeout, console: console,
};
vm.createContext(sandbox);

// Load scripts
vm.runInContext(dataCode, sandbox);
vm.runInContext(eventsCode, sandbox);
vm.runInContext(simCode, sandbox);

const SIM = sandbox.window.SIM;

// Start a new game
const identity = {
  name: '测试球员',
  number: 10,
  foot: '右',
  pos: 'CM',
  originId: 'shanghai',
};
const seed = '123456789';
SIM.newState('normal', identity, seed);

// Step through: first should be academy
let state = SIM.state();
console.log('=== INITIAL ===');
console.log('phase:', state.phase);
console.log('pending:', JSON.stringify(state.pending?.type));

// Academy offers
console.log('\n=== ACADEMY PHASE ===');
console.log('pending:', JSON.stringify(state.pending));

// Pick first academy team
console.log('\n=== CHOOSE ACADEMY 0 ===');
let result = SIM.choose(0);
state = SIM.state();
console.log('choose result:', result);
console.log('pending after choose:', JSON.stringify(state.pending?.type));
if (state.pending) console.log('pending details:', JSON.stringify(state.pending).slice(0, 300));

// Now step through several transfers and events, simulating 4-club transfer
function stepThrough(targetClubs) {
  let clubs = 0;
  let prevTeam = null;
  
  for (let step = 0; step < 500 && clubs < targetClubs; step++) {
    state = SIM.state();
    
    if (state.phase === 'summary') {
      console.log('REACHED SUMMARY at step', step, 'clubs:', clubs);
      break;
    }
    
    const pending = state.pending;
    if (!pending) {
      SIM.nextStep();
      continue;
    }
    
    const teamId = state.teamId;
    if (teamId && teamId !== prevTeam) {
      clubs++;
      prevTeam = teamId;
      const team = SIM.teamById(teamId);
      console.log(`\n=== CLUB #${clubs}: ${team?.name || teamId} ===`);
    }
    
    if (pending.type === 'event' || pending.type === 'random') {
      // Pick option 0
      const result = SIM.choose(0);
      state = SIM.state();
      const newPending = state.pending;
      console.log(`  event: ${pending.eventId}, result: ${!!result}, newPending: ${newPending?.type || 'null'}`);
      
      if (newPending?.type === 'event' || newPending?.type === 'random') {
        // Sometimes event has result already
        if (newPending.result) {
          console.log(`  event has result, cont...`);
          SIM.cont();
        }
      }
    } else if (pending.type === 'academy') {
      SIM.choose(0);
      console.log('  academy: chose first team');
    } else if (pending.type === 'transfer') {
      const offers = pending.offers || [];
      console.log(`  transfer: ${offers.length} offers, canStay: ${pending.canStay}, canRetire: ${pending.canRetire}`);
      if (offers.length > 0) {
        result = SIM.choose(0);
        state = SIM.state();
        console.log(`  chose transfer 0, result: ${result}, newPending: ${state.pending?.type || 'null'}`);
      } else if (pending.canStay) {
        result = SIM.choose('stay');
        state = SIM.state();
        console.log(`  chose stay, result: ${result}, newPending: ${state.pending?.type || 'null'}`);
      }
    } else if (pending.type === 'recap' || pending.type === 'report') {
      SIM.cont();
      console.log('  recap: continued');
    } else if (pending.type === 'end') {
      SIM.goSummary('test');
      console.log('  end: goSummary');
    } else {
      console.log(`  UNKNOWN PENDING TYPE: ${pending.type}`);
      break;
    }
  }
  
  console.log('\n=== FINAL STATE ===');
  console.log('clubs:', clubs, 'phase:', state.phase);
  console.log('age:', state.age, 'ovr:', state.ovr);
  const clubsPlayed = state.clubsPlayed || [];
  console.log('clubsPlayed:', clubsPlayed.length);
}

stepThrough(5);
console.log('\nDONE');
