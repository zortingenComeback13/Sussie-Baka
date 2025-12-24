
import { PlayerColor, Wall, Point, Task, Achievement, Cosmetic, Quest } from './types';

export const PLAYER_SPEED = 5;
export const PLAYER_RADIUS = 18;
export const INTERACT_RADIUS = 80;
export const KILL_RADIUS = 60;
export const VIEW_RADIUS = 250; 
export const KILL_COOLDOWN_DEFAULT = 30;

export const MAP_WIDTH = 2800;
export const MAP_HEIGHT = 1600;

// -- COLORS --
const BASE_COLORS = [
    '#C51111', '#132ED1', '#117F2D', '#ED54BA', '#EF7D0D', '#F5F557', 
    '#3F474E', '#D6E0F0', '#6B2FBB', '#38FEDC', '#50EF39', '#710808'
];

const EXTRA_COLORS = [
    '#ECC0D3', '#F0E78C', '#758593', '#918877', '#E37D6E', '#808000', '#D2691E', '#008080', '#000080', '#FFD700',
    '#C0C0C0', '#CD7F32', '#98FF98', '#E6E6FA', '#87CEEB', '#FFDAB9', '#500020', '#8A9A5B', '#CB4154', '#FA8072'
];

export const COLORS = [...BASE_COLORS, ...EXTRA_COLORS, 'RAINBOW'];
export const LOCKED_COLORS = [...EXTRA_COLORS, 'RAINBOW'];
export const COLOR_PRICES: Record<string, number> = {};
EXTRA_COLORS.forEach(c => COLOR_PRICES[c] = 500); 
COLOR_PRICES['RAINBOW'] = 10000; 

// -- COSMETICS --
export const COSMETICS: Cosmetic[] = [];

// Hats 
const HATS = [
    { id: 'hat_tophat', name: 'Top Hat', price: 1000 },
    { id: 'hat_goggles', name: 'Steampunk Goggles', price: 1500 },
    { id: 'hat_gear', name: 'Gear Head', price: 2000 },
    { id: 'hat_crown', name: 'Golden Crown', price: 5000 },
    { id: 'hat_ushanka', name: 'Ushanka', price: 800 },
    { id: 'hat_fez', name: 'Fez', price: 800 },
    { id: 'hat_halo', name: 'Halo', price: 2500 },
    { id: 'hat_horns', name: 'Devil Horns', price: 2500 },
    { id: 'hat_chef', name: 'Chef Hat', price: 500 },
    { id: 'hat_flower', name: 'Flower', price: 200 },
];

// Clothes (Skins)
const SKINS = [
    { id: 'skin_suit', name: 'Tuxedo', price: 2000 },
    { id: 'skin_steam_armor', name: 'Steam Armor', price: 3000 },
    { id: 'skin_lab', name: 'Lab Coat', price: 1000 },
    { id: 'skin_cop', name: 'Police Uniform', price: 1500 },
    { id: 'skin_mech', name: 'Mech Suit', price: 5000 },
];

// Pets
const PETS = [
    { id: 'pet_steam_bot', name: 'Steam Bot', price: 5000 },
    { id: 'pet_dog', name: 'Space Dog', price: 3000 },
    { id: 'pet_blob', name: 'Slime', price: 2000 },
    { id: 'pet_ufo', name: 'Mini UFO', price: 4000 },
    { id: 'pet_rock', name: 'Pet Rock', price: 500 },
];

HATS.forEach(h => COSMETICS.push({ ...h, type: 'HAT', unlocked: false }));
SKINS.forEach(s => COSMETICS.push({ ...s, type: 'SKIN', unlocked: false }));
PETS.forEach(p => COSMETICS.push({ ...p, type: 'PET', unlocked: false }));

// -- SUS PASS --
export const SEASON_1_REWARDS = [
    { tier: 1, rewardType: 'CURRENCY', value: 100, label: '100 Sus Points' },
    { tier: 2, rewardType: 'COSMETIC', id: 'hat_goggles', label: 'Goggles' },
    { tier: 3, rewardType: 'CURRENCY', value: 200, label: '200 Sus Points' },
    { tier: 4, rewardType: 'COSMETIC', id: 'skin_steam_armor', label: 'Steam Armor' },
    { tier: 5, rewardType: 'CURRENCY', value: 500, label: '500 Sus Points' },
    { tier: 10, rewardType: 'COSMETIC', id: 'pet_steam_bot', label: 'Steam Bot Pet' },
    { tier: 15, rewardType: 'COSMETIC', id: 'hat_gear', label: 'Gear Hat' },
    { tier: 20, rewardType: 'CURRENCY', value: 1000, label: '1000 Sus Points' },
    { tier: 50, rewardType: 'COSMETIC', id: 'hat_tophat', label: 'Golden Top Hat' },
];

// -- SUS METER --
export const generateSusMeterRewards = () => {
    const rewards = [];
    const maxTrophies = 50000; 
    const step = 500;
    
    rewards.push({ trophies: 100, rewardType: 'CURRENCY', value: 100, label: '100 Pts' });
    rewards.push({ trophies: 250, rewardType: 'CURRENCY', value: 250, label: '250 Pts' });

    for (let t = 500; t <= maxTrophies; t += step) {
        if (t === 2000) {
             rewards.push({ trophies: t, rewardType: 'COSMETIC', id: 'skin_suit', label: 'Tuxedo' });
        } else if (t === 5000) {
             rewards.push({ trophies: t, rewardType: 'COSMETIC', id: 'pet_blob', label: 'Slime Pet' });
        } else {
             const val = (t % 1000 === 0) ? 500 : 200;
             rewards.push({ trophies: t, rewardType: 'CURRENCY', value: val, label: `${val} Pts` });
        }
    }
    return rewards;
};

export const SUS_METER_REWARDS = generateSusMeterRewards();

// -- QUESTS --
export const DAILY_QUESTS: Omit<Quest, 'current' | 'claimed'>[] = [
    { id: 'dq_task_1', description: 'Complete 1 Task', target: 1, xpReward: 200, type: 'DAILY' },
    { id: 'dq_play_1', description: 'Play 1 Game', target: 1, xpReward: 100, type: 'DAILY' },
    { id: 'dq_kill_1', description: 'Kill 1 Crewmate (or try)', target: 1, xpReward: 300, type: 'DAILY' },
];

export const SEASONAL_QUESTS: Omit<Quest, 'current' | 'claimed'>[] = [
    { id: 'sq_task_20', description: 'Complete 20 Tasks', target: 20, xpReward: 2000, type: 'SEASONAL' },
    { id: 'sq_win_3', description: 'Win 3 Games', target: 3, xpReward: 1500, type: 'SEASONAL' },
    { id: 'sq_kill_10', description: 'Get 10 Kills', target: 10, xpReward: 2500, type: 'SEASONAL' },
];

// -- ACHIEVEMENTS --
export const ACHIEVEMENTS: Achievement[] = [];
const createTieredAchievement = (key: string, baseTitle: string, baseDesc: string, levels: number[], baseReward: number) => {
    levels.forEach((target, i) => {
        ACHIEVEMENTS.push({
            id: `${key}_${target}`,
            title: `${baseTitle} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] || i+1}`,
            description: `${baseDesc} ${target} times`,
            target: target,
            reward: baseReward * (i + 1)
        });
    });
};
createTieredAchievement('tasks', 'Taskmaster', 'Complete tasks', [10, 50, 100], 100);
createTieredAchievement('kills', 'Killer', 'Kill crewmates', [10, 50, 100], 200);
createTieredAchievement('wins', 'Winner', 'Win games', [10, 25, 50], 300);

export const WALLS: Wall[] = [
  { x: 0, y: 0, w: 2800, h: 50 },
  { x: 0, y: 1550, w: 2800, h: 50 },
  { x: 0, y: 0, w: 50, h: 1600 },
  { x: 2750, y: 0, w: 50, h: 1600 },
  { x: 1100, y: 50, w: 20, h: 400 },
  { x: 1700, y: 50, w: 20, h: 400 },
  { x: 1100, y: 450, w: 250, h: 20 },
  { x: 1450, y: 450, w: 270, h: 20 },
  { x: 1250, y: 200, w: 300, h: 100 },
  { x: 1800, y: 50, w: 20, h: 300 },
  { x: 1800, y: 350, w: 300, h: 20 },
  { x: 2100, y: 200, w: 20, h: 150 },
  { x: 1800, y: 450, w: 200, h: 20 },
  { x: 1800, y: 600, w: 200, h: 20 },
  { x: 1800, y: 450, w: 20, h: 150 },
  { x: 2300, y: 400, w: 20, h: 500 },
  { x: 2300, y: 400, w: 400, h: 20 },
  { x: 2300, y: 900, w: 400, h: 20 },
  { x: 1800, y: 1000, w: 20, h: 300 },
  { x: 1800, y: 1000, w: 200, h: 20 },
  { x: 2100, y: 1200, w: 100, h: 20 },
  { x: 1500, y: 600, w: 300, h: 20 }, 
  { x: 1500, y: 800, w: 300, h: 20 }, 
  { x: 1500, y: 600, w: 20, h: 50 },  
  { x: 1500, y: 750, w: 20, h: 50 },  
  { x: 1800, y: 600, w: 20, h: 200 }, 
  { x: 1200, y: 900, w: 20, h: 500 },
  { x: 1600, y: 900, w: 20, h: 500 },
  { x: 1200, y: 900, w: 400, h: 20 },
  { x: 1600, y: 1200, w: 250, h: 20 },
  { x: 1850, y: 1200, w: 20, h: 250 },
  { x: 800, y: 900, w: 400, h: 20 },
  { x: 800, y: 900, w: 20, h: 400 },
  { x: 1200, y: 900, w: 20, h: 400 },
  { x: 1000, y: 1100, w: 10, h: 200 },
  { x: 400, y: 1000, w: 300, h: 20 },
  { x: 400, y: 1200, w: 300, h: 20 },
  { x: 400, y: 250, w: 300, h: 20 },
  { x: 400, y: 450, w: 300, h: 20 },
  { x: 600, y: 600, w: 200, h: 20 },
  { x: 600, y: 800, w: 200, h: 20 },
  { x: 800, y: 600, w: 20, h: 200 },
  { x: 50, y: 250, w: 20, h: 950 },
  { x: 350, y: 250, w: 20, h: 950 },
  { x: 750, y: 350, w: 350, h: 20 },
  { x: 750, y: 350, w: 20, h: 200 },
  { x: 1100, y: 350, w: 20, h: 200 },
];

export const VENTS = [
    { id: 'v1', x: 200, y: 350, link: 'v2' },
    { id: 'v2', x: 500, y: 1100, link: 'v1' }, 
    { id: 'v3', x: 900, y: 1100, link: 'v4' }, 
    { id: 'v4', x: 700, y: 700, link: 'v5' }, 
    { id: 'v5', x: 800, y: 400, link: 'v3' }, 
    { id: 'v6', x: 1650, y: 700, link: 'v7' }, 
    { id: 'v7', x: 1600, y: 300, link: 'v8' }, 
    { id: 'v8', x: 1900, y: 550, link: 'v6' }, 
    { id: 'v9', x: 2000, y: 1100, link: 'v10' }, 
    { id: 'v10', x: 2500, y: 800, link: 'v9' }, 
];

export const EMERGENCY_BUTTON: Point = { x: 1280, y: 250 };

export const TASKS_TEMPLATE: Omit<Task, 'completed'>[] = [
  { id: 't1', type: 'WIRES', location: { x: 200, y: 400 }, title: 'Fix Wiring (Reactor)' },
  { id: 't2', type: 'NUMBERS', location: { x: 200, y: 800 }, title: 'Unlock Manifolds (Reactor)' },
  { id: 't3', type: 'FUEL', location: { x: 500, y: 350 }, title: 'Fuel Engines (Upper)' },
  { id: 't4', type: 'FUEL', location: { x: 500, y: 1100 }, title: 'Fuel Engines (Lower)' },
  { id: 't5', type: 'SCAN', location: { x: 900, y: 450 }, title: 'Submit Scan (Medbay)' },
  { id: 't6', type: 'DOWNLOAD', location: { x: 1650, y: 700 }, title: 'Upload Data (Admin)' },
  { id: 't7', type: 'WIRES', location: { x: 1400, y: 1100 }, title: 'Fix Wiring (Storage)' },
  { id: 't8', type: 'TRASH', location: { x: 1400, y: 1300 }, title: 'Empty Trash (Storage)' },
  { id: 't9', type: 'WIRES', location: { x: 900, y: 1000 }, title: 'Fix Wiring (Electrical)' },
  { id: 't10', type: 'DOWNLOAD', location: { x: 850, y: 1200 }, title: 'Download Data (Electrical)' },
  { id: 't11', type: 'DIVERT', location: { x: 850, y: 1000 }, title: 'Divert Power (Electrical)' },
  { id: 't12', type: 'WIRES', location: { x: 2400, y: 700 }, title: 'Fix Wiring (Navigation)' },
  { id: 't13', type: 'DOWNLOAD', location: { x: 2600, y: 600 }, title: 'Download Data (Navigation)' },
  { id: 't14', type: 'TRASH', location: { x: 1900, y: 500 }, title: 'Empty Trash (O2)' },
  { id: 't15', type: 'WIRES', location: { x: 2000, y: 200 }, title: 'Fix Wiring (Weapons)' },
  { id: 't16', type: 'DOWNLOAD', location: { x: 1900, y: 100 }, title: 'Download Data (Weapons)' },
  { id: 't17', type: 'WIRES', location: { x: 1900, y: 1100 }, title: 'Prime Shields (Shields)' },
  { id: 't18', type: 'DOWNLOAD', location: { x: 1650, y: 200 }, title: 'Download Data (Cafeteria)' },
  { id: 't19', type: 'DOWNLOAD', location: { x: 1700, y: 1300 }, title: 'Download Data (Comms)' },
  { id: 't20', type: 'WIRES', location: { x: 700, y: 700 }, title: 'Fix Wiring (Security)' },
];

export const DEFAULT_SETTINGS = {
    maxPlayers: 15,
    impostorCount: 2,
    taskCount: 5,
    playerSpeed: 1.0, 
    killCooldown: 25,
    discussionTime: 15,
    votingTime: 30
};
