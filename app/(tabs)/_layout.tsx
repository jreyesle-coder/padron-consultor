import { Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
        tabBarStyle: {
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
          paddingHorizontal: 6,
          backgroundColor: '#0a4f6e',
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        tabBarActiveBackgroundColor: '#0a7ea4',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          borderRadius: 8,
          marginHorizontal: 3,
          height: 46,
          justifyContent: 'center',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Búsqueda', tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="campo"
        options={{ title: 'Equipos', tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Resumen', tabBarIcon: () => null }}
      />
    </Tabs>
  );
}
