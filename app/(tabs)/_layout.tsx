import { TopTabs } from "expo-router/js-top-tabs";
import { useTheme } from "@/theme/useTheme";
import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "@/components/FloatingTabBar";
import { MarketingConsentPrompt } from "@/components/MarketingConsentPrompt";

// A swipeable pager (drag left/right between tabs) with the tab bar floating at the bottom.
// Screens pad their own content with useTabBarSpace() because the bar overlays them.
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <>
      <TopTabs
        tabBarPosition="bottom"
        tabBar={(props: FloatingTabBarProps) => <FloatingTabBar {...props} />}
        screenOptions={{
          swipeEnabled: true,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <TopTabs.Screen name="diary" options={{ title: '일기' }} />
        <TopTabs.Screen name="insights" options={{ title: '인사이트' }} />
        <TopTabs.Screen name="profile" options={{ title: '나' }} />
      </TopTabs>
      <MarketingConsentPrompt />
    </>
  );
}
