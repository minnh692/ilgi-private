import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { FREE_LAUNCH } from './plan';

const RC_KEY = Constants.expoConfig?.extra?.revenueCatIosKey as string | undefined;

// True in Expo Go, on Android, when mock flag is set, or during the free launch (RevenueCat unused)
export const PURCHASES_MOCK =
  FREE_LAUNCH ||
  (Constants.expoConfig?.extra?.mockPurchases as boolean) ||
  Platform.OS !== 'ios';

export async function configurePurchases(): Promise<void> {
  if (PURCHASES_MOCK || !RC_KEY) return;
  const { default: Purchases } = await import('react-native-purchases');
  Purchases.configure({ apiKey: RC_KEY });
}

export async function loginPurchasesUser(userId: string): Promise<void> {
  if (PURCHASES_MOCK) return;
  try {
    const { default: Purchases } = await import('react-native-purchases');
    await Purchases.logIn(userId);
  } catch (e) {
    console.error('RevenueCat logIn:', e);
  }
}

export interface OfferingPrices {
  monthly: { priceString: string } | null;
  annual: { priceString: string; monthlyEquivalent: string | null } | null;
}

export async function getOfferingPrices(): Promise<OfferingPrices> {
  if (PURCHASES_MOCK) {
    return {
      monthly: { priceString: '₩7,900' },
      annual: { priceString: '₩59,000', monthlyEquivalent: '₩4,917' },
    };
  }
  try {
    const { default: Purchases } = await import('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const cur = offerings.current;
    return {
      monthly: cur?.monthly ? { priceString: cur.monthly.product.priceString } : null,
      annual: cur?.annual
        ? {
            priceString: cur.annual.product.priceString,
            monthlyEquivalent: cur.annual.product.price
              ? `₩${Math.floor((cur.annual.product.price as number) / 12).toLocaleString()}`
              : null,
          }
        : null,
    };
  } catch {
    return { monthly: null, annual: null };
  }
}

export async function purchaseSubscription(period: 'monthly' | 'annual'): Promise<boolean> {
  if (PURCHASES_MOCK) return true;
  const { default: Purchases } = await import('react-native-purchases');
  const offerings = await Purchases.getOfferings();
  const cur = offerings.current;
  const pkg = period === 'monthly' ? cur?.monthly : cur?.annual;
  if (!pkg) throw new Error('Package not found');
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return !!customerInfo.entitlements.active['plus'];
}

export async function restorePurchasesRC(): Promise<boolean> {
  if (PURCHASES_MOCK) return false;
  const { default: Purchases } = await import('react-native-purchases');
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active['plus'];
}

/** Detach the RevenueCat customer on sign-out so the next account on this device starts clean. */
export async function logoutPurchasesUser(): Promise<void> {
  if (PURCHASES_MOCK) return;
  try {
    const { default: Purchases } = await import('react-native-purchases');
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch (e) {
    console.error('RevenueCat logOut:', e);
  }
}
