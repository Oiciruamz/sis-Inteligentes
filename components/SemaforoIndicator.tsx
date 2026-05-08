import { StyleSheet, Text, View } from 'react-native';

type Props = {
  label: 'Favorable' | 'Moderado' | 'No Favorable';
};

const colorMap: Record<Props['label'], string> = {
  Favorable: '#20d47b',
  Moderado: '#f2b83c',
  'No Favorable': '#ff5c76',
};

export function SemaforoIndicator({ label }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.circle, { borderColor: colorMap[label] }]}>
        <View style={[styles.inner, { backgroundColor: colorMap[label] }]} />
      </View>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
  },
  circle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e0f15',
  },
  inner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    opacity: 0.92,
  },
  text: {
    color: '#f2f2f3',
    fontSize: 18,
    fontWeight: '700',
  },
});
