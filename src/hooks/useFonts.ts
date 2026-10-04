import { useFonts as useExpoFonts } from 'expo-font';

export function useFonts() {
  const [loaded] = useExpoFonts({
    'Pretendard-Regular': require('pretendard/dist/public/static/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('pretendard/dist/public/static/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('pretendard/dist/public/static/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('pretendard/dist/public/static/Pretendard-Bold.otf'),
  });
  return loaded;
}
