import { Tabs } from 'expo-router';
import React from 'react';
import { CustomTabBar } from '@/components/custom-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Búsqueda' }} />
      <Tabs.Screen name="campo" options={{ title: 'Equipos' }} />
      <Tabs.Screen name="explore" options={{ title: 'Resumen' }} />
    </Tabs>
  );
}
