import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import type { MemoryMode } from '@/types/database';
import Remember from '../../assets/brand/svg/muni-mode-remember.svg';
import Reply from '../../assets/brand/svg/muni-mode-reply.svg';
import Private from '../../assets/brand/svg/muni-mode-private.svg';

const ICONS: Record<MemoryMode, FC<SvgProps>> = {
  remember: Remember,
  reply_only: Reply,
  private: Private,
};

interface ModeIconProps extends Omit<SvgProps, 'width' | 'height'> {
  mode: MemoryMode;
  size?: number;
}

/** Mono icon for a memory mode; inherits `color` via currentColor. */
export function ModeIcon({ mode, size = 16, ...rest }: ModeIconProps) {
  const Icon = ICONS[mode];
  if (!Icon) return null;
  return <Icon width={size} height={size} {...rest} />;
}
