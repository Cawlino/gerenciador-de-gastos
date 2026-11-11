import { Tabs } from 'expo-router';
import { ArrowLeftRight, LayoutDashboard, Link2 } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#22D3EE',
        tabBarInactiveTintColor: '#8B97AD',
        tabBarStyle: {
          backgroundColor: '#0B1120',
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
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
