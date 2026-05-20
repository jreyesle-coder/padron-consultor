import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';

const TABS = [
  { name: 'index', label: 'Búsqueda' },
  { name: 'campo', label: 'Equipos' },
  { name: 'explore', label: 'Resumen' },
];

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab, i) => {
        const isFocused = state.index === i;
        return (
          <TouchableOpacity
            key={tab.name}
            style={[styles.tab, isFocused && styles.tabActivo]}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.8}>
            <Text style={[styles.label, isFocused && styles.labelActivo]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0a4f6e',
    paddingHorizontal: 8,
    paddingVertical: 10,
    paddingBottom: 14,
    gap: 6,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabActivo: {
    backgroundColor: '#0a7ea4',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelActivo: {
    color: '#fff',
  },
});
