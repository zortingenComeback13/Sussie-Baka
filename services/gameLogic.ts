import { Wall, Point, Player, PlayerRole } from '../types';
import { WALLS, PLAYER_RADIUS } from '../constants';

// AABB Collision with slide response
export const resolveCollision = (x: number, y: number, dx: number, dy: number, isGhost: boolean = false): { x: number, y: number } => {
  let newX = x + dx;
  let newY = y + dy;

  if (isGhost) return { x: newX, y: newY };

  // Check walls
  for (const wall of WALLS) {
    if (
      newX + PLAYER_RADIUS > wall.x &&
      newX - PLAYER_RADIUS < wall.x + wall.w &&
      y + PLAYER_RADIUS > wall.y &&
      y - PLAYER_RADIUS < wall.y + wall.h
    ) {
      newX = x; // Revert X if X movement caused collision
    }
    
    if (
      newX + PLAYER_RADIUS > wall.x &&
      newX - PLAYER_RADIUS < wall.x + wall.w &&
      newY + PLAYER_RADIUS > wall.y &&
      newY - PLAYER_RADIUS < wall.y + wall.h
    ) {
      newY = y; // Revert Y if Y movement caused collision
    }
  }

  return { x: newX, y: newY };
};

export const distance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const getClosestPlayer = (me: Player, others: Player[], maxDist: number): Player | null => {
  let closest: Player | null = null;
  let minD = maxDist;

  for (const p of others) {
    if (p.isDead || p.id === me.id) continue;
    const d = distance(me, p);
    if (d < minD) {
      minD = d;
      closest = p;
    }
  }
  return closest;
};