import { Tabs } from 'expo-router';
import { ArrowLeftRight, LayoutDashboard, Link2 } from 'lucide-react-native';
import { GlassTabBar } from '../../src/components';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#05070D' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Painel',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transações',
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Conexão',
          tabBarIcon: ({ color, size }) => <Link2 color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
