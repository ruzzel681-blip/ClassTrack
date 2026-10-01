import React from 'react';

interface UserAvatarProps {
  displayName: string;
  avatar?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  role?: 'teacher' | 'student';
  className?: string;
}

export const PRESET_AVATARS = [
  { id: 'av_compass', label: 'Compass', emoji: '🧭' },
  { id: 'av_book', label: 'Books', emoji: '📚' },
  { id: 'av_microscope', label: 'Science', emoji: '🔬' },
  { id: 'av_palette', label: 'Art', emoji: '🎨' },
  { id: 'av_terminal', label: 'Code', emoji: '💻' },
  { id: 'av_mortarboard', label: 'Graduate', emoji: '🎓' },
  { id: 'av_rocket', label: 'Rocket', emoji: '🚀' },
  { id: 'av_globe', label: 'Globe', emoji: '🌍' },
];

export const UserAvatar: React.FC<UserAvatarProps> = ({
  displayName,
  avatar,
  size = 'md',
  role,
  className = '',
}) => {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const isPreset = avatar?.startsWith('preset:');
  const presetKey = isPreset ? avatar?.replace('preset:', '') : null;
  const matchedPreset = PRESET_AVATARS.find((p) => p.id === presetKey);

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (avatar && !isPreset && avatar.startsWith('data:image')) {
    return (
      <img
        src={avatar}
        alt={displayName}
        className={`${sizeClasses[size]} rounded-full object-cover border border-zinc-700 shrink-0 ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  if (matchedPreset) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center select-none shrink-0 ${className}`}
        title={displayName}
      >
        <span className="leading-none">{matchedPreset.emoji}</span>
      </div>
    );
  }

  const roleBorder =
    role === 'teacher'
      ? 'border-sky-800 bg-sky-950/60 text-sky-300'
      : 'border-zinc-700 bg-zinc-800 text-zinc-200';

  return (
    <div
      className={`${sizeClasses[size]} rounded-full border font-mono font-bold flex items-center justify-center select-none shrink-0 ${roleBorder} ${className}`}
      title={displayName}
    >
      {getInitials(displayName)}
    </div>
  );
};
