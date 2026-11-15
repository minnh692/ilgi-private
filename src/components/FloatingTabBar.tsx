import { useState } from 'react';
import { Animated, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';
import { useTheme } from '@/theme/useTheme';
import { palette } from '@/theme/tokens';
import PencilMono from '../../assets/brand/svg/muni-pencil-mono.svg';
import TabInsights from '../../assets/brand/svg/muni-tab-insights.svg';
import TabMe from '../../assets/brand/svg/muni-tab-me.svg';

const BAR_HEIGHT = 64;
const BAR_PADDING = 6;
const BAR_SIDE_MARGIN = 20;
const MIN_BOTTOM_GAP = 12;

const ICONS: Record<string, React.FC<SvgProps>> = {
  diary: PencilMono,
  insights: TabInsights,
  profile: TabMe,
};

// expo-router types the top-tab bar props as `any`, so spell out the part this bar uses
export interface FloatingTabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
  position: Animated.AnimatedInterpolation<number>;
}

function bottomGap(insetBottom: number) {
  return Math.max(insetBottom, MIN_BOTTOM_GAP);
}

/** Bottom space a tab screen must leave free so its content clears the floating bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return bottomGap(insets.bottom) + BAR_HEIGHT + 8;
}

/**
 * Floating pill tab bar. The highlight follows `position`, so it tracks the finger while the
 * user swipes between tabs.
 */
export function FloatingTabBar({ state, descriptors, navigation, position }: FloatingTabBarProps) {
  const { colors, typography, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [rowWidth, setRowWidth] = useState(0);

  const routes = state.routes;
  const itemWidth = rowWidth / routes.length;
  const activeColor = dark ? palette.cheese : palette.accentDark;

  const translateX =
    routes.length > 1
      ? position.interpolate({
          inputRange: routes.map((_, i) => i),
          outputRange: routes.map((_, i) => i * itemWidth),
          extrapolate: 'clamp',
        })
      : 0;

  return (
    <View
      style={[
        styles.bar,
        {
          bottom: bottomGap(insets.bottom),
          backgroundColor: colors.tabBar,
          borderColor: colors.tabBarBorder,
          shadowColor: dark ? '#000' : palette.ink,
        },
      ]}
    >
      <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 && (
          <Animated.View
            style={[
              styles.highlight,
              { width: itemWidth, backgroundColor: colors.accentLight, transform: [{ translateX }] },
            ]}
          />
        )}
        {routes.map((route, index) => {
          const focused = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const Icon = ICONS[route.name];
          const color = focused ? activeColor : colors.subtext;

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              {Icon && <Icon width={22} height={22} color={color} />}
              <Text
                style={[
                  styles.label,
                  { color, fontFamily: focused ? typography.fontFamily.semiBold : typography.fontFamily.medium },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: BAR_SIDE_MARGIN,
    right: BAR_SIDE_MARGIN,
    height: BAR_HEIGHT,
    padding: BAR_PADDING,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  row: { flex: 1, flexDirection: 'row' },
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11 },
});
