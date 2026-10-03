import { Tabs } from 'expo-router';
import { useColorScheme, Text } from 'react-native';
import { palette } from '@/theme/tokens';

function TabIcon({ label }: { label: string }) {
  return null; // Icon placeholder — use emoji or icon library
}

export default function TabsLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: dark ? palette.darkSurface : palette.white,
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
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>📖</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: '인사이트',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>✨</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '나',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🪞</Text>
          ),
        }}
      />
    </Tabs>
  );
}
