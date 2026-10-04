import { Alert } from 'react-native';

// Free launch: subscriptions aren't on sale yet, so every account gets the full (Plus) feature set.
// Keep in sync with FREE_LAUNCH in supabase/functions/_shared/plan.ts (the server enforces limits).
export const FREE_LAUNCH = true;

/** Whether Plus features (monthly report, patterns, daily reply limit) are unlocked. */
export function hasPlusFeatures(plan: string | null | undefined): boolean {
  return FREE_LAUNCH || plan === 'plus';
}

export function showSubscriptionComingSoon(onClose?: () => void) {
  Alert.alert(
    '구독 준비 중',
    '유료 구독은 아직 준비 중이에요.\n지금은 모든 기능을 무료로 이용할 수 있어요.',
    [{ text: '확인', onPress: onClose }],
    { onDismiss: onClose },
  );
}
