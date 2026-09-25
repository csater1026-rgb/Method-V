import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabIcon } from "@/components/TabIcon";
import { TourProvider } from "@/components/Tour";
import { fonts, useTheme } from "@/theme";

// Bottom tabs like the website on phones: Home first, a big + in the middle.
export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <TourProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.accent,
          tabBarInactiveTintColor: t.muted,
          // Room for the label under each icon, plus the home indicator.
          tabBarStyle: {
            backgroundColor: t.bg,
            borderTopColor: t.line,
            height: 68 + insets.bottom,
            paddingTop: 4,
            paddingBottom: insets.bottom + 4,
          },
          tabBarLabelStyle: {
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            lineHeight: 14,
          },
          sceneStyle: { backgroundColor: t.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="drops"
          options={{
            title: "Drops",
            tabBarIcon: ({ color }) => <TabIcon name="drops" color={color} />,
          }}
        />
        <Tabs.Screen
          name="post"
          options={{
            title: "Post",
            tabBarAccessibilityLabel: "Post a Drop",
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View
                style={{
                  width: 48,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: t.accent,
                  borderBottomWidth: 3,
                  borderBottomColor: t.accentEdge,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ skewX: "-6deg" }],
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 24,
                    lineHeight: 28,
                    color: t.accentInk,
                  }}
                >
                  +
                </Text>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="browse"
          options={{
            title: "Browse",
            tabBarIcon: ({ color }) => <TabIcon name="browse" color={color} />,
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: "Me",
            tabBarIcon: ({ color }) => <TabIcon name="me" color={color} />,
          }}
        />
      </Tabs>
    </TourProvider>
  );
}
