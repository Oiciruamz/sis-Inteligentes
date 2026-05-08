import { Link, router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleRegister = () => {
    if (!isValidEmail(email)) {
      setError('Ingresa un correo valido para registrarte.');
      return;
    }
    if (!name.trim() || !password.trim()) {
      setError('Completa los campos para continuar.');
      return;
    }
    setError('');
    router.replace('/dashboard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Image source={require('@/assets/images/logoapp.png')} style={styles.logo} contentFit="contain" />
        <Text style={styles.title}>Crear cuenta</Text>

        <TextInput
          placeholder="Nombre"
          placeholderTextColor="#6d6d72"
          style={styles.input}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Correo"
          placeholderTextColor="#6d6d72"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          secureTextEntry={Platform.OS !== 'web'}
          placeholder="Contrasena"
          placeholderTextColor="#6d6d72"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>Crear y entrar</Text>
        </Pressable>

        <Link href="/login" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Ya tengo cuenta</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#191922',
    backgroundColor: '#0d0d12',
    padding: 18,
    gap: 10,
  },
  logo: {
    width: 64,
    height: 64,
    alignSelf: 'center',
    marginBottom: 2,
    tintColor: '#ffffff',
  },
  title: {
    color: '#f4f4f5',
    fontSize: 23,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: '#252535',
    borderRadius: 12,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#09090b',
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryText: {
    color: '#9f9fb0',
    textDecorationLine: 'underline',
  },
});
