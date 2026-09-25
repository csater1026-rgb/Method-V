// Only the weights the app uses, so the rest of each family isn't bundled.
import { BigShoulders_800ExtraBold } from "@expo-google-fonts/big-shoulders/800ExtraBold";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono/400Regular";
import { MartianMono_600SemiBold } from "@expo-google-fonts/martian-mono/600SemiBold";
import { SchibstedGrotesk_400Regular } from "@expo-google-fonts/schibsted-grotesk/400Regular";
import { SchibstedGrotesk_500Medium } from "@expo-google-fonts/schibsted-grotesk/500Medium";
import { SchibstedGrotesk_700Bold } from "@expo-google-fonts/schibsted-grotesk/700Bold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { Sora_800ExtraBold } from "@expo-google-fonts/sora/800ExtraBold";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/lib/auth";
import { SITE_URL, isLive } from "@/lib/config";
import { pushSupported } from "@/lib/push";
import { pushTarget } from "@shared/push-route";
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
    Sora_700Bold,
    Sora_800ExtraBold,
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
  const router = useRouter();
  const { ready, session } = useAuth();
  // Method V is for members: on the live app, nothing but sign-in until you're in.
  const signedOut = isLive && !session;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a notification opens what it's about (also when it launched the app).
  useEffect(() => {
    if (!ready || !pushSupported || signedOut) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const target = pushTarget(response.notification.request.content.data?.url);
      if ("screen" in target) router.push(target.screen as never);
      else if (SITE_URL) void WebBrowser.openBrowserAsync(`${SITE_URL}${target.web}`);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready, router, signedOut]);
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
        <Stack.Protected guard={!signedOut}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="apps/[slug]" options={{ title: "" }} />
          <Stack.Screen name="u/[username]" options={{ title: "" }} />
          <Stack.Screen name="q/[id]" options={{ title: "" }} />
          <Stack.Screen name="ask" options={{ title: "Ask a question" }} />
        </Stack.Protected>
        {/* Signed out it's the whole app (no closing it); signed in it's a sheet. */}
        <Stack.Screen
          name="sign-in"
          options={
            signedOut
              ? { presentation: "card", headerShown: false, gestureEnabled: false, animation: "fade" }
              : { presentation: "modal", title: "Sign in" }
          }
        />
      </Stack>
    </>
  );
}
