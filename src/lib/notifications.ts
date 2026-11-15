import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { ProfileRow } from '../types/database';

const NOTIFICATION_ID_KEY = 'reminder_notification_id';
const NOTIFICATION_TIME_KEY = 'reminder_notification_time';

export interface ReminderTime {
  hour: number;
  minute: number;
}

/** Auto reminder time until there are enough entries to learn from (needs night consent). */
const AUTO_DEFAULT: ReminderTime = { hour: 22, minute: 0 };
/** Latest slot outside the night window; used when night delivery isn't consented to. */
const AUTO_DAYTIME_FALLBACK: ReminderTime = { hour: 20, minute: 30 };
// Night window for advertising messages under the Korean Network Act (art. 50): 21:00–08:00
const NIGHT_START_HOUR = 21;
const NIGHT_END_HOUR = 8;

const ANALYSIS_DAYS = 30;
const ANALYSIS_MIN_ENTRIES = 5;
const BUCKET_MINUTES = 30;
const BUCKETS = (24 * 60) / BUCKET_MINUTES;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function toTimeString({ hour, minute }: ReminderTime): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "22:00" or Postgres "22:00:00" → 오후 10:00 */
export function formatReminderTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${displayH}:${String(m).padStart(2, '0')}`;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) return false;
  const { status: next } = await Notifications.requestPermissionsAsync();
  return next === 'granted';
}

async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function scheduleReminder(hour: number, minute: number): Promise<void> {
  await cancelReminder();
  const granted = await requestNotificationPermissions();
  if (!granted) throw new Error('permission_denied');

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘 하루는 어땠어요?',
      body: '무늬가 오늘 이야기를 기다리고 있어요.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  await AsyncStorage.multiSet([
    [NOTIFICATION_ID_KEY, id],
    [NOTIFICATION_TIME_KEY, toTimeString({ hour, minute })],
  ]);
}

export async function cancelReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (id) await Notifications.cancelScheduledNotificationAsync(id);
  await AsyncStorage.multiRemove([NOTIFICATION_ID_KEY, NOTIFICATION_TIME_KEY]);
}

export async function hasScheduledReminder(): Promise<boolean> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!id) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === id);
}

/** Time ("HH:MM") of the reminder scheduled on this device, or null if there is none. */
export async function getScheduledReminderTime(): Promise<string | null> {
  if (!(await hasScheduledReminder())) return null;
  return AsyncStorage.getItem(NOTIFICATION_TIME_KEY);
}

function isNight({ hour }: ReminderTime): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/**
 * The half-hour slot the user most often writes in (device-local time), or null when there
 * aren't enough entries yet. Neighbouring slots count half so 21:55 and 22:05 reinforce each other.
 */
export function preferredWritingTime(createdAts: string[]): ReminderTime | null {
  if (createdAts.length < ANALYSIS_MIN_ENTRIES) return null;

  const counts = new Array<number>(BUCKETS).fill(0);
  for (const iso of createdAts) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    counts[Math.floor((d.getHours() * 60 + d.getMinutes()) / BUCKET_MINUTES)] += 1;
  }

  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < BUCKETS; i++) {
    const score = counts[i] + 0.5 * (counts[(i + BUCKETS - 1) % BUCKETS] + counts[(i + 1) % BUCKETS]);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const minutes = best * BUCKET_MINUTES;
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/** Auto reminder time: the learned writing time (or 22:00), kept out of the night window unless allowed. */
export function resolveAutoTime(preferred: ReminderTime | null, nightAllowed: boolean): ReminderTime {
  const time = preferred ?? AUTO_DEFAULT;
  return !nightAllowed && isNight(time) ? AUTO_DAYTIME_FALLBACK : time;
}

type AutoReminderProfile = Pick<
  ProfileRow,
  'id' | 'consent_marketing_at' | 'consent_marketing_night_at' | 'reminder_auto'
>;

/**
 * Keeps the daily reminder at the user's usual writing time. Only runs for users who consented
 * to marketing messages and left the reminder on "auto"; otherwise it does nothing.
 * Reads entry timestamps only — never diary content.
 * Returns the scheduled "HH:MM", or null if nothing is scheduled (no consent / no permission).
 */
export function syncAutoReminder(
  profile: AutoReminderProfile | null,
  options: { requestPermission?: boolean } = {},
): Promise<string | null> {
  // Serialized: overlapping runs could each schedule a notification and orphan one of them
  const run = syncQueue.then(() => runAutoReminderSync(profile, options));
  syncQueue = run.catch(() => null);
  return run;
}

let syncQueue: Promise<unknown> = Promise.resolve();

async function runAutoReminderSync(
  profile: AutoReminderProfile | null,
  { requestPermission = false }: { requestPermission?: boolean },
): Promise<string | null> {
  if (!profile?.consent_marketing_at || !profile.reminder_auto) return null;

  const granted = requestPermission ? await requestNotificationPermissions() : await hasNotificationPermission();
  if (!granted) return null;

  const since = new Date(Date.now() - ANALYSIS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('entries')
    .select('created_at')
    .eq('user_id', profile.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(90);

  const current = await getScheduledReminderTime();
  // Keep whatever is scheduled if the lookup fails (e.g. offline)
  if (error && current) return current;

  const preferred = preferredWritingTime((data ?? []).map((e) => e.created_at));
  const time = resolveAutoTime(preferred, !!profile.consent_marketing_night_at);
  const next = toTimeString(time);
  if (current !== next) await scheduleReminder(time.hour, time.minute);
  return next;
}
