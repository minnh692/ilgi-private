import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_ID_KEY = 'reminder_notification_id';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) return false;
  const { status: next } = await Notifications.requestPermissionsAsync();
  return next === 'granted';
}

export async function scheduleReminder(hour: number, minute: number): Promise<void> {
  await cancelReminder();
  const granted = await requestNotificationPermissions();
  if (!granted) throw new Error('permission_denied');

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘 일기를 써 보세요',
      body: '오늘 있었던 일을 기록하고 AI 답장을 받아보세요.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
}

export async function cancelReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  }
}

export async function hasScheduledReminder(): Promise<boolean> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!id) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === id);
}
