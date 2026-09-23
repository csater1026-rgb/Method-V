// Only the weights the app uses, so the rest of each family isn't bundled.
import { BigShoulders_800ExtraBold } from "@expo-google-fonts/big-shoulders/800ExtraBold";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono/400Regular";
import { MartianMono_600SemiBold } from "@expo-google-fonts/martian-mono/600SemiBold";
import { SchibstedGrotesk_400Regular } from "@expo-google-fonts/schibsted-grotesk/400Regular";
import { SchibstedGrotesk_500Medium } from "@expo-google-fonts/schibsted-grotesk/500Medium";
import { SchibstedGrotesk_700Bold } from "@expo-google-fonts/schibsted-grotesk/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/lib/auth";
import { fonts, useTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    BigShoulders_800ExtraBold,
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_700Bold,
    MartianMono_400Regular,
    MartianMono_600SemiBold,
  });
  if (!loaded) return null;
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}

function Screens() {
  const t = useTheme();
  const { ready } = useAuth();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.ink,
          headerTitleStyle: { fontFamily: fonts.bodyBold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="apps/[slug]" options={{ title: "" }} />
        <Stack.Screen name="u/[username]" options={{ title: "" }} />
        <Stack.Screen name="sign-in" options={{ presentation: "modal", title: "Sign in" }} />
      </Stack>
    </>
  );
}
