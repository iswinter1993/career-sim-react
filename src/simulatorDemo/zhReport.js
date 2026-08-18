// zhReport.js — RealTimeReporter 的中文移植。
//
// 引擎原版 RealTimeReporter 产出的比赛故事是英文模板，这里按同一套
// 统计逻辑（final-third 反抢、射门线路、球员数据、换人/伤停/红牌）输出中文。
// 结构保持一致：{ headline, summary, teams, sections, turningPoints }，
// sections/turningPoints 均为 { title, text, teamSide?, time? }。

import { labelize, teamSideLabel } from './zhLabels';

function finalThirdRecoveries(events, side) {
  return events.filter((event) => (
    event.teamSide === side
    && ['interception', 'tackle', 'recovery'].includes(event.type)
    && event.fieldZones.includes('final_third')
  )).length;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countBy(events, keyForEvent) {
  return events.reduce((counts, event) => {
    const key = keyForEvent(event);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topEntry(counts) {
  const entry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return entry ? { key: entry[0], value: entry[1] } : null;
}

function topPlayer(events, ...types) {
  const counts = new Map();
  events
    .filter((event) => event.teamSide && event.player && types.includes(event.type))
    .forEach((event) => {
      const key = `${event.teamSide}:${event.playerId}`;
      const current = counts.get(key) || {
        name: event.player?.info.name || '未知球员',
        count: 0,
        side: event.teamSide,
      };
      current.count += 1;
      counts.set(key, current);
    });
  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || null;
}

export default function zhReport(engine) {
  const snapshots = engine.snapshots;
  const finalSnapshot = snapshots[snapshots.length - 1] || engine.start();
  const events = engine.events;

  function eventsFor(side, type) {
    return events.filter((event) => event.teamSide === side && event.type === type);
  }

  function teamReport(side, name, style, goals) {
    const passes = eventsFor(side, 'pass').length;
    const completions = eventsFor(side, 'receive').length;
    const players = finalSnapshot.players.filter((player) => player.teamSide === side);

    return {
      name,
      style: labelize(style),
      goals,
      shots: eventsFor(side, 'shot').length,
      passCompletion: passes ? completions / passes : 0,
      finalThirdRecoveries: finalThirdRecoveries(events, side),
      averageStamina: average(players.map((player) => player.stamina)),
    };
  }

  const home = teamReport('home', engine.homeTeam.name, engine.state.tactics.home.style, finalSnapshot.score.home);
  const away = teamReport('away', engine.awayTeam.name, engine.state.tactics.away.style, finalSnapshot.score.away);

  const tacticalPatternSection = () => {
    const topPattern = topEntry(countBy(
      events.filter((event) => event.activeAttackPattern && event.activeAttackPattern !== 'none'),
      (event) => event.activeAttackPattern,
    ));
    const team = home.finalThirdRecoveries >= away.finalThirdRecoveries ? home : away;

    if (!topPattern) {
      return {
        title: '战术形态',
        text: `${home.name} 以${home.style}应对 ${away.name} 的${away.style}，但双方都未能形成主导的进攻套路。`,
      };
    }

    return {
      title: '战术形态',
      teamSide: team === home ? 'home' : 'away',
      text: `${home.name} 以${home.style}应对 ${away.name} 的${away.style}。比赛大多陷入${labelize(topPattern.key)}套路，${team.name} 制造了更多前场反抢。`,
    };
  };

  const chanceCreationSection = () => {
    const shots = events.filter((event) => event.type === 'shot');
    const topRoute = topEntry(countBy(shots, (event) => event.outcome || 'open_play'));
    const averageChance = average(shots
      .map((event) => event.chanceQuality || 0)
      .filter((quality) => quality > 0));

    if (!topRoute) {
      return {
        title: '机会创造',
        text: '双方都未能形成清晰的射门套路。',
      };
    }

    return {
      title: '机会创造',
      text: `${labelize(topRoute.key)}是主要的射门线路（${topRoute.value} 次射门），平均机会质量 ${averageChance.toFixed(2)}。`,
    };
  };

  const pressingSection = () => {
    const strongerPress = home.finalThirdRecoveries >= away.finalThirdRecoveries ? home : away;
    const weakerPress = strongerPress === home ? away : home;
    const side = strongerPress === home ? 'home' : 'away';
    const staminaGap = weakerPress.averageStamina - strongerPress.averageStamina;
    const fatigueText = staminaGap > 4
      ? `，但平均体能最终低了 ${staminaGap.toFixed(1)} 分`
      : '';

    return {
      title: '逼抢',
      teamSide: side,
      text: `${strongerPress.name} 完成 ${strongerPress.finalThirdRecoveries} 次前场反抢，对方为 ${weakerPress.finalThirdRecoveries} 次${fatigueText}。`,
    };
  };

  const playerImpactSection = () => {
    const topShooter = topPlayer(events, 'shot');
    const topPasser = topPlayer(events, 'pass');
    const topDefender = topPlayer(events, 'tackle', 'interception');
    const parts = [
      topShooter ? `${topShooter.name} 领跑射门次数（${topShooter.count} 次）` : '',
      topPasser ? `${topPasser.name} 主导球权流转（${topPasser.count} 次传球）` : '',
      topDefender ? `${topDefender.name} 领跑防守动作（${topDefender.count} 次）` : '',
    ].filter(Boolean);

    return {
      title: '球员表现',
      teamSide: topShooter?.side,
      text: parts.length ? `${parts.join('；')}。` : '没有单一球员主导本场数据。',
    };
  };

  const managerImpactSection = () => {
    const substitutions = events.filter((event) => event.type === 'substitution');
    const tacticalChanges = events.filter((event) => event.type === 'tactical_change');
    const roleChanges = events.filter((event) => event.type === 'role_change');
    const redCards = events.filter((event) => event.type === 'red_card');
    const injuries = events.filter((event) => event.type === 'injury');

    if (!substitutions.length && !tacticalChanges.length && !roleChanges.length && !redCards.length && !injuries.length) {
      return {
        title: '临场调度',
        text: '比赛基本按照赛前战术布置进行，没有换人、伤停或红牌改变局面。',
      };
    }

    const notes = [
      tacticalChanges.length ? `${tacticalChanges.length} 次战术调整` : '',
      roleChanges.length ? `${roleChanges.length} 次位置调整` : '',
      substitutions.length ? `${substitutions.length} 次换人` : '',
      injuries.length ? `${injuries.length} 次伤停` : '',
      redCards.length ? `${redCards.length} 张红牌` : '',
    ].filter(Boolean);

    return {
      title: '临场调度',
      text: `${notes.join('、')} 在赛前布置成型后改变了人员与比赛节奏。`,
    };
  };

  const turningPointText = (event) => {
    const player = event.player?.info.name || teamSideLabel(event.teamSide) || '比赛';
    const outcome = event.outcome ? `，源自${labelize(event.outcome.replace(/_goal$/, ''))}` : '';

    if (event.type === 'goal') {
      return `${player} 破门得分${outcome}，来自第 ${event.possession.id} 次控球。`;
    }

    if (event.type === 'substitution') {
      return `${player} 登场，因${labelize(event.outcome || 'manager_choice')}。`;
    }

    if (event.type === 'tactical_change') {
      return `${teamSideLabel(event.teamSide)}调整了战术计划，以${labelize(event.outcome || 'manager_tactical_change')}。`;
    }

    if (event.type === 'role_change') {
      return `${player} 调整位置，以${labelize(event.outcome || 'manager_role_change')}。`;
    }

    if (event.type === 'penalty') {
      return `${player} 是这次点球的焦点${outcome}。`;
    }

    return `${player} 制造了一个${labelize(event.type)}时刻。`;
  };

  const turningPoints = () => events
    .filter((event) => {
      if (event.type === 'penalty' && event.outcome === 'goal') {
        return false;
      }
      return ['goal', 'penalty', 'red_card', 'substitution', 'tactical_change', 'role_change', 'injury'].includes(event.type);
    })
    .slice(0, 6)
    .map((event) => ({
      title: labelize(event.type),
      text: turningPointText(event),
      teamSide: event.teamSide,
      time: event.time,
    }));

  const sections = [
    tacticalPatternSection(),
    chanceCreationSection(),
    pressingSection(),
    playerImpactSection(),
    managerImpactSection(),
  ];

  const summary = () => {
    const shotLeader = home.shots >= away.shots ? home : away;
    const passLeader = home.passCompletion >= away.passCompletion ? home : away;
    const leadSection = sections[0];

    return `${leadSection.text} ${shotLeader.name} 射门次数 ${shotLeader.shots}-${shotLeader === home ? away.shots : home.shots} 领先，而 ${passLeader.name} 的传球节奏更顺畅。`;
  };

  return {
    headline: `${home.name} ${home.goals}-${away.goals} ${away.name}`,
    summary: summary(),
    teams: { home, away },
    sections,
    turningPoints: turningPoints(),
  };
}
