import { EventEmitter } from 'events';

declare enum Action {
    Advance = 0,
    Stay = 1,
    Retreat = 2,
    GoalAttempt = 3
}

export declare interface ActiveBallAction {
    type: 'pass' | 'shot';
    from: SimulatedPlayer;
    teamSide: TeamSide;
    origin?: Vector2;
    target: Vector2;
    targetPlayer?: SimulatedPlayer;
    inaccurate: boolean;
    quality: number;
    estimatedArrivalTime?: number;
    passSpeed?: number;
    receiveDifficulty?: number;
    targetKind?: 'feet' | 'space' | 'contest';
    route?: string;
    restartType?: RestartState['phase'];
    chanceQuality?: number;
}

declare enum AssistType {
    Pass = 0,
    Cross = 1,
    Rebound = 2,
    Deflection = 3
}

export declare type AttackingFocus = 'balanced' | 'wide' | 'central';

export declare type AttackPattern = 'none' | 'patient_buildup' | 'midfield_progression' | 'final_third_probe' | 'wide_overload' | 'switch_of_play' | 'overlap' | 'underlap' | 'through_ball' | 'cross' | 'cutback' | 'late_run' | 'rebound' | 'second_ball' | 'set_piece' | 'central_combination' | 'defensive_transition';

export declare const attackPositions: Position[];

export declare type BallRecoverySource = 'rebound' | 'second_ball';

export declare interface BallState {
    x: number;
    y: number;
    velocity: Vector2;
    owner: SimulatedPlayer | null;
    lastTouchSide: TeamSide | null;
    lastTouchPlayerId: string | null;
}

export declare const centerPositions: Position[];

export declare class Commentator {
    name: string;
    constructor(name?: string);
    routeComment(event: GameEvent): string | null;
    comment(event: GameEvent): string | null;
    gameStarted(event: GameEvent): string;
    kickoff(event: GameEvent): string;
    halfTime(event: GameEvent): string;
    advance(event: GameEvent): string;
    defence(event: GameEvent): string;
    rebound(comment: string, event: GameEvent): string;
    save(event: GameEvent): string;
    block(event: GameEvent): string;
    goal(event: GameEvent): string;
    gameEnded(event: GameEvent): string;
}

export declare const defencePositions: Position[];

export declare class Engine {
    /**
     * Has the game started?
     */
    gameStarted: boolean;
    /**
     * Has the game ended?
     */
    gameEnded: boolean;
    /**
     * Number of minutes for a full game
     */
    gameTime: number;
    /**
     * Number of events per minutes. This decides how eventful the game should be,
     * how many actions can take place within a minute.
     */
    eventsPerMinute: number;
    /**
     * Extra rating points for home team attributes
     */
    homeTeamAdvantage: number;
    /**
     * All attributes are randomized on each simulation using
     * a positive or negative version of this value
     */
    randomEffect: number;
    /**
     * Chance (0 to 1) to get the ball back after goal attempt.
     */
    reboundChance: number;
    /**
     * Increase attack attributes on goal chance
     */
    extraAttackOnChance: number;
    /**
     * Current team with possession.
     */
    ballPossession: Team | null;
    /**
     * The team that started with the ball.
     */
    startedWithBall: Team | null;
    /**
     * FieldArea enum describing the current ball position.
     */
    ballPosition: FieldArea;
    /**
     * Game info object describing the current state of the game
     */
    gameInfo: GameInfo;
    /**
     * Array containing all simulations
     */
    gameEvents: GameEvent[];
    /**
     * The game loop
     */
    gameLoop: IterableIterator<GameEvent>;
    /**
     * The home team
     */
    homeTeam: Team;
    /**
     * The away team
     */
    awayTeam: Team;
    /**
     * The field
     */
    field: Field;
    constructor(homeTeam: Team, awayTeam: Team);
    start(): void;
    teamWithoutBall(): Team;
    simulate: () => void;
    rebound(): boolean;
    handleEvent(event: GameEvent): void;
    eventLoop(): Generator<GameEvent, void, unknown>;
    gameEvent(event: Event_2, data?: any, attackingPrimaryPlayer?: Player | null, attackingSecondaryPlayer?: Player | null, defendingPrimaryPlayer?: Player | null, defendingSecondaryPlayer?: Player | null, goalType?: GoalType | null, assistType?: AssistType | null): GameEvent;
    random(team: Team): number;
    simulateGoalAttempt(attackingTeam: Team, defendingTeam: Team, attacker: Player): Event_2;
    simulatePossession(attackingTeam: Team, defendingTeam: Team, action: Action): Event_2;
    simulateAction(action: Action, attacker: Player): Event_2;
    simulateAssistType(secondaryPlayer: Player): AssistType | null;
    simulateGoalType(primaryPlayer: Player, secondaryPlayer: Player): [GoalType, AssistType | null];
    halfTime(): GameEvent;
    gameEnd(): GameEvent;
    goal(attackingPrimaryPlayer: Player, attackingSecondaryPlayer: Player): [GoalType, AssistType | null];
    simulateEvent(): GameEvent;
}

declare enum Event_2 {
    GameStart = 0,
    Kickoff = 1,
    HalfTime = 2,
    GameEnd = 3,
    Injury = 4,
    Goal = 5,
    Save = 6,
    Block = 7,
    Substitution = 8,
    Possession = 9,
    Defence = 10,
    EventLess = 11,
    Advance = 12,
    Retreat = 13,
    Corner = 14,
    FreeKick = 15
}

export declare class Field {
    areas: FieldArea[][];
    fieldAreaToNumber(area: FieldArea): number[];
    columnToNumber(col: FieldColumn): number;
    startPosition(): FieldArea;
    randomDirection(): FieldColumn;
    reverseSide(current: FieldArea): FieldArea;
    move(current: FieldArea, rowDirection?: number, columnDirection?: FieldColumn | null): FieldArea;
    advance(current: FieldArea, columnDirection?: FieldColumn | null): FieldArea;
    retreat(current: FieldArea, columnDirection?: FieldColumn | null): FieldArea;
}

declare enum FieldArea {
    DefensiveLeft = "A1",
    DefensiveCenter = "B1",
    DefensiveRight = "C1",
    PreDefensiveLeft = "A2",
    PreDefensiveCenter = "B2",
    PreDefensiveRight = "C2",
    MidfieldLeft = "A3",
    MidfieldCenter = "B3",
    MidfieldRight = "C3",
    PreAttackingLeft = "A4",
    PreAttackingCenter = "B4",
    PreAttackingRight = "C4",
    AttackingLeft = "A5",
    AttackingCenter = "B5",
    AttackingRight = "C5"
}

declare type FieldColumn = 'A' | 'B' | 'C';

export declare type FieldZone = 'defensive_third' | 'middle_third' | 'attacking_third' | 'final_third' | 'wide_left' | 'wide_right' | 'half_space_left' | 'half_space_right' | 'central_lane' | 'box' | 'byline';

export declare class Game extends EventEmitter {
    /**
     * Milliseconds between each simulation
     */
    gameSpeed: number;
    /**
     * Engine
     */
    engine: Engine;
    /**
     * The home team
     */
    homeTeam: Team;
    /**
     * The away team
     */
    awayTeam: Team;
    /**
     * The commentator
     */
    commentator: Commentator;
    /**
     * Events copy
     */
    events: GameEvent[];
    constructor(homeTeam: Team, awayTeam: Team, commentator: Commentator);
    start(): void;
    simulate(): void;
    loop: () => void;
    report(): void;
}

declare interface GameEvent {
    event: Event_2;
    data: any;
    gameInfo: GameInfo;
    attackingTeam: Team;
    defendingTeam: Team;
    fieldPosition: FieldArea;
    attackingPrimaryPlayer: Player | null;
    attackingSecondaryPlayer: Player | null;
    defendingPrimaryPlayer: Player | null;
    defendingSecondaryPlayer: Player | null;
    homeTeam: Team;
    awayTeam: Team;
    goalType: GoalType | null;
    assistType: AssistType | null;
}

declare interface GameInfo {
    matchMinute: number;
    homeGoals: number;
    awayGoals: number;
}

export declare interface GoalkeeperAttributes {
    aerialReach: number;
    commandOfArea: number;
    communication: number;
    eccentricity: number;
    handling: number;
    oneOnOnes: number;
    reflexes: number;
    rushingOut: number;
    tendencyToPunch: number;
    throwing: number;
}

export declare interface GoalkeeperRating {
    diving: number;
    hands: number;
    kicking: number;
    reflexes: number;
    speed: number;
    positioning: number;
}

declare enum GoalType {
    Shot = 0,
    Volley = 1,
    Header = 2
}

export declare const leftPositions: Position[];

export declare type MatchPhase = 'kickoff' | 'open_play' | 'throw_in' | 'corner' | 'goal_kick' | 'free_kick' | 'penalty' | 'injury_stoppage' | 'substitution' | 'half_time' | 'full_time';

export declare interface MatchSlice {
    state: MatchState;
    events: RealTimeMatchEvent[];
    snapshot: MatchSnapshot;
}

export declare interface MatchSnapshot {
    time: number;
    period: 1 | 2 | 'ended';
    phase: MatchPhase;
    addedTime: {
        firstHalf: number;
        secondHalf: number;
    };
    score: {
        home: number;
        away: number;
    };
    ball: {
        x: number;
        y: number;
        velocity: Vector2;
        ownerId: string | null;
    };
    activePassTarget: Vector2 | null;
    activeShot: {
        route: string;
        chanceQuality: number;
        target: Vector2;
    } | null;
    secondBall: {
        x: number;
        y: number;
        expiresAt: number;
        source: BallRecoverySource;
    } | null;
    possession: PossessionContext;
    fieldZones: FieldZone[];
    activeAttackPattern: AttackPattern;
    players: MatchSnapshotPlayer[];
    events: RealTimeMatchEvent[];
}

export declare interface MatchSnapshotPlayer {
    id: string;
    teamSide: TeamSide;
    role: Position;
    roleName: string;
    playerName: string;
    playerNumber: number;
    x: number;
    y: number;
    stamina: number;
    foulsCommitted: number;
    foulsSuffered: number;
    yellowCards: number;
    redCard: boolean;
    injurySeverity: 'none' | 'knock' | 'minor' | 'forced';
    currentIntent: PlayerIntent;
    target: Vector2;
}

export declare interface MatchState {
    time: number;
    period: 1 | 2 | 'ended';
    phase: MatchPhase;
    ball: BallState;
    players: SimulatedPlayer[];
    tactics: {
        home: Tactics;
        away: Tactics;
    };
    referee: RefereeProfile;
    score: {
        home: number;
        away: number;
    };
    activeBallAction: ActiveBallAction | null;
    secondBall: SecondBallState | null;
    restart: RestartState | null;
    possession: PossessionContext;
    addedTime: {
        firstHalf: number;
        secondHalf: number;
    };
    bench: {
        home: SimulatedPlayer[];
        away: SimulatedPlayer[];
    };
    substitutionsUsed: {
        home: number;
        away: number;
    };
}

export declare interface MentalAttributes {
    aggression: number;
    anticipation: number;
    bravery: number;
    composure: number;
    concentration: number;
    decisions: number;
    determination: number;
    flair: number;
    leadership: number;
    offTheBall: number;
    positioning: number;
    teamwork: number;
    vision: number;
    workRate: number;
}

export declare type Mentality = 'defensive' | 'balanced' | 'attacking';

export declare const midfieldPositions: Position[];

export declare interface PhysicalAttributes {
    acceleration: number;
    agility: number;
    balance: number;
    jumpingReach: number;
    naturalFitness: number;
    pace: number;
    stamina: number;
    strength: number;
}

export declare class Player implements PlayerInterface {
    info: PlayerInfo;
    biometrics: PlayerBiometrics;
    attributes: PlayerAttributes;
    position: Position;
    constructor(info: PlayerInfo, biometrics: PlayerBiometrics, attributes: PlayerAttributes, position: Position);
    ratingAverage(): number;
    rating(): PlayerRating | GoalkeeperRating;
    averageRating(ratings: number[]): number;
    defenceRating(): number;
    possessionRating(): number;
    attackRating(): number;
    attributesAverage(...attributes: number[]): number;
}

export declare interface PlayerAttributes extends MentalAttributes, PhysicalAttributes, TechnicalAttributes, GoalkeeperAttributes {
}

export declare interface PlayerBiometrics {
    height: number;
    weight: number;
}

export declare interface PlayerInfo {
    name: string;
    number: number;
}

export declare interface PlayerIntent {
    type: PlayerIntentType;
    target: Vector2;
    targetPlayerId?: string;
    duration: number;
    urgency: number;
    tacticalRisk: number;
}

export declare type PlayerIntentType = 'hold_shape' | 'press' | 'cover_passing_lane' | 'track_runner' | 'overlap' | 'underlap' | 'attack_box' | 'drop_between_lines' | 'drift_wide' | 'make_forward_run' | 'recover_shape' | 'support_carrier' | 'support' | 'receive' | 'receive_pass' | 'dribble' | 'pass' | 'shoot' | 'recover' | 'attack_second_ball';

export declare interface PlayerInterface {
    info: PlayerInfo;
    biometrics: PlayerBiometrics;
    attributes: PlayerAttributes;
}

export declare interface PlayerRating {
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physique: number;
}

export declare enum Position {
    GK = 0,
    LB = 1,
    LCB = 2,
    CB = 3,
    RCB = 4,
    RB = 5,
    LWB = 6,
    LDM = 7,
    DM = 8,
    RDM = 9,
    RWB = 10,
    LM = 11,
    LCM = 12,
    CM = 13,
    RCM = 14,
    RM = 15,
    LW = 16,
    LCOM = 17,
    COM = 18,
    RCOM = 19,
    RW = 20,
    LF = 21,
    CF = 22,
    RF = 23,
    ST = 24
}

export declare interface PossessionContext {
    id: number;
    teamSide: TeamSide | null;
    startTime: number;
    startPhase: MatchPhase;
    passCount: number;
    lastPassRoute: string | null;
    lastSuccessfulPassRoute: string | null;
    lastProgressionZone: FieldZone | null;
    finalThirdEntries: number;
    wideEntries: number;
    boxEntries: number;
    secondBallRecoveries: number;
    setPieceOrigin: RestartState['phase'] | null;
    activeAttackPattern: AttackPattern;
    currentFieldZones: FieldZone[];
    lastRecoveryType: BallRecoverySource | null;
}

export declare class RealTimeEngine {
    tickSeconds: number;
    matchLengthSeconds: number;
    homeTeam: Team;
    awayTeam: Team;
    state: MatchState;
    events: RealTimeMatchEvent[];
    snapshots: MatchSnapshot[];
    gameStarted: boolean;
    private random;
    private startedWithBallSide;
    private baseTactics;
    private nextPhaseAfterSnapshot;
    private clearRestartAfterSnapshot;
    private nextPossessionId;
    constructor(homeTeam: Team, awayTeam: Team, options?: Partial<RealTimeEngineOptions>);
    start(): MatchSnapshot;
    simulate(untilSeconds?: number): MatchSnapshot[];
    applyTacticalChange(side: TeamSide, changes: Partial<Tactics>, reason?: string): RealTimeMatchEvent;
    applyRoleChange(playerId: string, role: Position, reason?: string): RealTimeMatchEvent | null;
    tick(): MatchSlice;
    private commitSnapshot;
    private registerAddedTime;
    private tacticsFromOptions;
    private refereeFromOptions;
    private emptyPossessionContext;
    private startPossession;
    private possessionSnapshot;
    private recordPossessionPosition;
    private recordPassAttempt;
    private recordSuccessfulPass;
    private recordSecondBallRecovery;
    private createPlayers;
    private createBenchPlayers;
    private generateBenchPlayers;
    private fallbackAttributes;
    private intent;
    private handleTimeBoundaries;
    private startedSecondHalfSide;
    private resetForKickoff;
    private resolvePhaseAction;
    private executeThrowIn;
    private executeCorner;
    private executeGoalKick;
    private executeFreeKick;
    private executePenalty;
    private playRestartPass;
    private playRestartShot;
    private detectBallOut;
    private prepareGoalLineRestart;
    private prepareRestart;
    private placePlayersForRestart;
    private updateTacticalState;
    private updateTacticalTargetPositions;
    private resetPlayersToFormation;
    private decidePlayerIntents;
    private intentForPassReceiver;
    private intentForBallOwner;
    private dribbleIntent;
    private intentForLooseBall;
    private intentForSecondBall;
    private intentForTeammateInPossession;
    private intentForOutOfPossession;
    private pressDistance;
    private stylePressDistanceModifier;
    private pressTrapBonus;
    private pressUrgency;
    private pressRisk;
    private resolveBallAction;
    private startPass;
    private startShot;
    private movePlayersAndBall;
    private detectEvents;
    private detectTackleOrFoul;
    private resolveFoul;
    private shouldPlayAdvantage;
    private bookingEvents;
    private injuryEvents;
    private prepareFoulRestart;
    private applyRedCard;
    private detectSubstitutionEvents;
    private substitutionCandidate;
    private performSubstitution;
    private selectSubstituteFor;
    private isPenaltyFoul;
    private ballIsInPenaltyArea;
    private penaltySpotFor;
    private detectLooseBallRecovery;
    private detectPassOutcome;
    private resolveFirstTouch;
    private firstTouchChance;
    private createSecondBall;
    private shouldSecondBallRunOut;
    private secondBallPoint;
    private receiveZone;
    private passTargetZone;
    private keepOverhitPassInPlayChance;
    private detectGoalkeeperSetPieceAction;
    private detectGoalkeeperSweep;
    private detectAerialDuel;
    private detectShotOutcome;
    private detectShotBlock;
    private snapshot;
    private createEvent;
    private replayWindowForGoal;
    private formationTargetsForRoles;
    private formationSlotScore;
    private roleFormationPreference;
    private roleLineIndex;
    private roleLane;
    private formationSlots;
    private parseFormation;
    private selectPassTarget;
    private passRouteSelectionBonus;
    private tacticalDirectness;
    private maxOpenPlayPassDistance;
    private styleRouteSelectionBonus;
    private passTargetPoint;
    private passTargetKind;
    private passSpeed;
    private passMissDistance;
    private receiveDifficulty;
    private passRoute;
    private canPlayThroughBall;
    private runnerSeparation;
    private passingLanePressure;
    private shotRoute;
    private selectRestartTaker;
    private selectThrowInTarget;
    private selectBoxTarget;
    private selectShortGoalKickTarget;
    private selectLongGoalKickTarget;
    private safeRestartTarget;
    private cornerTargetPoint;
    private supportTarget;
    private overlapTarget;
    private underlapTarget;
    private boxEntryTarget;
    private forwardRunTarget;
    private driftWideTarget;
    private betweenLinesTarget;
    private trackRunnerTarget;
    private coverLaneTarget;
    private isWideDefender;
    private isWideAttacker;
    private isWideCarrier;
    private hasOverlappingSupport;
    private shootingIntentChance;
    private stylePassFrequencyBonus;
    private passQuality;
    private shotQuality;
    private shotRouteQualityBoost;
    private defensiveShotQualityModifier;
    private pressureAround;
    private defensiveSystemPressure;
    private interceptionChance;
    private playerSpeed;
    private updateStamina;
    private velocityTowards;
    private moveTowards;
    private pointTowards;
    private playerById;
    private playersForSide;
    private playersAgainst;
    private closestPlayerTo;
    private closestPlayer;
    private nearestOpponent;
    private goalkeeperFor;
    private tactics;
    private activePeriod;
    private attackDirection;
    private attackDirectionForPeriod;
    private oppositeSide;
    private goalCenterAgainst;
    private attackingSideForGoalLine;
    private goalKickPosition;
    private fieldZonesFor;
    private progressionZone;
    private hasWideZone;
    private routeLedAttackPattern;
    private attackPatternFromZones;
    private attackPatternFromPassRoute;
    private attackPatternFromShotRoute;
    private registerTouch;
    private mirrorForSide;
    private mentalityShift;
    private randomPoint;
    private ballIsSlow;
    private ballOutsidePitch;
    private distance;
    private distanceToSegment;
    private clampPoint;
    private clampPassTarget;
    private clamp;
    private round;
    private roundTime;
}

export declare interface RealTimeEngineOptions {
    tickSeconds: number;
    matchLengthSeconds: number;
    homeTactics: Partial<Tactics>;
    awayTactics: Partial<Tactics>;
    referee: Partial<RefereeProfile>;
    random: () => number;
}

export declare type RealTimeEventType = 'match_start' | 'kickoff' | 'half_time' | 'full_time' | 'throw_in' | 'corner' | 'goal_kick' | 'free_kick' | 'penalty' | 'dribble' | 'challenge' | 'yellow_card' | 'red_card' | 'injury' | 'substitution' | 'tactical_change' | 'role_change' | 'advantage' | 'aerial_duel' | 'blocked_shot' | 'goalkeeper_claim' | 'goalkeeper_punch' | 'pass' | 'receive' | 'second_ball' | 'interception' | 'tackle' | 'shot' | 'save' | 'miss' | 'foul' | 'goal' | 'recovery';

export declare interface RealTimeMatchEvent {
    type: RealTimeEventType;
    time: number;
    team?: Team;
    teamSide?: TeamSide;
    player?: Player;
    playerId?: string;
    secondaryPlayer?: Player;
    secondaryPlayerId?: string;
    position: Vector2;
    score: {
        home: number;
        away: number;
    };
    outcome?: string;
    fieldZones: FieldZone[];
    possession: PossessionContext;
    activeAttackPattern: AttackPattern;
    chanceQuality?: number;
    replayWindow?: {
        startTime: number;
        endTime: number;
    };
}

export declare interface RealTimeReport {
    headline: string;
    summary: string;
    teams: {
        home: RealTimeReportTeam;
        away: RealTimeReportTeam;
    };
    sections: RealTimeReportSection[];
    turningPoints: RealTimeReportSection[];
}

export declare class RealTimeReporter {
    private engine;
    constructor(engine: RealTimeEngine);
    getReport(): RealTimeReport;
    private teamReport;
    private tacticalPatternSection;
    private chanceCreationSection;
    private pressingSection;
    private playerImpactSection;
    private managerImpactSection;
    private turningPoints;
    private turningPointText;
    private summary;
    private eventsFor;
    private finalThirdRecoveries;
    private topPlayer;
    private countBy;
    private topEntry;
    private finalSnapshot;
    private average;
    private label;
}

export declare interface RealTimeReportSection {
    title: string;
    text: string;
    teamSide?: TeamSide;
    time?: number;
}

export declare interface RealTimeReportTeam {
    name: string;
    style: string;
    goals: number;
    shots: number;
    passCompletion: number;
    finalThirdRecoveries: number;
    averageStamina: number;
}

export declare interface RefereeProfile {
    strictness: number;
    advantagePatience: number;
    penaltyThreshold: number;
    bookingThreshold: number;
}

declare interface Report_2 {
    away: TeamReport;
    home: TeamReport;
    scoreSheet: ScoreSheet;
}
export { Report_2 as Report }

export declare class Reporter {
    gameEvents: GameEvent[];
    home: TeamReport;
    away: TeamReport;
    scoreSheet: ScoreSheet;
    constructor(gameEvents: GameEvent[]);
    registerEvent: (gameEvent: GameEvent) => void;
    getReport(): Report_2;
}

export declare interface RestartState {
    phase: Extract<MatchPhase, 'throw_in' | 'corner' | 'goal_kick' | 'free_kick' | 'penalty'>;
    teamSide: TeamSide;
    position: Vector2;
    reason: string;
}

export declare const rightPositions: Position[];

export declare interface ScoreItem {
    matchMinute: number;
    goalScorer: Player | null;
    assist: boolean | Player;
    team: Team;
}

export declare type ScoreSheet = ScoreItem[];

export declare interface SeasonMatchReport {
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
    shots: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
    injuries: number;
}

export declare interface SeasonMetrics {
    goalsPerMatch: number;
    shotsPerMatch: number;
    yellowCardsPerMatch: number;
    redCardsPerMatch: number;
    injuriesPerMatch: number;
    homeWinShare: number;
}

export declare interface SeasonPlayerStats {
    playerName: string;
    teamName: string;
    goals: number;
    shots: number;
    passes: number;
    defensiveActions: number;
}

export declare interface SeasonReport {
    matches: SeasonMatchReport[];
    table: SeasonStanding[];
    topScorers: SeasonPlayerStats[];
    topPassers: SeasonPlayerStats[];
    styleStats: SeasonStyleStats[];
    metrics: SeasonMetrics;
}

export declare class SeasonSimulator {
    private teams;
    private options;
    constructor(teams: SeasonTeamInput[], options?: Partial<SeasonSimulatorOptions>);
    simulate(): SeasonReport;
    private fixtures;
    private teamFromInput;
    private emptyTable;
    private matchReport;
    private applyTableResult;
    private applyTeamResult;
    private collectPlayerStats;
    private collectStyleStats;
    private applyStyleStats;
    private sortedTable;
    private topPlayers;
    private finalizeStyleStats;
    private metrics;
    private ratio;
}

export declare interface SeasonSimulatorOptions {
    rounds: number;
    matchLengthSeconds: number;
    random: () => number;
}

export declare interface SeasonStanding {
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
}

export declare interface SeasonStyleStats {
    style: string;
    matches: number;
    goalsFor: number;
    shotsFor: number;
    finalThirdRecoveries: number;
    averageGoalsFor: number;
    averageShotsFor: number;
    averageFinalThirdRecoveries: number;
}

export declare interface SeasonTeamInput {
    name: string;
    players: Team['players'];
    tactics?: Partial<Tactics>;
}

export declare interface SecondBallState {
    x: number;
    y: number;
    expiresAt: number;
    teamSide: TeamSide;
    sourcePlayerId: string;
    source: BallRecoverySource;
}

export declare interface SimulatedPlayer {
    id: string;
    team: Team;
    side: TeamSide;
    player: Player;
    role: Position;
    x: number;
    y: number;
    target: Vector2;
    stamina: number;
    attributes: PlayerAttributes;
    currentIntent: PlayerIntent;
    actionCooldown: number;
    foulsCommitted: number;
    foulsSuffered: number;
    yellowCards: number;
    redCard: boolean;
    aggressionRisk: number;
    tackleTimingRisk: number;
    injurySeverity: 'none' | 'knock' | 'minor' | 'forced';
    injuryPerformancePenalty: number;
    onPitch: boolean;
}

export declare type TacticalStyle = 'balanced' | 'possession' | 'direct' | 'counter' | 'low_block' | 'high_press';

export declare interface Tactics {
    formation: string;
    style: TacticalStyle;
    press: number;
    width: number;
    tempo: number;
    mentality: Mentality;
    defensiveLine: number;
    compactness: number;
    focus: AttackingFocus;
}

export declare class Team implements TeamInterface {
    players: Player[];
    home: boolean;
    name: string;
    field: Field | null;
    constructor(home: boolean, name: string, players: Player[]);
    setField(field: Field): void;
    rating(): {
        goalkeeping: number;
        defense: number;
        attack: number;
    };
    getGoalkeepers(): Player[];
    getFieldPlayers(exclude?: Player[]): Player[];
    averageRating(map: (player: Player) => number, players?: Player[] | null): number;
    goalkeeperRating(): number;
    defenceRating(): number;
    possessionRating(): number;
    attackRating(): number;
    simulateMove(ballPosition: FieldArea, gameInfo: GameInfo): Action;
    getProbablePlayer(fieldPosition: FieldArea, attacker: boolean, exclude?: Player[]): Player;
    attacker(fieldPosition: FieldArea, exclude?: Player[]): Player;
    defender(fieldPosition: FieldArea, exclude?: Player[]): Player;
}

declare interface TeamInterface {
    players: Player[];
}

export declare interface TeamReport {
    goals: number;
    possession: number;
    shots: number;
    shotsOnGoal: number;
}

export declare type TeamSide = 'home' | 'away';

export declare interface TechnicalAttributes {
    corners: number;
    crossing: number;
    dribbling: number;
    finishing: number;
    firstTouch: number;
    freeKickTaking: number;
    heading: number;
    longShots: number;
    longThrows: number;
    marking: number;
    passing: number;
    penaltyTaking: number;
    tackling: number;
    technique: number;
}

export declare interface Vector2 {
    x: number;
    y: number;
}

export { }
