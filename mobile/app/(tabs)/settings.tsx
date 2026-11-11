import { StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conexão</Text>
      <Text style={styles.subtitle}>Estrutura base pronta</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#E6EDF7',
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    color: '#8B97AD',
    fontSize: 14,
    marginTop: 6,
  },
});
