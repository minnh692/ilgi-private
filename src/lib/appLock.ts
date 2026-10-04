import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCK_ENABLED_KEY = 'app_lock_enabled';

export async function isHardwareAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function isLockEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
  return val === 'true';
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function authenticate(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '일기를 열려면 인증해 주세요',
    fallbackLabel: '암호 사용',
    cancelLabel: '취소',
    disableDeviceFallback: false,
  });
  return result.success;
}
