const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "Just now", "5 min ago", "3 h ago", "2 d ago"
export function relativeTime(createdAt: number, now: number): string {
    const elapsed = now - createdAt;
    if (elapsed < MINUTE) return 'Just now';
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
    return `${Math.floor(elapsed / DAY)} d ago`;
}
