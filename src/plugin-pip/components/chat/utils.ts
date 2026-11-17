export const getRoleColor = (role: string | null): string => {
  const roleColors: Record<string, string> = {
    MODERATOR: '#3b82f6',
    VIEWER: '#8b5cf6',
  };
  return role ? (roleColors[role] || '#6b7280') : '#6b7280';
};

export const getInitials = (name: string | null): string => {
  if (!name) return '?';
  return name.substring(0, 2);
};
