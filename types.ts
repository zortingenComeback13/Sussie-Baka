
export const GameState = {
  MENU: 'MENU',
  LOBBY: 'LOBBY',
  REVEAL: 'REVEAL',
  PLAYING: 'PLAYING',
  MEETING: 'MEETING',
  ENDED: 'ENDED'
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

export const PlayerRole = {
  CREWMATE: 'CREWMATE',
  IMPOSTOR: 'IMPOSTOR'
} as const;
export type PlayerRole = typeof PlayerRole[keyof typeof PlayerRole];

export const PlayerColor = {
  RED: '#C51111',
  BLUE: '#132ED1',
  GREEN: '#117F2D',
  PINK: '#ED54BA',
  ORANGE: '#EF7D0D',
  YELLOW: '#F5F557',
  BLACK: '#3F474E',
  WHITE: '#D6E0F0',
  PURPLE: '#6B2FBB',
  CYAN: '#38FEDC',
  LIME: '#50EF39',
  MAROON: '#710808',
  ROSE: '#ECC0D3',
  BANANA: '#F0E78C',
  GRAY: '#758593',
  TAN: '#918877',
  CORAL: '#E37D6E',
  OLIVE: '#808000',
  CHOCOLATE: '#D2691E',
  TEAL: '#008080',
  NAVY: '#000080',
  GOLD: '#FFD700',
  SILVER: '#C0C0C0',
  BRONZE: '#CD7F32',
  MINT: '#98FF98',
  LAVENDER: '#E6E6FA',
  SKY: '#87CEEB',
  PEACH: '#FFDAB9',
  BURGESS: '#500020',
  MOSS: '#8A9A5B',
  BRICK: '#CB4154',
  SALMON: '#FA8072',
  RAINBOW: 'RAINBOW'
} as const;
export type PlayerColor = typeof PlayerColor[keyof typeof PlayerColor];

export interface Point {
  x: number;
  y: number;
}

export interface Cosmetic {
    id: string;
    type: 'HAT' | 'SKIN' | 'PET';
    name: string;
    price: number;
    unlocked: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  hat?: string;
  skin?: string;
  pet?: string;
  x: number;
  y: number;
  deathX?: number;
  deathY?: number;
  vx: number;
  vy: number;
  role: PlayerRole;
  isDead: boolean;
  isBodyReported: boolean;
  isHost: boolean;
  facingRight: boolean;
  voteId?: string | null;
}

export interface Task {
  id: string;
  type: 'WIRES' | 'DOWNLOAD' | 'NUMBERS' | 'DIVERT' | 'FUEL' | 'TRASH' | 'SCAN';
  location: Point;
  completed: boolean;
  title: string;
}

export interface LobbySettings {
    maxPlayers: number;
    impostorCount: number;
    taskCount: number;
    playerSpeed: number;
    killCooldown: number;
    discussionTime: number;
    votingTime: number;
}

export const SabotageType = {
    NONE: 'NONE',
    LIGHTS: 'LIGHTS',
    REACTOR: 'REACTOR',
    O2: 'O2'
} as const;
export type SabotageType = typeof SabotageType[keyof typeof SabotageType];

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  text: string;
  isDead: boolean;
  timestamp: number;
}

export interface Achievement {
    id: string;
    title: string;
    description: string;
    target: number;
    reward: number; 
}

export interface Quest {
    id: string;
    description: string;
    target: number;
    current: number;
    xpReward: number;
    type: 'DAILY' | 'SEASONAL';
    claimed: boolean;
}

export interface UserProgress {
    // Stats
    gamesPlayed: number;
    winsCrew: number;
    winsImp: number;
    kills: number;
    tasksCompleted: number;
    sussyPoints: number; // Currency
    
    // Progression
    susMeter: number; // Trophies
    susPassXp: number;
    susPassTier: number;
    
    // Inventory
    unlockedColors: string[];
    inventory: string[]; // IDs of hats/skins/pets
    equippedHat?: string;
    equippedSkin?: string;
    equippedPet?: string;
    
    // Trackers
    completedAchievements: string[];
    activeQuests: Quest[];
    lastDailyReset: number;
    claimedPassRewards: number[];
    claimedMeterRewards: number[];
}

export interface GameAudioSettings {
    musicVolume: number;
    sfxVolume: number;
}

export interface Friend {
    name: string;
    addedAt: number;
}
