import { Alert, Platform } from 'react-native';

export async function dialogAlert(msg: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.alert(msg);
    return;
  }
  return new Promise(resolve => {
    Alert.alert('', msg, [{ text: 'OK', onPress: () => resolve() }]);
  });
}

export async function dialogConfirm(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(msg);
  }
  return new Promise(resolve => {
    Alert.alert('', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Aceptar', onPress: () => resolve(true) },
    ]);
  });
}

export async function dialogPrompt(msg: string, defaultValue = ''): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.prompt(msg, defaultValue);
  }
  if (Platform.OS === 'ios') {
    return new Promise(resolve => {
      Alert.prompt(
        '',
        msg,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
          { text: 'OK', onPress: (value?: string) => resolve(value ?? null) },
        ],
        'plain-text',
        defaultValue
      );
    });
  }
  // Android: Sprint 1 implementará un modal de texto propio
  return null;
}
