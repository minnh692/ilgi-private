import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import Mood1 from '../../assets/brand/svg/muni-mood-1.svg';
import Mood2 from '../../assets/brand/svg/muni-mood-2.svg';
import Mood3 from '../../assets/brand/svg/muni-mood-3.svg';
import Mood4 from '../../assets/brand/svg/muni-mood-4.svg';
import Mood5 from '../../assets/brand/svg/muni-mood-5.svg';

export const MOOD_VALUES = [1, 2, 3, 4, 5] as const;

export const MOOD_LABELS: Record<number, string> = {
  1: '많이 힘들어요',
  2: '조금 처져요',
  3: '그저 그래요',
  4: '좋아요',
  5: '아주 좋아요',
};

const FACES: Record<number, FC<SvgProps>> = { 1: Mood1, 2: Mood2, 3: Mood3, 4: Mood4, 5: Mood5 };

interface MoodFaceProps extends Omit<SvgProps, 'width' | 'height'> {
  mood: number;
  size?: number;
}

export function MoodFace({ mood, size = 32, ...rest }: MoodFaceProps) {
  const Face = FACES[mood];
  if (!Face) return null;
  return <Face width={size} height={size} accessibilityLabel={MOOD_LABELS[mood]} {...rest} />;
}
