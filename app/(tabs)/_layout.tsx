import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { palette } from '@/theme/tokens';
import PencilMono from '../../assets/brand/svg/muni-pencil-mono.svg';
import TabInsights from '../../assets/brand/svg/muni-tab-insights.svg';
import TabMe from '../../assets/brand/svg/muni-tab-me.svg';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: dark ? palette.darkSurface : palette.muzzle,
          borderTopColor: dark ? palette.darkBorder : palette.borderGray,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: dark ? palette.darkSubtext : palette.warmGray,
        tabBarLabelStyle: {
          fontFamily: 'Pretendard-Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="diary"
        options={{
          title: '일기',
          tabBarIcon: ({ color, size }) => (
            <PencilMono width={size} height={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: '인사이트',
          tabBarIcon: ({ color, size }) => (
            <TabInsights width={size} height={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '나',
          tabBarIcon: ({ color, size }) => (
            <TabMe width={size} height={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
