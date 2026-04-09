import { Tabs } from 'expo-router';
import React from 'react';

import { BottomTabBar } from '@/components/ui/bottom-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="rulebook"
        options={{
          title: 'Rulebook',
        }}
      />
      <Tabs.Screen
        name="score-sheets"
        options={{
          title: 'Score Sheets',
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="timers"
        options={{
          title: 'Timers',
        }}
      />
      <Tabs.Screen
        name="dice"
        options={{
          title: 'Dice',
        }}
      />
      <Tabs.Screen
        name="custom-score-sheet"
        options={{
          title: 'Custom Sheet',
          tabBarButton: () => null,
        }}
      />
    </Tabs>
  );
}
